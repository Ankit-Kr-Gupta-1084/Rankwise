-- ============================================================================
-- RankWise Neon PostgreSQL Database Migration
-- Migration: 001_initial_schema.sql
-- Description: Creates core relational tables, foreign keys, composite indexes,
--              partial unique constraints, and materialized view for RankWise.
-- Target Engine: PostgreSQL 16+ on Neon Serverless
-- Safety: Idempotent (safe to re-run; uses IF NOT EXISTS throughout)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. INSTITUTES TABLE
-- Source: josaa_master_clean.csv (distinct institute) + INST_STATE_MAP
-- Preserves: type, rank_type, state, city, nirf_rank
-- Expected records: 138
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS institutes (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(16) NOT NULL,            -- 'NIT', '3IT', 'CFI', 'IIT'
    rank_type VARCHAR(32) NOT NULL,       -- 'JEE_MAIN', 'JEE_ADVANCED'
    state VARCHAR(64) NOT NULL,
    city VARCHAR(64) NOT NULL,
    nirf_rank INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_institutes_name UNIQUE (name)
);

CREATE INDEX IF NOT EXISTS idx_institutes_filter 
ON institutes (rank_type, type, state);

CREATE INDEX IF NOT EXISTS idx_institutes_nirf 
ON institutes (nirf_rank ASC NULLS LAST);

-- ----------------------------------------------------------------------------
-- 2. INSTITUTE PROGRAMS TABLE
-- Source: josaa_master_clean.csv (distinct offerings)
-- Preserves: branch, program (full_program_name), degree, duration
-- Note: full_program_name distinguishes standard 4-yr B.Tech from 5-yr Dual Degrees.
-- Expected records: 1,088
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS institute_programs (
    id SERIAL PRIMARY KEY,
    institute_id VARCHAR(64) NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
    branch_name VARCHAR(128) NOT NULL,
    full_program_name VARCHAR(255) NOT NULL,
    degree VARCHAR(64) NOT NULL,          -- 'Bachelor of Technology', 'Integrated / Dual Degree', etc.
    duration VARCHAR(32) NOT NULL,        -- '4 Years', '5 Years'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_inst_program_offering UNIQUE (institute_id, full_program_name)
);

CREATE INDEX IF NOT EXISTS idx_programs_branch 
ON institute_programs (branch_name);

CREATE INDEX IF NOT EXISTS idx_programs_inst 
ON institute_programs (institute_id);

-- ----------------------------------------------------------------------------
-- 3. JOSAA CUTOFFS TABLE
-- Source: josaa_master_clean.csv (all records across 2024, 2025, 2026)
-- Preserves all 16 JoSAA columns: year, round, type, rank_type, institute,
-- program, branch, degree, duration, quota, category, gender, orank, crank,
-- data_type, source.
-- Expected records: 194,312
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS josaa_cutoffs (
    id BIGSERIAL PRIMARY KEY,
    program_id INTEGER NOT NULL REFERENCES institute_programs(id) ON DELETE CASCADE,
    year SMALLINT NOT NULL,               -- 2024, 2025, 2026
    round SMALLINT NOT NULL,              -- 1, 2, 3, 4, 5, 6
    quota VARCHAR(16) NOT NULL,           -- 'AI', 'HS', 'OS', 'GO', 'JK', 'LA'
    seat_category VARCHAR(32) NOT NULL,   -- 'OPEN', 'EWS', 'OBC-NCL', 'SC', 'ST', + PwD variants
    gender VARCHAR(32) NOT NULL,          -- 'Gender-Neutral', 'Female-only'
    opening_rank INTEGER NOT NULL,
    closing_rank INTEGER NOT NULL,
    data_type VARCHAR(32) NOT NULL DEFAULT 'Official',
    source VARCHAR(64) NOT NULL DEFAULT 'JoSAA Official Archive',
    CONSTRAINT uq_josaa_cutoff_entry UNIQUE (program_id, year, round, quota, seat_category, gender)
);

-- Primary composite query index for candidate eligibility matching
CREATE INDEX IF NOT EXISTS idx_cutoffs_match 
ON josaa_cutoffs (quota, seat_category, gender, closing_rank);

-- Composite query index for branch round-wise historical modal
CREATE INDEX IF NOT EXISTS idx_cutoffs_history 
ON josaa_cutoffs (program_id, year, round);

-- ----------------------------------------------------------------------------
-- 4. JOSAA LATEST CUTOFFS MATERIALIZED VIEW
-- Pre-computes the latest closing rank per (program, quota, category, gender).
-- Guarantees sub-5ms candidate matching without table scans on 194,000+ rows.
-- Expected records: ~24,500
-- ----------------------------------------------------------------------------
CREATE MATERIALIZED VIEW IF NOT EXISTS josaa_latest_cutoffs_mv AS
SELECT DISTINCT ON (program_id, quota, seat_category, gender)
    program_id,
    quota,
    seat_category,
    gender,
    year AS latest_year,
    round AS latest_round,
    opening_rank AS latest_orank,
    closing_rank AS latest_crank,
    data_type,
    source
FROM josaa_cutoffs
ORDER BY program_id, quota, seat_category, gender, year DESC, round DESC;

CREATE UNIQUE INDEX IF NOT EXISTS idx_latest_mv_pk 
ON josaa_latest_cutoffs_mv (program_id, quota, seat_category, gender);

CREATE INDEX IF NOT EXISTS idx_latest_mv_lookup 
ON josaa_latest_cutoffs_mv (quota, seat_category, gender, latest_crank);

-- ----------------------------------------------------------------------------
-- 5. VERIFIED PLACEMENT PACKAGES TABLE
-- Source: data/reference/placement_packages.csv
-- Preserves: institute_id, branch_name, average_lpa, median_lpa, highest_lpa,
--            placement_year, metric_type, source_url, source_type,
--            verification_status, last_updated
-- Expected records: 69 (33 institute-level summaries + 36 department breakdowns)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS placement_packages (
    id SERIAL PRIMARY KEY,
    institute_id VARCHAR(64) NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
    program_id INTEGER REFERENCES institute_programs(id) ON DELETE SET NULL,
    branch_name VARCHAR(128),             -- NULL for institute-wide summary records
    average_lpa NUMERIC(6, 2) NOT NULL,
    median_lpa NUMERIC(6, 2) NOT NULL,
    highest_lpa NUMERIC(6, 2),            -- NULL if unrecorded
    placement_year SMALLINT NOT NULL DEFAULT 2024,
    metric_type VARCHAR(16) NOT NULL DEFAULT 'CTC',
    source_url TEXT,
    source_type VARCHAR(64),
    verification_status VARCHAR(32) NOT NULL DEFAULT 'verified_official',
    last_updated VARCHAR(16),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Partial unique indexes ensuring one institute-wide record and one record per branch
CREATE UNIQUE INDEX IF NOT EXISTS uq_placement_institute_wide 
ON placement_packages (institute_id) WHERE branch_name IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_placement_branch_level 
ON placement_packages (institute_id, branch_name) WHERE branch_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_placement_inst 
ON placement_packages (institute_id);

CREATE INDEX IF NOT EXISTS idx_placement_prog 
ON placement_packages (program_id);

-- ----------------------------------------------------------------------------
-- 6. MARKS TO PERCENTILE & AIR GRID TABLE
-- Source: data/combined/marks_percentile_air.csv
-- Preserves: year, marks, percentile, percentile_low, percentile_high,
--            air, air_best, air_worst, basis, confidence
-- Expected records: 1,204 (301 marks x 4 years: 2024, 2025, 2026, 2027)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS marks_rank_grid (
    year SMALLINT NOT NULL,               -- 2024, 2025, 2026, 2027
    marks NUMERIC(5, 2) NOT NULL,         -- 0 to 300
    percentile NUMERIC(7, 4) NOT NULL,
    percentile_low NUMERIC(7, 4) NOT NULL,
    percentile_high NUMERIC(7, 4) NOT NULL,
    air INTEGER NOT NULL,
    air_best INTEGER NOT NULL,
    air_worst INTEGER NOT NULL,
    basis VARCHAR(32) NOT NULL,           -- 'observed_interpolated', 'mixed', 'reference_scaled'
    confidence VARCHAR(16) NOT NULL,      -- 'high', 'medium', 'low'
    CONSTRAINT pk_marks_rank_grid PRIMARY KEY (year, marks)
);

CREATE INDEX IF NOT EXISTS idx_marks_rank_pct 
ON marks_rank_grid (year, percentile);

CREATE INDEX IF NOT EXISTS idx_marks_rank_air 
ON marks_rank_grid (year, air);

-- ----------------------------------------------------------------------------
-- 7. CATEGORY RANK CALIBRATION TABLE
-- Source: data/josaa/category_rank_calibration.csv
-- Preserves: year, category, percentile (up to 7 decimals for official NTA cutoffs),
--            category_rank, source, notes
-- Expected records: 33
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS category_rank_calibration (
    id SERIAL PRIMARY KEY,
    year SMALLINT NOT NULL,               -- 2024
    category VARCHAR(16) NOT NULL,        -- 'GEN-EWS', 'OBC-NCL', 'SC', 'ST'
    percentile NUMERIC(12, 8) NOT NULL,   -- Preserves official 7-decimal NTA cutoffs (e.g. 81.3266412)
    category_rank INTEGER NOT NULL,
    source TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_cat_calib_year_cat_pct UNIQUE (year, category, percentile)
);

CREATE INDEX IF NOT EXISTS idx_cat_calib_lookup 
ON category_rank_calibration (category, percentile ASC);

-- ----------------------------------------------------------------------------
-- 8. SHIFT-WISE HISTORICAL RECORDS TABLE
-- Source: data/{2024,2025,2026}/*_shiftwise.csv (all 6 files)
-- Preserves all 9 shift columns: year, session, shift_id, exam_date, shift,
--                                percentile, marks, record_type, read_quality
-- Expected records: 1,352
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shift_records (
    id SERIAL PRIMARY KEY,
    year SMALLINT NOT NULL,               -- 2024, 2025, 2026
    session VARCHAR(16) NOT NULL,         -- 'january', 'april'
    shift_id VARCHAR(64) NOT NULL,        -- e.g. '04M', '2026_01_27_shift_1'
    exam_date DATE NOT NULL,
    shift VARCHAR(16) NOT NULL,           -- 'Morning', 'Evening'
    percentile NUMERIC(7, 4) NOT NULL,
    marks SMALLINT NOT NULL,
    record_type VARCHAR(32) NOT NULL DEFAULT 'observed',
    read_quality VARCHAR(32) NOT NULL DEFAULT 'verified',
    CONSTRAINT uq_shift_record_unique UNIQUE (year, session, shift_id, percentile)
);

CREATE INDEX IF NOT EXISTS idx_shifts_query 
ON shift_records (year, session, exam_date, shift);

-- ----------------------------------------------------------------------------
-- 9. SYSTEM MANIFEST CONFIGURATION TABLE
-- Source: data/combined/years_manifest.json
-- Stores projection weights, observed years, and system configuration as JSONB.
-- Expected records: 1
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS system_manifest (
    key VARCHAR(64) PRIMARY KEY,
    payload JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

