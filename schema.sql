-- ══════════════════════════════════════════════════════════════
--  Community Health Survey — Multi-Institution Schema
--  HazzinBR © 2026
--  Run this in: Supabase Dashboard → SQL Editor
-- ══════════════════════════════════════════════════════════════

-- ── 1. INSTITUTIONS TABLE ────────────────────────────────────
CREATE TABLE IF NOT EXISTS institutions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  code        text NOT NULL,
  created_at  timestamptz DEFAULT now(),
  CONSTRAINT institutions_name_key UNIQUE (name),
  CONSTRAINT institutions_code_key UNIQUE (code)
);

-- ── 2. PAYMENTS TABLE ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mpesa_code      text NOT NULL,
  amount          integer NOT NULL,           -- 100 (student) or 500 (institution admin)
  purpose         text NOT NULL,              -- 'user_reg' | 'admin_reg'
  institution_id  uuid REFERENCES institutions(id),
  user_email      text,
  verified        boolean DEFAULT false,
  created_at      timestamptz DEFAULT now(),
  CONSTRAINT payments_mpesa_code_key UNIQUE (mpesa_code)
);

-- ── 3. ALTER EXISTING TABLES ─────────────────────────────────
--  Add institution_id + role + id_number + password_hash to chsa_students
ALTER TABLE chsa_students
  ADD COLUMN IF NOT EXISTS institution_id   uuid REFERENCES institutions(id),
  ADD COLUMN IF NOT EXISTS institution_name text,
  ADD COLUMN IF NOT EXISTS role             text DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS id_number        text,   -- National ID — used for institution admin login & recovery
  ADD COLUMN IF NOT EXISTS password_hash    text;   -- Password for institution admins (plain text — hash in production)
  -- role values: 'user' | 'institution_admin'

--  Add institution_id to health_survey_records
ALTER TABLE health_survey_records
  ADD COLUMN IF NOT EXISTS institution_id uuid REFERENCES institutions(id);

-- ── 4. INDEXES ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_students_institution
  ON chsa_students(institution_id);

CREATE INDEX IF NOT EXISTS idx_records_institution
  ON health_survey_records(institution_id);

CREATE INDEX IF NOT EXISTS idx_payments_institution
  ON payments(institution_id);

CREATE INDEX IF NOT EXISTS idx_payments_mpesa_code
  ON payments(mpesa_code);

-- ── 5. ROW LEVEL SECURITY ────────────────────────────────────
--  NOTE: RLS filtering by institution is enforced in the JS layer
--  (admInstitutionFilter() in survey-payment.js appends
--   &institution_id=eq.{id} to every admin Supabase query).
--
--  If you want DB-level RLS, enable it and add policies.
--  For the anon key pattern used here, JS-layer filtering is
--  sufficient and simpler to maintain.

-- Example RLS (optional — uncomment to enable):
-- ALTER TABLE health_survey_records ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE chsa_students ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "anon_read_all" ON health_survey_records FOR SELECT USING (true);
-- CREATE POLICY "anon_insert_all" ON health_survey_records FOR INSERT WITH CHECK (true);

-- ── 6. QUESTIONNAIRES TABLE ──────────────────────────────────
--  Allows adding new survey forms without code changes.
--  Future use — wire up in survey-core.js when needed.
CREATE TABLE IF NOT EXISTS questionnaires (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  description   text,
  version       text DEFAULT '1.0',
  is_active     boolean DEFAULT true,
  created_by    uuid REFERENCES institutions(id),
  created_at    timestamptz DEFAULT now()
);

-- ── 8. IDENTITY / PHOTO COLUMNS ─────────────────────────────
-- Student photos (URLs from Supabase Storage, written back after sync)
ALTER TABLE chsa_students
  ADD COLUMN IF NOT EXISTS profile_photo_url  text,
  ADD COLUMN IF NOT EXISTS field_photo_url    text;

-- Institution photos
ALTER TABLE institutions
  ADD COLUMN IF NOT EXISTS group_photo_url     text,
  ADD COLUMN IF NOT EXISTS map_screenshot_url  text;

-- Run this to confirm all columns exist:
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name IN ('institutions','payments','chsa_students','health_survey_records','questionnaires')
ORDER BY table_name, ordinal_position;
