-- ============================================================
-- CARENETRA — PostgreSQL Schema
-- Mirrors backend/app/models/models.py (SQLAlchemy 2.0)
-- 14 tables + 9 native enum types
--
-- USAGE (from backend/):
--   psql "<DATABASE_URL from .env>" -f db/schema.sql
--
-- ⚠️ This is a RESET script: it DROPS existing objects first.
--    To run non-destructively, delete the DROP block below.
-- ============================================================

-- ─────────────────────────────────────────────
-- 0. DROP existing objects (reverse dependency order)
-- ─────────────────────────────────────────────
DROP TABLE IF EXISTS monitoring_schedules CASCADE;
DROP TABLE IF EXISTS agent_sessions CASCADE;
DROP TABLE IF EXISTS doctor_messages CASCADE;
DROP TABLE IF EXISTS alerts CASCADE;
DROP TABLE IF EXISTS wound_analyses CASCADE;
DROP TABLE IF EXISTS risk_scores CASCADE;
DROP TABLE IF EXISTS check_ins CASCADE;
DROP TABLE IF EXISTS medications CASCADE;
DROP TABLE IF EXISTS medical_courses CASCADE;
DROP TABLE IF EXISTS impact_alerts CASCADE;
DROP TABLE IF EXISTS volunteer_profiles CASCADE;
DROP TABLE IF EXISTS doctor_profiles CASCADE;
DROP TABLE IF EXISTS patient_profiles CASCADE;
DROP TABLE IF EXISTS users CASCADE;

DROP TYPE IF EXISTS impactalertstatus CASCADE;
DROP TYPE IF EXISTS woundseverity CASCADE;
DROP TYPE IF EXISTS inputtype CASCADE;
DROP TYPE IF EXISTS conditiontype CASCADE;
DROP TYPE IF EXISTS coursestatus CASCADE;
DROP TYPE IF EXISTS alerttype CASCADE;
DROP TYPE IF EXISTS alertstatus CASCADE;
DROP TYPE IF EXISTS risktier CASCADE;
DROP TYPE IF EXISTS userrole CASCADE;

-- ─────────────────────────────────────────────
-- 1. ENUM TYPES
-- Labels MUST match the Python enum NAMES (the code filters on these).
-- ─────────────────────────────────────────────

CREATE TYPE userrole            AS ENUM ('PATIENT', 'DOCTOR', 'VOLUNTEER', 'RELATIVE');
CREATE TYPE risktier            AS ENUM ('GREEN', 'YELLOW', 'ORANGE', 'RED', 'EMERGENCY');
CREATE TYPE alertstatus         AS ENUM ('PENDING', 'ACKNOWLEDGED', 'DISPATCHED', 'DISMISSED');
CREATE TYPE alerttype           AS ENUM ('NUDGE', 'DOCTOR', 'CRITICAL', 'EMERGENCY');
CREATE TYPE coursestatus        AS ENUM ('ACTIVE', 'COMPLETED', 'PAUSED');
CREATE TYPE conditiontype       AS ENUM (
    'POST_CARDIAC_SURGERY',
    'ASTHMA_RESPIRATORY',
    'DIABETES_MANAGEMENT',
    'GENERAL_POST_SURGERY',
    'POST_SURGERY',
    'POST_KIDNEY_TRANSPLANT'
);
CREATE TYPE inputtype           AS ENUM ('VOICE', 'TEXT', 'AGENT');
CREATE TYPE woundseverity       AS ENUM ('NORMAL', 'MILD', 'MODERATE', 'SEVERE');
CREATE TYPE impactalertstatus   AS ENUM ('ACTIVE', 'RESPONDING', 'RESOLVED');

-- ─────────────────────────────────────────────
-- 2. TABLE 1: users
-- ─────────────────────────────────────────────
CREATE TABLE users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name     VARCHAR(255) NOT NULL,
    role          userrole     NOT NULL,
    unique_uid    VARCHAR(20)  UNIQUE,          -- shareable patient ID "CNT-XXXXX"
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────
-- 3. TABLE 2: patient_profiles
-- ─────────────────────────────────────────────
CREATE TABLE patient_profiles (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                  UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    date_of_birth            VARCHAR(20),
    blood_group              VARCHAR(10),
    emergency_contact_name   VARCHAR(255),
    emergency_contact_phone  VARCHAR(30),
    emergency_contact_email  VARCHAR(255),
    profile_picture_url      VARCHAR(500),
    allow_agent_mic_control  BOOLEAN NOT NULL DEFAULT TRUE,
    preferred_language       VARCHAR(10) NOT NULL DEFAULT 'en',
    social_memory            JSON,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Live Neon migration (create_all() never alters existing tables):
--   ALTER TABLE patient_profiles
--     ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(10) NOT NULL DEFAULT 'en',
--     ADD COLUMN IF NOT EXISTS social_memory JSON;

-- ─────────────────────────────────────────────
-- 4. TABLE 3: doctor_profiles
-- ─────────────────────────────────────────────
CREATE TABLE doctor_profiles (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    specialization         VARCHAR(255),
    hospital_name          VARCHAR(255),
    phone                  VARCHAR(30),
    medical_license_number VARCHAR(100),
    profile_picture_url    VARCHAR(500),
    notify_email_high_risk BOOLEAN NOT NULL DEFAULT TRUE,
    notify_sms_critical    BOOLEAN NOT NULL DEFAULT TRUE,
    notify_inapp_emergency BOOLEAN NOT NULL DEFAULT TRUE,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────
-- 5. TABLE 4: volunteer_profiles
-- ─────────────────────────────────────────────
CREATE TABLE volunteer_profiles (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    phone             VARCHAR(30),
    area_description  VARCHAR(255),              -- e.g. "Andheri West, Mumbai"
    is_available      BOOLEAN NOT NULL DEFAULT TRUE,
    current_latitude  DOUBLE PRECISION,
    current_longitude DOUBLE PRECISION,
    last_active_at    TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TYPE relationshiptype AS ENUM ('DAUGHTER', 'SON', 'FRIEND', 'OTHER');

CREATE TABLE relative_profiles (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    patient_id        UUID NOT NULL REFERENCES patient_profiles(id) ON DELETE CASCADE,
    relationship_type relationshiptype NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────
-- 6. TABLE 5: impact_alerts
-- Crash/impact alerts reported by patients, responded to by volunteers.
-- ─────────────────────────────────────────────
CREATE TABLE impact_alerts (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reported_by_name       VARCHAR(255) NOT NULL DEFAULT 'Unknown',
    reported_by_phone      VARCHAR(30),
    reported_by_user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
    latitude               DOUBLE PRECISION,
    longitude              DOUBLE PRECISION,
    initial_latitude       DOUBLE PRECISION,
    initial_longitude      DOUBLE PRECISION,
    location_label         VARCHAR(500),          -- e.g. "12.97160° N, 77.59460° E"
    maps_url               VARCHAR(500),          -- Google Maps link
    status                 impactalertstatus NOT NULL DEFAULT 'ACTIVE',
    responder_volunteer_id UUID REFERENCES volunteer_profiles(id) ON DELETE SET NULL,
    responder_user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
    responder_name         VARCHAR(255),
    responded_at           TIMESTAMPTZ,
    resolved_at            TIMESTAMPTZ,
    volunteers_notified    INTEGER NOT NULL DEFAULT 0,
    sms_sent               BOOLEAN NOT NULL DEFAULT FALSE,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────
-- 7. TABLE 6: medical_courses
-- Treatment plan created by a doctor, assigned to a patient.
-- ─────────────────────────────────────────────
CREATE TABLE medical_courses (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id         UUID NOT NULL REFERENCES doctor_profiles(id) ON DELETE CASCADE,
    patient_id        UUID REFERENCES patient_profiles(id) ON DELETE CASCADE,  -- NULL until assigned
    course_name       VARCHAR(255) NOT NULL,
    condition_type    conditiontype NOT NULL,
    status            coursestatus NOT NULL DEFAULT 'ACTIVE',
    start_date        VARCHAR(20) NOT NULL,      -- "2026-01-01" (parsed in app)
    end_date          VARCHAR(20) NOT NULL,
    notes_for_patient TEXT,
    patient_context   TEXT,                      -- context handed to the LLM agents
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────
-- 8. TABLE 7: medications
-- ─────────────────────────────────────────────
CREATE TABLE medications (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id             UUID NOT NULL REFERENCES medical_courses(id) ON DELETE CASCADE,
    name                  VARCHAR(255) NOT NULL,
    dosage                VARCHAR(100) NOT NULL, -- e.g. "500mg"
    frequency             VARCHAR(100) NOT NULL, -- e.g. "Twice daily"
    time_of_day           VARCHAR(200),          -- e.g. "8 AM, 8 PM"
    special_instructions  TEXT,
    is_active             BOOLEAN NOT NULL DEFAULT TRUE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────
-- 9. TABLE 8: check_ins
-- Every patient health submission — voice, text, or agent-guided.
-- ─────────────────────────────────────────────
CREATE TABLE check_ins (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id               UUID NOT NULL REFERENCES patient_profiles(id) ON DELETE CASCADE,
    course_id                UUID REFERENCES medical_courses(id) ON DELETE SET NULL,
    input_type               inputtype NOT NULL,
    raw_input                TEXT,
    transcribed_text         TEXT,
    fever_level              VARCHAR(50),         -- normal | low_grade | high | critical
    fatigue_score            INTEGER,             -- 1-10
    medication_taken         BOOLEAN,
    medication_time_reported VARCHAR(100),
    symptom_summary          TEXT,                -- LLM-generated summary
    agent_report             TEXT,                -- RAG-grounded AI report for the doctor
    extra_data               JSON,                -- agent-parsed key-value pairs
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────
-- 10. TABLE 9: risk_scores
-- One per check-in. Weighted: Fever 25% | Fatigue 15% | Medication 20% | Wound 30% | LLM 10%
-- ─────────────────────────────────────────────
CREATE TABLE risk_scores (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id           UUID NOT NULL REFERENCES patient_profiles(id) ON DELETE CASCADE,
    check_in_id          UUID NOT NULL UNIQUE REFERENCES check_ins(id) ON DELETE CASCADE,
    fever_raw_score      DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    fatigue_raw_score    DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    medication_raw_score DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    wound_raw_score      DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    symptom_llm_score    DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    total_score          DOUBLE PRECISION NOT NULL,  -- 0-100
    tier                 risktier NOT NULL,
    breakdown            JSON,                       -- score transparency breakdown
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────
-- 11. TABLE 10: wound_analyses
-- Vision-agent results (NVIDIA vision model).
-- ─────────────────────────────────────────────
CREATE TABLE wound_analyses (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id              UUID NOT NULL REFERENCES patient_profiles(id) ON DELETE CASCADE,
    check_in_id             UUID REFERENCES check_ins(id) ON DELETE SET NULL,
    image_url               VARCHAR(500) NOT NULL,
    severity                woundseverity NOT NULL,
    raw_llm_response        TEXT,                    -- NVIDIA raw response
    redness_detected        BOOLEAN NOT NULL DEFAULT FALSE,
    swelling_detected       BOOLEAN NOT NULL DEFAULT FALSE,
    texture_change_detected BOOLEAN NOT NULL DEFAULT FALSE,
    analysis_summary        TEXT,
    ai_advice                TEXT,                    -- LLM-generated patient advice/tips
    wound_score             DOUBLE PRECISION NOT NULL DEFAULT 0.0,  -- 0-10
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────
-- 12. TABLE 11: alerts
-- Escalation events — nudge, doctor notify, critical, emergency.
-- ─────────────────────────────────────────────
CREATE TABLE alerts (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id            UUID NOT NULL REFERENCES patient_profiles(id) ON DELETE CASCADE,
    doctor_id             UUID REFERENCES doctor_profiles(id) ON DELETE SET NULL,
    risk_score_id         UUID REFERENCES risk_scores(id) ON DELETE SET NULL,
    alert_type            alerttype NOT NULL,
    status                alertstatus NOT NULL DEFAULT 'PENDING',
    message               TEXT NOT NULL,
    risk_score_value      DOUBLE PRECISION,
    dispatch_confirmed_by VARCHAR(255),
    dispatch_confirmed_at TIMESTAMPTZ,
    ambulance_response    TEXT,
    email_sent            BOOLEAN NOT NULL DEFAULT FALSE,
    sms_sent              BOOLEAN NOT NULL DEFAULT FALSE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at           TIMESTAMPTZ
);

-- ─────────────────────────────────────────────
-- 13. TABLE 12: doctor_messages
-- One-way doctor → patient.
-- ─────────────────────────────────────────────
CREATE TABLE doctor_messages (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id  UUID NOT NULL REFERENCES doctor_profiles(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES patient_profiles(id) ON DELETE CASCADE,
    message    TEXT NOT NULL,
    is_read    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────
-- 14. TABLE 13: agent_sessions
-- Ongoing agent Q&A conversation state.
-- ─────────────────────────────────────────────
CREATE TABLE agent_sessions (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id       UUID NOT NULL REFERENCES patient_profiles(id) ON DELETE CASCADE,
    check_in_id      UUID REFERENCES check_ins(id) ON DELETE SET NULL,
    status           VARCHAR(50) NOT NULL DEFAULT 'active',  -- active | completed | abandoned
    conversation     JSON,                                   -- [{role, content, options, time}, ...]
    pending_question TEXT,
    pending_options  JSON,
    trigger          VARCHAR(50) NOT NULL DEFAULT 'patient_initiated',  -- patient_initiated | agent_triggered | wound_request
    language         VARCHAR(10) NOT NULL DEFAULT 'en',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────
-- 15. TABLE 14: monitoring_schedules
-- One row per patient — adaptive check-in cadence.
-- ─────────────────────────────────────────────
CREATE TABLE monitoring_schedules (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id              UUID NOT NULL UNIQUE REFERENCES patient_profiles(id) ON DELETE CASCADE,
    check_in_interval_hours INTEGER NOT NULL DEFAULT 24,
    last_check_in_at        TIMESTAMPTZ,
    next_check_in_at        TIMESTAMPTZ,
    interval_reason         VARCHAR(255),           -- transparency: why this cadence
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────
-- 16. OPTIONAL indexes for hot query paths
-- (Postgres does NOT auto-index foreign keys.)
-- ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_check_ins_patient   ON check_ins(patient_id);
CREATE INDEX IF NOT EXISTS idx_check_ins_course    ON check_ins(course_id);
CREATE INDEX IF NOT EXISTS idx_risk_scores_patient ON risk_scores(patient_id);
CREATE INDEX IF NOT EXISTS idx_wounds_patient      ON wound_analyses(patient_id);
CREATE INDEX IF NOT EXISTS idx_alerts_patient      ON alerts(patient_id);
CREATE INDEX IF NOT EXISTS idx_alerts_doctor       ON alerts(doctor_id);
CREATE INDEX IF NOT EXISTS idx_courses_doctor      ON medical_courses(doctor_id);
CREATE INDEX IF NOT EXISTS idx_courses_patient     ON medical_courses(patient_id);
CREATE INDEX IF NOT EXISTS idx_meds_course         ON medications(course_id);
CREATE INDEX IF NOT EXISTS idx_msgs_patient        ON doctor_messages(patient_id);
CREATE INDEX IF NOT EXISTS idx_sessions_patient    ON agent_sessions(patient_id);
CREATE INDEX IF NOT EXISTS idx_monitor_patient     ON monitoring_schedules(patient_id);
