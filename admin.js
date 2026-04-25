// api/admin.js — Consolidated admin handler
// Routes:
//   GET  /api/admin/dashboard
//   GET  /api/admin/interventions
//   PATCH /api/admin/interventions
//   POST /api/admin/escalate
//   GET  /api/admin/records
//   PATCH /api/admin/records
//   DELETE /api/admin/records
//   GET  /api/admin/students
//   PATCH /api/admin/students
//   DELETE /api/admin/students  (super_admin only)
//   GET  /api/admin/profile     (institution_admin scoped to own institution)
//   POST /api/admin/profile     (institution_admin scoped to own institution)
//   POST /api/admin/upload-image
//   GET  /api/admin/villages
//   POST /api/admin/villages
//   GET  /api/admin/villages-all

import { dbSelect, dbInsert, dbUpdate, dbDelete } from '../lib/supabase.js';
import { requireAdmin, requireSuperAdmin } from '../middleware/auth.js';
import { escalateOverdue, scheduleIntervention } from '../lib/interventionScheduler.js';
import { logEvent } from '../lib/logger.js';
import { setCors, ok, badRequest, notFound, forbidden, serverError, parseBody } from '../lib/response.js';

const CRON_SECRET         = process.env.CRON_SECRET;
const INTERVENTIONS_TABLE = 'interventions';
const STUDENTS_TABLE      = 'chsa_students';
const VALID_STATUSES      = ['open', 'in_progress', 'resolved', 'cancelled'];

async function handleDashboard(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  // institution_admin can also call dashboard — they just see their own institution
  const user = await requireAdmin(req, res);
  if (!user) return;

  // Super admin sees everything; institution_admin is scoped to their institution_id
  const isSuperAdmin   = user.role === 'super_admin';
  const instFilter     = isSuperAdmin ? '' : `institution_id=eq.${encodeURIComponent(user.institution_id)}`;
  const instFilterAmp  = instFilter ? `${instFilter}&` : '';

  try {
    const [institutions, records, insights, interventions, events] = await Promise.all([
      isSuperAdmin
        ? dbSelect('institutions', '', 'id,name,code,created_at')
        : dbSelect('institutions', `id=eq.${encodeURIComponent(user.institution_id)}`, 'id,name,code,created_at'),
      dbSelect('health_survey_records', `${instFilterAmp}select=id,institution_id,risk_score,risk_level,submitted_at,report_generated_at`, 'id,institution_id,risk_score,risk_level,submitted_at,report_generated_at'),
      dbSelect('ai_insights',           '', 'id,record_id,household_risk_score,anomalies_detected,created_at'),
      dbSelect('interventions',         `${instFilterAmp}status=in.(open,in_progress,overdue)&order=priority.asc`, 'id,institution_id,household_id,risk_level,status,due_date,priority'),
      isSuperAdmin
        ? dbSelect('events_log', 'order=timestamp.desc', 'id,event_type,institution_id,timestamp').catch(() => [])
        : dbSelect('events_log', `${instFilterAmp}order=timestamp.desc`, 'id,event_type,institution_id,timestamp').catch(() => []),
    ]);

    const scores  = records.filter(r => r.risk_score != null).map(r => parseFloat(r.risk_score));
    const avgRisk = scores.length ? parseFloat((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)) : null;
    const cutoff30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const systemStats = {
      total_institutions: institutions.length,
      total_records: records.length,
      scored_records: records.filter(r => r.risk_score != null).length,
      avg_risk_score: avgRisk,
      total_reports: records.filter(r => r.report_generated_at).length,
      total_anomalies: insights.filter(i => i.anomalies_detected).length,
      open_interventions: interventions.filter(i => i.status === 'open').length,
      overdue_interventions: interventions.filter(i => i.status === 'overdue').length,
      risk_distribution: {
        critical: records.filter(r => r.risk_level === 'critical').length,
        high:     records.filter(r => r.risk_level === 'high').length,
        medium:   records.filter(r => r.risk_level === 'medium').length,
        low:      records.filter(r => r.risk_level === 'low').length,
        unscored: records.filter(r => !r.risk_score).length,
      },
    };

    const institutionSummaries = institutions.map(inst => {
      const instRecords = records.filter(r => r.institution_id === inst.id);
      const instScores  = instRecords.filter(r => r.risk_score).map(r => parseFloat(r.risk_score));
      const instAvg     = instScores.length ? parseFloat((instScores.reduce((a, b) => a + b, 0) / instScores.length).toFixed(2)) : null;
      const instInts    = interventions.filter(i => i.institution_id === inst.id);
      return {
        id: inst.id, name: inst.name, code: inst.code,
        total_records: instRecords.length, avg_risk_score: instAvg,
        critical_count: instRecords.filter(r => r.risk_level === 'critical').length,
        high_count:     instRecords.filter(r => r.risk_level === 'high').length,
        open_interventions:    instInts.filter(i => i.status === 'open').length,
        overdue_interventions: instInts.filter(i => i.status === 'overdue').length,
        records_last_30d: instRecords.filter(r => r.submitted_at >= cutoff30d).length,
        created_at: inst.created_at,
      };
    }).sort((a, b) => (b.avg_risk_score || 0) - (a.avg_risk_score || 0));

    const urgentInterventions = interventions
      .filter(i => i.status === 'overdue' || i.priority === 1).slice(0, 20)
      .map(i => ({ ...i, institution_name: institutions.find(inst => inst.id === i.institution_id)?.name || 'Unknown' }));

    const recentActivity = events.slice(0, 50).map(e => ({
      event_type:       e.event_type,
      institution_name: institutions.find(i => i.id === e.institution_id)?.name || null,
      timestamp:        e.timestamp,
    }));

    return ok(res, { generated_at: new Date().toISOString(), system_stats: systemStats, institutions: institutionSummaries, urgent_interventions: urgentInterventions, recent_activity: recentActivity });
  } catch (err) {
    console.error('[admin/dashboard]', err);
    return serverError(res, 'Dashboard failed');
  }
}

async function handleInterventions(req, res) {
  const user = await requireAdmin(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    try {
      const institutionId = user.role === 'super_admin' && req.query.institution_id ? req.query.institution_id : user.institution_id;
      const statusFilter  = req.query.status ? `&status=eq.${req.query.status}` : '';
      const rows = await dbSelect(INTERVENTIONS_TABLE, `institution_id=eq.${encodeURIComponent(institutionId)}${statusFilter}&order=priority.asc,due_date.asc`);
      const now  = new Date();
      const enriched = rows.map(r => ({
        ...r,
        is_overdue:     r.due_date && new Date(r.due_date) < now && r.status !== 'resolved',
        days_until_due: r.due_date ? Math.ceil((new Date(r.due_date) - now) / 86400000) : null,
      }));
      return ok(res, { interventions: enriched, total: enriched.length });
    } catch (err) {
      return serverError(res, 'Failed to list interventions');
    }
  }

  if (req.method === 'PATCH') {
    const body = await parseBody(req, res);
    if (!body) return;
    const { id } = req.query;
    if (!id) return badRequest(res, 'Missing intervention id');
    try {
      const rows = await dbSelect(INTERVENTIONS_TABLE, `id=eq.${encodeURIComponent(id)}`);
      if (!rows.length) return notFound(res, 'Intervention not found');
      const item = rows[0];
      if (user.role === 'institution_admin' && item.institution_id !== user.institution_id)
        return forbidden(res, 'Access denied');

      const patch = { updated_at: new Date().toISOString() };
      if (body.status) {
        if (!VALID_STATUSES.includes(body.status)) return badRequest(res, `Invalid status. Must be: ${VALID_STATUSES.join(', ')}`);
        patch.status = body.status;
        if (body.status === 'resolved') patch.resolved_at = new Date().toISOString();
      }
      if (body.assigned_to) patch.assigned_to = body.assigned_to;
      if (body.notes)       patch.notes       = body.notes;
      if (body.due_date)    patch.due_date    = body.due_date;

      await dbUpdate(INTERVENTIONS_TABLE, `id=eq.${encodeURIComponent(id)}`, patch);
      logEvent('intervention.update', { user_id: user.user_id, institution_id: item.institution_id, record_id: item.record_id, message: `Intervention ${id} updated` });
      return ok(res, { updated: true, id });
    } catch (err) {
      return serverError(res, 'Failed to update intervention');
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

async function handleEscalate(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const cronHeader = req.headers['x-cron-secret'];
  if (!cronHeader || cronHeader !== CRON_SECRET) {
    const user = await requireSuperAdmin(req, res);
    if (!user) return;
  }

  try {
    const escalation = await escalateOverdue();
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const recentHighRisk = await dbSelect('health_survey_records', `risk_level=in.(critical,high)&submitted_at=gte.${cutoff}`, 'id,household_id,institution_id,risk_score,risk_level,survey_data,ai_flags');

    let scheduled = 0;
    for (const record of recentHighRisk) {
      const riskResult = { risk_score: record.risk_score, risk_level: record.risk_level, ai_flags: record.ai_flags || [], risk_breakdown: {}, anomalies_detected: record.risk_score >= 7.5 };
      const insights   = await dbSelect('ai_insights', `record_id=eq.${record.id}`, 'recommendations');
      const result     = await scheduleIntervention({ record, riskResult, insight: insights[0] || null });
      if (result?.created) scheduled++;
    }

    logEvent('cron.escalate', { message: `Escalation cron: ${escalation.escalated_count} escalated, ${scheduled} new interventions scheduled` });
    return ok(res, { escalated_overdue: escalation.escalated_count, newly_scheduled: scheduled, high_risk_reviewed: recentHighRisk.length });
  } catch (err) {
    console.error('[admin/escalate]', err);
    return serverError(res, 'Escalation cron failed');
  }
}

// ── GET /api/admin/records — list survey records for the admin panel ──────────
async function handleRecords(req, res) {
  const user = await requireAdmin(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    try {
      const institutionId = user.role === 'super_admin' && req.query.institution_id
        ? req.query.institution_id
        : user.institution_id;
      const filter = institutionId
        ? `institution_id=eq.${encodeURIComponent(institutionId)}&order=submitted_at.desc&limit=500`
        : 'order=submitted_at.desc&limit=500';
      const records = await dbSelect('health_survey_records', filter);
      return ok(res, { records, total: records.length });
    } catch (err) {
      console.error('[admin/records GET]', err);
      return serverError(res, 'Failed to fetch records');
    }
  }

  if (req.method === 'PATCH') {
    const body = await parseBody(req, res);
    if (!body) return;
    const { id } = req.query;
    if (!id) return badRequest(res, 'Missing record id');
    try {
      const rows = await dbSelect('health_survey_records', `id=eq.${encodeURIComponent(id)}`, 'id,institution_id');
      if (!rows.length) return notFound(res, 'Record not found');
      if (user.role === 'institution_admin' && rows[0].institution_id !== user.institution_id)
        return forbidden(res, 'Access denied');
      const patch = {};
      if (body.needs_correction !== undefined) patch.needs_correction = body.needs_correction;
      if (body.correction_notes !== undefined) patch.correction_notes = body.correction_notes;
      patch.updated_at = new Date().toISOString();
      await dbUpdate('health_survey_records', `id=eq.${encodeURIComponent(id)}`, patch);
      logEvent('admin.record.patch', { user_id: user.user_id, institution_id: user.institution_id, record_id: id, message: 'Record correction flag updated' });
      return ok(res, { updated: true, id });
    } catch (err) {
      console.error('[admin/records PATCH]', err);
      return serverError(res, 'Failed to update record');
    }
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return badRequest(res, 'Missing record id');
    try {
      const rows = await dbSelect('health_survey_records', `id=eq.${encodeURIComponent(id)}`, 'id,institution_id');
      if (!rows.length) return notFound(res, 'Record not found');
      if (user.role === 'institution_admin' && rows[0].institution_id !== user.institution_id)
        return forbidden(res, 'Access denied');
      await dbDelete('health_survey_records', `id=eq.${encodeURIComponent(id)}`);
      logEvent('admin.record.delete', { user_id: user.user_id, institution_id: user.institution_id, record_id: id, message: 'Record deleted by admin' });
      return ok(res, { deleted: true, id });
    } catch (err) {
      console.error('[admin/records DELETE]', err);
      return serverError(res, 'Failed to delete record');
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// ── GET /api/admin/students — list students (enumerators) ────────────────────
async function handleStudents(req, res) {
  const user = await requireAdmin(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    try {
      const institutionId = user.role === 'super_admin' && req.query.institution_id
        ? req.query.institution_id
        : user.institution_id;
      const filter = institutionId
        ? `institution_id=eq.${encodeURIComponent(institutionId)}&order=created_at.desc`
        : 'order=created_at.desc';
      const students = await dbSelect(STUDENTS_TABLE, filter, 'id,full_name,email,reg_number,id_number,role,status,institution_id,profile_photo_url,created_at');
      return ok(res, { students, total: students.length });
    } catch (err) {
      console.error('[admin/students GET]', err);
      return serverError(res, 'Failed to fetch students');
    }
  }

  if (req.method === 'PATCH') {
    const body = await parseBody(req, res);
    if (!body) return;
    const { id } = req.query;
    const reg_number = body.reg_number || req.query.reg_number;
    if (!id && !reg_number) return badRequest(res, 'Missing id or reg_number');
    try {
      const filterPart = id
        ? `id=eq.${encodeURIComponent(id)}`
        : `reg_number=eq.${encodeURIComponent(reg_number)}`;
      const rows = await dbSelect(STUDENTS_TABLE, filterPart, 'id,institution_id,status');
      if (!rows.length) return notFound(res, 'Student not found');
      if (user.role === 'institution_admin' && rows[0].institution_id !== user.institution_id)
        return forbidden(res, 'Access denied');
      const patch = { updated_at: new Date().toISOString() };
      // Allowed fields for institution_admin; super_admin may also change role
      const allowed = ['status', 'full_name', 'email', 'phone',
                       'profile_photo_url', 'field_photo_1_url', 'field_photo_2_url'];
      if (user.role === 'super_admin') allowed.push('institution_id', 'role');
      for (const key of allowed) {
        if (body[key] !== undefined) patch[key] = body[key];
      }
      await dbUpdate(STUDENTS_TABLE, filterPart, patch);
      logEvent('admin.student.patch', { user_id: user.user_id, institution_id: user.institution_id, message: `Student ${id || reg_number} updated` });
      return ok(res, { updated: true });
    } catch (err) {
      console.error('[admin/students PATCH]', err);
      return serverError(res, 'Failed to update student');
    }
  }

  if (req.method === 'DELETE') {
    if (user.role !== 'super_admin') return forbidden(res, 'Super admin only');
    const { reg_number, id } = req.query;
    if (!reg_number && !id) return badRequest(res, 'Missing reg_number or id');
    try {
      const filterPart = id
        ? `id=eq.${encodeURIComponent(id)}`
        : `reg_number=eq.${encodeURIComponent(reg_number)}`;
      const rows = await dbSelect(STUDENTS_TABLE, filterPart, 'id,reg_number');
      if (!rows.length) return notFound(res, 'Student not found');
      await dbDelete(STUDENTS_TABLE, filterPart);
      logEvent('admin.student.delete', { user_id: user.user_id, message: `Student ${id || reg_number} deleted` });
      return ok(res, { deleted: true });
    } catch (err) {
      console.error('[admin/students DELETE]', err);
      return serverError(res, 'Failed to delete student');
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// ── GET/POST /api/admin/institutions — list or add institutions ──────────────
// GET  — public (no auth required) — used to populate registration dropdown
// POST — super_admin only — create a new institution
async function handleInstitutions(req, res) {
  if (req.method === 'GET') {
    // No auth required — students need this to pick their institution at registration
    try {
      const rows = await dbSelect('institutions', 'order=name.asc', 'id,name,code');
      return ok(res, { institutions: rows });
    } catch (err) {
      console.error('[admin/institutions GET]', err);
      return serverError(res, 'Failed to fetch institutions');
    }
  }

  if (req.method === 'POST') {
    const user = await requireSuperAdmin(req, res);
    if (!user) return;
    const body = await parseBody(req, res);
    if (!body) return;
    const { name, code } = body;
    if (!name || !name.trim()) return badRequest(res, 'Institution name is required');
    if (!code || !code.trim()) return badRequest(res, 'Institution code is required');
    try {
      const [row] = await dbInsert('institutions', {
        name: name.trim(),
        code: code.trim().toUpperCase(),
      });
      logEvent('institution.create', { user_id: user.user_id, message: `Institution created: ${name}` });
      return ok(res, { institution: row });
    } catch (err) {
      console.error('[admin/institutions POST]', err);
      if (err.message?.includes('unique') || err.message?.includes('duplicate')) {
        return res.status(409).json({ error: 'Institution name or code already exists' });
      }
      return serverError(res, 'Failed to create institution');
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// ── POST /api/admin?action=upload-image — upload image to Supabase Storage ───
//
// REQUIRED SQL / Storage setup (run once in Supabase dashboard):
// ─────────────────────────────────────────────────────────────────────────────
// 1. In Supabase Storage, create a bucket named: survey-images
//    Set it to PUBLIC (so URLs work directly in reports).
// 2. Add these columns (if not already present):
//    ALTER TABLE chsa_students ADD COLUMN IF NOT EXISTS profile_photo_url text;
//    ALTER TABLE chsa_students ADD COLUMN IF NOT EXISTS field_photo_1_url  text;
//    ALTER TABLE chsa_students ADD COLUMN IF NOT EXISTS field_photo_2_url  text;
//    ALTER TABLE health_survey_records ADD COLUMN IF NOT EXISTS field_photo_1_url text;
//    ALTER TABLE health_survey_records ADD COLUMN IF NOT EXISTS field_photo_2_url text;
// ─────────────────────────────────────────────────────────────────────────────
//
// POST body (multipart/form-data OR JSON base64):
//   { image_base64: "data:image/jpeg;base64,/9j/...", folder: "profiles"|"evidence", filename: "abc.jpg" }
// Returns: { url: "https://..." }
async function handleImageUpload(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SUPABASE_URL         = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return serverError(res, 'Storage not configured');
  }

  const body = await parseBody(req, res);
  if (!body) return;

  const { image_base64, folder = 'evidence', filename } = body;
  if (!image_base64) return badRequest(res, 'image_base64 is required');

  // Parse base64 data URI
  const matches = image_base64.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) return badRequest(res, 'Invalid base64 image format');

  const contentType = matches[1]; // e.g. image/jpeg
  const base64Data  = matches[2];
  const buffer      = Buffer.from(base64Data, 'base64');
  const ext         = contentType.split('/')[1] || 'jpg';
  const safeFilename = filename || `${folder}_${Date.now()}.${ext}`;
  const storagePath  = `${folder}/${safeFilename}`;

  try {
    const uploadRes = await fetch(
      `${SUPABASE_URL}/storage/v1/object/survey-images/${storagePath}`,
      {
        method:  'POST',
        headers: {
          'Authorization':  `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type':   contentType,
          'x-upsert':       'true',
        },
        body: buffer,
      }
    );

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      console.error('[upload-image]', err);
      return serverError(res, 'Upload failed');
    }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/survey-images/${storagePath}`;
    logEvent('image.upload', { message: `Uploaded ${storagePath}` });
    return ok(res, { url: publicUrl });
  } catch (err) {
    console.error('[upload-image]', err);
    return serverError(res, 'Upload error');
  }
}

// ── GET /api/admin?action=villages-all — ALL villages for student dropdown ───
// Unlike the original villages GET (which requires ≥10 uses), this returns
// ALL villages for a given institution so students can pick from admin's list.
async function handleVillagesAll(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const institution_id = req.query.institution_id;
  if (!institution_id) return badRequest(res, 'institution_id is required');
  try {
    const rows = await dbSelect(
      'villages',
      `institution_id=eq.${encodeURIComponent(institution_id)}&order=village_name.asc&limit=500`,
      'village_name'
    );
    return ok(res, { villages: rows.map(r => r.village_name) });
  } catch (err) {
    console.error('[admin/villages-all GET]', err);
    return serverError(res, 'Failed to fetch villages');
  }
}

// ── GET/POST /api/admin?action=villages — village name registry ──────────────
//
// REQUIRED SQL (run once in Supabase SQL editor):
// ─────────────────────────────────────────────────────────────────────────────
// CREATE TABLE IF NOT EXISTS villages (
//   id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
//   institution_id text NOT NULL,
//   village_name   text NOT NULL,
//   ward           text,
//   use_count      integer NOT NULL DEFAULT 1,
//   created_by     text,
//   created_at     timestamptz NOT NULL DEFAULT now(),
//   UNIQUE (institution_id, village_name)
// );
// CREATE INDEX IF NOT EXISTS villages_institution_idx ON villages (institution_id);
// ALTER TABLE villages ENABLE ROW LEVEL SECURITY;
// CREATE POLICY "service role full access" ON villages USING (true) WITH CHECK (true);
// ─────────────────────────────────────────────────────────────────────────────
//
// GET  ?action=villages&institution_id=X
//        → { popular: ['VillageName', ...] }   (villages with use_count >= 10)
// POST ?action=villages  body: { institution_id, village_name, ward?, created_by? }
//        → upsert village + increment use_count
//        → { village_name, use_count, is_popular }
async function handleVillages(req, res) {
  if (req.method === 'GET') {
    // No strict auth — enumerators need popular villages while filling survey
    const institution_id = req.query.institution_id;
    if (!institution_id) return badRequest(res, 'institution_id is required');
    try {
      const rows = await dbSelect(
        'villages',
        `institution_id=eq.${encodeURIComponent(institution_id)}&use_count=gte.10&order=use_count.desc&limit=200`,
        'village_name,use_count'
      );
      return ok(res, { popular: rows.map(r => r.village_name) });
    } catch (err) {
      console.error('[admin/villages GET]', err);
      return serverError(res, 'Failed to fetch villages');
    }
  }

  if (req.method === 'POST') {
    const body = await parseBody(req, res);
    if (!body) return;
    const { institution_id, village_name, ward, created_by } = body;
    if (!institution_id) return badRequest(res, 'institution_id is required');
    if (!village_name || !village_name.trim()) return badRequest(res, 'village_name is required');

    try {
      // Try to fetch existing row first
      const existing = await dbSelect(
        'villages',
        `institution_id=eq.${encodeURIComponent(institution_id)}&village_name=eq.${encodeURIComponent(village_name.trim())}`,
        'id,use_count'
      );

      let use_count;
      if (existing.length) {
        // Increment use_count
        use_count = existing[0].use_count + 1;
        await dbUpdate(
          'villages',
          `id=eq.${encodeURIComponent(existing[0].id)}`,
          { use_count, ...(ward ? { ward } : {}) }
        );
      } else {
        // Insert new
        use_count = 1;
        await dbInsert('villages', {
          institution_id,
          village_name: village_name.trim(),
          ...(ward        ? { ward }        : {}),
          ...(created_by  ? { created_by }  : {}),
        });
      }

      logEvent('village.learn', {
        institution_id,
        message: `Village "${village_name.trim()}" use_count=${use_count}`,
      });

      return ok(res, {
        village_name: village_name.trim(),
        use_count,
        is_popular: use_count >= 10,
      });
    } catch (err) {
      console.error('[admin/villages POST]', err);
      return serverError(res, 'Failed to save village');
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// ── GET/POST /api/admin?action=profile — institution profile ─────────────────
//
// GET  ?action=profile&institution_id=X  — returns the profile row (super_admin
//      may pass any institution_id; institution_admin is scoped to their own).
// POST ?action=profile  body: { ...profileFields }  — upsert the profile row.
//
// REQUIRED SQL (run once in Supabase SQL editor if not already created):
// ─────────────────────────────────────────────────────────────────────────────
// CREATE TABLE IF NOT EXISTS institution_profiles (
//   institution_id   text PRIMARY KEY,
//   inst_name        text,
//   admin_name       text,
//   contact_email    text,
//   contact_phone    text,
//   county           text,
//   sub_county       text,
//   ward             text,
//   village          text,
//   gps              text,
//   max_students     integer DEFAULT 0,
//   survey_enabled   boolean DEFAULT true,
//   cover_image      text,
//   logo_image       text,
//   village_list     jsonb DEFAULT '[]',
//   login_date       text,
//   updated_at       timestamptz NOT NULL DEFAULT now()
// );
// ALTER TABLE institution_profiles ENABLE ROW LEVEL SECURITY;
// CREATE POLICY "service role full access" ON institution_profiles USING (true) WITH CHECK (true);
// ─────────────────────────────────────────────────────────────────────────────
async function handleProfile(req, res) {
  const user = await requireAdmin(req, res);
  if (!user) return;

  // Parse body ONCE up front for both GET and POST
  let body = null;
  if (req.method === 'POST') {
    body = await parseBody(req, res);
    if (!body) return; // parseBody already sent 400
  }

  // institution_id: query string takes priority, then body
  const requestedId = req.query.institution_id || body?.institution_id || null;
  const institution_id = user.role === 'super_admin'
    ? (requestedId || null)
    : user.institution_id;

  if (!institution_id) return badRequest(res, 'institution_id is required');

  // institution_admin must not access another institution's profile
  if (user.role === 'institution_admin' && institution_id !== user.institution_id) {
    return forbidden(res, 'Access denied');
  }

  if (req.method === 'GET') {
    try {
      const rows = await dbSelect('institution_profiles', `institution_id=eq.${encodeURIComponent(institution_id)}`);
      logEvent('admin.profile.read', { user_id: user.user_id, institution_id, message: `Profile read by ${user.role}` });
      return ok(res, rows[0] || {});
    } catch (err) {
      const detail = err?.data ? JSON.stringify(err.data) : err.message;
      console.error('[admin/profile GET]', detail);
      logEvent('admin.profile.read.failed', { user_id: user.user_id, institution_id, message: `Profile read failed: ${detail}` });
      return serverError(res, 'Failed to fetch profile');
    }
  }

  if (req.method === 'POST') {
    // Strip controlled fields from body
    const {
      institution_id: _ignored,
      cover_image,
      logo_image,
      updated_at: _ts,
      ...rest
    } = body;

    // Ensure village_list is always a clean array for Supabase jsonb.
    if (rest.village_list !== undefined) {
      if (typeof rest.village_list === 'string') {
        try { rest.village_list = JSON.parse(rest.village_list); } catch { rest.village_list = []; }
      }
      if (!Array.isArray(rest.village_list)) rest.village_list = [];
    }

    // Only keep image fields when they are real URLs, not raw base64 blobs
    const isUrl = v => typeof v === 'string' && (v.startsWith('http') || v.startsWith('/'));
    const patch = {
      ...rest,
      institution_id,
      ...(cover_image && isUrl(cover_image) ? { cover_image } : {}),
      ...(logo_image  && isUrl(logo_image)  ? { logo_image  } : {}),
      updated_at: new Date().toISOString(),
    };

    const savedFields = Object.keys(patch).filter(k => k !== 'institution_id' && k !== 'updated_at');
    const villageCount = Array.isArray(patch.village_list) ? patch.village_list.length : 0;

    console.log(`[admin/profile POST] institution=${institution_id} user=${user.user_id} role=${user.role} fields=[${savedFields.join(',')}] villages=${villageCount}`);

    try {
      const existing = await dbSelect('institution_profiles', `institution_id=eq.${encodeURIComponent(institution_id)}`, 'institution_id');
      const isNew = !existing.length;
      if (!isNew) {
        await dbUpdate('institution_profiles', `institution_id=eq.${encodeURIComponent(institution_id)}`, patch);
      } else {
        await dbInsert('institution_profiles', patch);
      }
      logEvent('admin.profile.upsert', {
        user_id: user.user_id,
        institution_id,
        message: `Profile ${isNew ? 'created' : 'updated'} by ${user.role} — fields: ${savedFields.join(', ')} — villages: ${villageCount}`,
        metadata: {
          action: isNew ? 'insert' : 'update',
          fields_saved: savedFields,
          village_count: villageCount,
          inst_name: patch.inst_name || null,
        },
      });
      return ok(res, { updated: true, institution_id });
    } catch (err) {
      const detail = err?.data ? JSON.stringify(err.data) : err.message;
      console.error('[admin/profile POST] Supabase error:', detail);
      logEvent('admin.profile.upsert.failed', {
        user_id: user.user_id,
        institution_id,
        message: `Profile save failed: ${detail}`,
        metadata: { fields_attempted: savedFields, error: detail },
      });
      return serverError(res, `Failed to save profile: ${detail}`);
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

export default async function handler(req, res) {
  if (setCors(req, res)) return;
  const { action } = req.query;
  if (action === 'dashboard')     return handleDashboard(req, res);
  if (action === 'interventions') return handleInterventions(req, res);
  if (action === 'escalate')      return handleEscalate(req, res);
  if (action === 'records')       return handleRecords(req, res);
  if (action === 'students')      return handleStudents(req, res);
  if (action === 'institutions')  return handleInstitutions(req, res);
  if (action === 'villages')      return handleVillages(req, res);
  if (action === 'villages-all')  return handleVillagesAll(req, res);
  if (action === 'upload-image')  return handleImageUpload(req, res);
  if (action === 'profile')       return handleProfile(req, res);
  return res.status(404).json({ error: 'Unknown admin route' });
}
