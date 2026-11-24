# RankWise PostgreSQL Database Schema Documentation

> **Database Engine:** PostgreSQL 16+ on Neon Serverless  
> **Driver:** `@neondatabase/serverless`  
> **Migration File:** `database/migrations/001_initial_schema.sql`  
> **Status:** Phase 2B Prepared | Tested & Verified for Production

---

## 1. Overview & Architecture

This directory houses the relational database schema migrations and documentation for **RankWise**. The schema transitions RankWise from local CSV/JSON in-memory files to a normalized, high-performance PostgreSQL database hosted on **Neon**.

### Key Architectural Tenets
1. **Zero Calculation Drift:** Mathematical prediction models (PCHIP interpolation, log-rank splines, and JoSAA cutoff comparisons) remain 100% identical.
2. **Third Normal Form (3NF):** Separates institutes, distinct academic offerings, and multi-round cutoffs into relational tables with enforced foreign key cascades.
3. **Sub-5ms Query Latency:** Employs composite B-Tree indexes and a specialized materialized view (`josaa_latest_cutoffs_mv`) so candidate eligibility checks bypass scanning 194,000+ historical rows.
4. **Idempotence & Safety:** Every DDL statement uses `IF NOT EXISTS` constructs. Running the migration multiple times is safe and will never drop or overwrite existing data.

---

## 2. Table Catalog & Specifications

### 2.1 `institutes`
Stores official engineering institutions participating in JoSAA/CSAB counselling.
- **Primary Key:** `id VARCHAR(64)` (slug, e.g. `'NIT-TRICHY'`)
- **Unique Constraint:** `name VARCHAR(255) UNIQUE`
- **Columns:**
  - `name`: Full official institution name (e.g. `'National Institute of Technology, Tiruchirappalli'`).
  - `type`: Institution category (`'NIT'`, `'3IT'`, `'CFI'`, `'IIT'`).
  - `rank_type`: Qualifying exam type (`'JEE_MAIN'`, `'JEE_ADVANCED'`).
  - `state`: State or Union Territory (used for Home State / Other State quota resolution).
  - `city`: Campus location.
  - `nirf_rank`: Official NIRF engineering rank (nullable).
- **Expected Record Count:** 138

### 2.2 `institute_programs`
Stores distinct academic degree programs offered by each institution.
- **Primary Key:** `id SERIAL`
- **Foreign Key:** `institute_id REFERENCES institutes(id) ON DELETE CASCADE`
- **Unique Constraint:** `(institute_id, full_program_name)`  
  *(Audit Correction: Using `full_program_name` instead of `branch_name` resolves 83 collisions between 4-year B.Tech and 5-year Dual Degree offerings).*
- **Columns:**
  - `branch_name`: Department title (e.g. `'Computer Science and Engineering'`).
  - `full_program_name`: Complete academic program title (e.g. `'Computer Science and Engineering (4 Years, Bachelor of Technology)'`).
  - `degree`: Standardized degree (`'Bachelor of Technology'`, `'Integrated / Dual Degree'`, `'Bachelor of Architecture'`, `'Bachelor of Planning'`).
  - `duration`: Length of study (`'4 Years'`, `'5 Years'`).
- **Expected Record Count:** 1,088

### 2.3 `josaa_cutoffs`
Stores historical opening and closing ranks across all rounds for 2024, 2025, and 2026.
- **Primary Key:** `id BIGSERIAL`
- **Foreign Key:** `program_id REFERENCES institute_programs(id) ON DELETE CASCADE`
- **Unique Constraint:** `(program_id, year, round, quota, seat_category, gender)`
- **Columns (All 16 source columns preserved):**
  - `program_id`: Relational link to `institute_programs`.
  - `year`: JoSAA year (`2024`, `2025`, `2026`).
  - `round`: Counselling round (`1` through `6`).
  - `quota`: Allotment quota (`'AI'`, `'HS'`, `'OS'`, `'GO'`, `'JK'`, `'LA'`).
  - `seat_category`: Candidate quota category (`'OPEN'`, `'EWS'`, `'OBC-NCL'`, `'SC'`, `'ST'`, and PwD variants).
  - `gender`: Seat allocation pool (`'Gender-Neutral'`, `'Female-only'`).
  - `opening_rank`: Official JoSAA opening rank.
  - `closing_rank`: Official JoSAA closing rank.
  - `data_type`: Data verification flag (`'Official'`).
  - `source`: Provenance tag (`'JoSAA Official Archive'`, `'JoSAA 2026 Allotment Report'`).
- **Query Indexes:**
  - `idx_cutoffs_match`: `(quota, seat_category, gender, closing_rank)`
  - `idx_cutoffs_history`: `(program_id, year, round)`
- **Expected Record Count:** 194,312

### 2.4 `josaa_latest_cutoffs_mv` (Materialized View)
Pre-computes the latest closing and opening ranks for each program and quota.
- **Definition:**
  ```sql
  SELECT DISTINCT ON (program_id, quota, seat_category, gender)
      program_id, quota, seat_category, gender,
      year AS latest_year, round AS latest_round,
      opening_rank AS latest_orank, closing_rank AS latest_crank,
      data_type, source
  FROM josaa_cutoffs
  ORDER BY program_id, quota, seat_category, gender, year DESC, round DESC;
  ```
- **Indexes:**
  - Unique index on `(program_id, quota, seat_category, gender)`.
  - B-Tree index on `(quota, seat_category, gender, latest_crank)`.
- **Expected Record Count:** ~24,500
- **Refresh Command:**
  ```sql
  REFRESH MATERIALIZED VIEW josaa_latest_cutoffs_mv;
  ```

### 2.5 `placement_packages`
Stores verified CTC placement reports compiled from official institutional reports and NIRF submissions.
- **Primary Key:** `id SERIAL`
- **Foreign Keys:**
  - `institute_id REFERENCES institutes(id) ON DELETE CASCADE`
  - `program_id REFERENCES institute_programs(id) ON DELETE SET NULL` (nullable for institute-wide summaries)
- **Unique Partial Indexes:**
  - `uq_placement_institute_wide`: `ON placement_packages (institute_id) WHERE branch_name IS NULL;`
  - `uq_placement_branch_level`: `ON placement_packages (institute_id, branch_name) WHERE branch_name IS NOT NULL;`
- **Columns:**
  - `branch_name`: Department name (NULL for institute-wide summaries).
  - `average_lpa`: Average CTC package in Lakhs Per Annum.
  - `median_lpa`: Median CTC package in Lakhs Per Annum.
  - `highest_lpa`: Highest package in Lakhs Per Annum (nullable).
  - `placement_year`: Placement cohort year (default: `2024`).
  - `metric_type`: Salary metric (default: `'CTC'`).
  - `source_url`, `source_type`, `verification_status`, `last_updated`.
- **Expected Record Count:** 69 (33 institute summaries + 36 department breakdowns)

### 2.6 `marks_rank_grid`
Stores the marks-to-percentile and AIR calibration grid (0 to 300 marks for 2024–2027).
- **Primary Key:** `(year, marks)`
- **Columns:** `year`, `marks`, `percentile`, `percentile_low`, `percentile_high`, `air`, `air_best`, `air_worst`, `basis`, `confidence`.
- **Indexes:** Index on `(year, percentile)` and `(year, air)`.
- **Expected Record Count:** 1,204

### 2.7 `category_rank_calibration`
Stores verified NTA scorecard anchor points for monotonic log-rank category estimation.
- **Primary Key:** `id SERIAL`
- **Unique Constraint:** `(year, category, percentile)`
- **Columns:**
  - `year`: Examination year (e.g. `2024`).
  - `category`: Candidate category (`'GEN-EWS'`, `'OBC-NCL'`, `'SC'`, `'ST'`).
  - `percentile`: Calibrated percentile (`NUMERIC(12, 8)` preserves official 7-decimal NTA cutoffs).
  - `category_rank`: Verified scorecard rank.
  - `source`, `notes`.
- **Expected Record Count:** 33

### 2.8 `shift_records`
Stores session shift-wise score-to-percentile distributions.
- **Primary Key:** `id SERIAL`
- **Unique Constraint:** `(year, session, shift_id, percentile)`  
  *(Audit Correction: Including year and session prevents 276 collisions across April sessions).*
- **Columns (All 9 source columns preserved):**
  - `year`: Smallint (`2024`, `2025`, `2026`).
  - `session`: Exam session (`'january'`, `'april'`).
  - `shift_id`: Shift identifier (e.g. `'04M'`, `'2026_01_27_shift_1'`).
  - `exam_date`: Exam date (`DATE`).
  - `shift`: Shift time (`'Morning'`, `'Evening'`).
  - `percentile`: Percentile (`NUMERIC(7, 4)`).
  - `marks`: Raw score (`SMALLINT`).
  - `record_type`: Record classification (`'observed'`).
  - `read_quality`: OCR / source quality (`'verified'`).
- **Expected Record Count:** 1,352

### 2.9 `system_manifest`
Key-value configuration store for multi-year projection weights and system metadata.
- **Primary Key:** `key VARCHAR(64)`
- **Columns:** `key`, `payload JSONB`, `updated_at TIMESTAMPTZ`.
- **Expected Record Count:** 1

---

## 3. Execution & Validation Instructions

### 3.1 Applying the Schema Migration
The migration script is located at `database/migrations/001_initial_schema.sql`.

To apply it to Neon PostgreSQL:
```bash
# Option A: Via psql CLI
psql "$DATABASE_URL" -f database/migrations/001_initial_schema.sql

# Option B: Via Neon Web Console SQL Editor
# Paste the contents of 001_initial_schema.sql into the Neon SQL editor and execute.
```

### 3.2 Post-Migration Verification Queries
Run the following SQL verification block after applying the migration and seeding data:

```sql
-- 1. Verify Record Counts
SELECT 'institutes' AS table_name, COUNT(*) AS count, 138 AS expected FROM institutes
UNION ALL
SELECT 'institute_programs', COUNT(*), 1088 FROM institute_programs
UNION ALL
SELECT 'josaa_cutoffs', COUNT(*), 194312 FROM josaa_cutoffs
UNION ALL
SELECT 'placement_packages', COUNT(*), 69 FROM placement_packages
UNION ALL
SELECT 'marks_rank_grid', COUNT(*), 1204 FROM marks_rank_grid
UNION ALL
SELECT 'category_rank_calibration', COUNT(*), 33 FROM category_rank_calibration
UNION ALL
SELECT 'shift_records', COUNT(*), 1352 FROM shift_records;

-- 2. Verify Zero Orphan Records
SELECT COUNT(*) AS orphan_programs FROM institute_programs p 
LEFT JOIN institutes i ON p.institute_id = i.id WHERE i.id IS NULL;

SELECT COUNT(*) AS orphan_cutoffs FROM josaa_cutoffs c 
LEFT JOIN institute_programs p ON c.program_id = p.id WHERE p.id IS NULL;

-- 3. Verify Materialized View Population
SELECT COUNT(*) FROM josaa_latest_cutoffs_mv WHERE latest_crank <= 0; -- Must be 0
```

