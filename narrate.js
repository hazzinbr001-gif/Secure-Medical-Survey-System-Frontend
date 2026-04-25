// api/narrate.js — AI-powered report narrative generation
// Uses Groq API (free, no credit card) — falls back to static templates if key not set

import { setCors, ok, badRequest } from '../lib/response.js';
import { requireAdmin } from '../middleware/auth.js';

const GROQ_API_KEY = process.env.GROQ_API_KEY;

export default async function handler(req, res) {
  if (setCors(req, res)) return;

  const user = await requireAdmin(req, res);
  if (!user) return;

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!GROQ_API_KEY) {
    return ok(res, { narrative: null, fallback: true });
  }

  let body;
  try {
    body = req.body && typeof req.body === 'object' ? req.body : JSON.parse(req.body);
  } catch {
    return badRequest(res, 'Invalid JSON body');
  }

  const { report_type, metrics, context } = body;
  if (!report_type || !metrics) return badRequest(res, 'Missing report_type or metrics');

  try {
    const prompt = _buildPrompt(report_type, metrics, context || {});

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + GROQ_API_KEY,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: 2000,
        temperature: 0.7,
        messages: [
          {
            role: 'system',
            content: "You are a professional public health report writer for Kenya's Ministry of Health. Write formal, evidence-based narrative sections for community health survey reports. Use proper academic English. Reference Kenya Health Policy 2014-2030 and SDG 3 where appropriate. Be specific about the numbers and percentages provided. Vary your sentence structure and wording so each report reads uniquely. Return ONLY a valid JSON object — no markdown fences, no preamble, no explanation.",
          },
          { role: 'user', content: prompt },
        ],
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'Groq API error');

    const text = data.choices?.[0]?.message?.content || '';
    let narrative;
    try {
      const clean = text.replace(/```json|```/g, '').trim();
      narrative = JSON.parse(clean);
    } catch {
      narrative = null;
    }

    return ok(res, { narrative, fallback: !narrative });
  } catch (err) {
    console.error('[narrate]', err);
    return ok(res, { narrative: null, fallback: true, error: err.message });
  }
}

function _buildPrompt(report_type, metrics, ctx) {
  const inst   = ctx.institution_name || 'the institution';
  const county = ctx.county           || 'Kisii County';
  const sub    = ctx.sub_county       || 'the sub-county';
  const locs   = ctx.locations        || 'the surveyed communities';
  const period = ctx.period           || 'the survey period';
  const n      = metrics.total_households || metrics.total || 0;
  const ivs    = metrics.total_interviewers || 1;

  const inf = metrics.infrastructure || {};
  const hlt = metrics.health         || {};
  const nut = metrics.nutrition      || {};
  const mat = metrics.maternal_child || {};
  const dq  = metrics.data_quality   || {};

  const latrine  = inf.pct_pit_latrine     ?? 0;
  const water    = inf.pct_water_treated   ?? 0;
  const hiv_aw   = hlt.pct_hiv_aware       ?? 0;
  const hiv_test = hlt.pct_hiv_tested      ?? 0;
  const immunise = mat.pct_immunised       ?? 0;
  const food     = nut.pct_food_sufficient ?? 0;
  const quality  = dq.overall_quality_score ?? 0;

  const hasSubmission = ['group', 'institution', 'national'].includes(report_type);

  return `Write a community health survey report for ${inst}, covering ${n} households in ${locs}, ${sub}, ${county} during ${period}.
Survey details: ${ivs} interviewer(s). Key indicators — Pit latrine: ${latrine}%, Water treated: ${water}%, HIV awareness: ${hiv_aw}%, HIV tested: ${hiv_test}%, Children immunised: ${immunise}%, Food sufficient: ${food}%, Data quality score: ${quality}%.
Report type: ${report_type}.

Return ONLY this JSON object with no markdown:
{
  "executive_summary": "3-4 sentences summarising who conducted the survey, where, when, and the key health picture found",
  "discussion": "3 paragraphs on WASH indicators vs Kenya targets, HIV/AIDS vs UNAIDS benchmarks, and overall community health implications",
  "conclusion": "2 paragraphs — severity of findings and urgency of action, then next steps for health authorities",
  "recommendations_intro": "One formal sentence introducing the recommendations section"${hasSubmission ? `,\n  "submission": "One formal paragraph submitting this report on behalf of ${inst} to the course coordinator and institutional health management team"` : ''}
}`;
}
