# RankWise Neon PostgreSQL Migration — Comprehensive Architecture & Execution Plan

> **Phase:** Phase 2A — Schema Validation & Correctness Audit  
> **Database:** Neon Serverless PostgreSQL (`@neondatabase/serverless`)  
> **Status:** Connection Verified (`/api/db-test` successful) | Schema Audited & Corrected  
> **Target Production Database:** Serverless PostgreSQL 16+ on Neon  
> **Validation Verdict:** **PASS (Safe for Table Creation with Corrected DDL)**  
> **Guiding Principle:** Zero disruption to existing mathematical models, PCHIP interpolation, or API response schemas.

---

## 1. Executive Summary & Audit Overview

During Phase 2A, a comprehensive automated audit was conducted on all 28 project data files, testing every proposed table definition, data type, foreign key, and unique constraint against the 194,312 actual records in the repository.

### Key Audit Findings & Critical Issues Resolved:
1. **Program Identity Collision (Critical Fix):**  
   The initial plan used `UNIQUE (institute_id, branch_name)` on `institute_programs`. Testing on `josaa_master_clean.csv` revealed **83 program collisions** (57 in NITs, IIITs, and CFIs alone). Multiple degree programs (e.g. 4-Year B.Tech vs 5-Year Dual Degree, or AI specializations) share the identical branch name (e.g. at IIIT Bhopal, 5 distinct programs shared `Computer Science and Engineering`).  
   *Correction:* Unique constraint updated to `UNIQUE (institute_id, full_program_name)` expanding total programs from 982 to **1,088 distinct offerings with 0 collisions**.
2. **Shift Records Multi-Year Collision (Critical Fix):**  
   The initial plan used `UNIQUE (shift_id, percentile)` on `shift_records`. Testing revealed **276 duplicate collisions** because April shift codes (e.g. `'04M'`, `'05E'`) repeat across 2024, 2025, and 2026.  
   *Correction:* Unique constraint updated to `UNIQUE (year, session, shift_id, percentile)`, guaranteeing 0 collisions across all 1,352 shift rows.
3. **Expression-Based Unique Constraint Syntax (DDL Fix):**  
   PostgreSQL `CREATE TABLE` constraints do not allow `COALESCE` expressions in standard table constraints (`UNIQUE (institute_id, COALESCE(branch_name, '...'))`).  
   *Correction:* Replaced with two idiomatic PostgreSQL partial unique indexes (`WHERE branch_name IS NULL` and `WHERE branch_name IS NOT NULL`).
4. **NTA Cutoff Decimal Truncation (Precision Fix):**  
   In `category_rank_calibration.csv`, official NTA qualifier percentiles contain up to **7 decimal places** (e.g., `81.3266412`, `79.6757881`, `60.0923182`). A `NUMERIC(7, 4)` definition would truncate these official thresholds.  
   *Correction:* Elevated to `NUMERIC(12, 8)` and included `year` in `UNIQUE (year, category, percentile)`.
5. **Full JoSAA Column Preservation (Completeness Fix):**  
   `data_type` and `source` were omitted from `josaa_cutoffs` in the draft DDL. Both fields are now explicitly defined, ensuring 100% preservation of all 16 columns from `josaa_master_clean.csv`.

---

## 2. Dataset Inventory & Feature Consumption Trace

RankWise contains 28 data files spanning `data/combined/`, `data/josaa/`, `data/reference/`, and `data/{year}/`. Below is the complete trace of how each feature in the application consumes these files.

```mermaid
flowchart TD
    subgraph Feature_1 ["1. Marks → Percentile → AIR Prediction"]
        F1_CSV["data/combined/marks_percentile_air.csv"] --> F1_Code["lib/rankwise/predict.ts"]
        F1_JSON["data/combined/years_manifest.json"] --> F1_Code
        F1_Code --> F1_API["/api/predict & /api/years"]
    end

    subgraph Feature_2 ["2. Category Rank Estimation"]
        F2_CSV["data/josaa/category_rank_calibration.csv"] --> F2_Code["lib/college-finder/category-rank.ts"]
        F2_Code --> F2_Engine["lib/college-finder/finder-engine.ts"]
    end

    subgraph Feature_3 ["3. JoSAA College Allotment Predictor"]
        F3_JSON["data/josaa/josaa_cutoff_index.json"] --> F3_Engine["lib/college-finder/finder-engine.ts"]
        F1_Code --> F3_Engine
        F2_Code --> F3_Engine
        F3_Engine --> F3_API["/api/college-finder/predict"]
    end

    subgraph Feature_4 ["4. Shift-wise Historical Analysis"]
        F4_CSV["data/{year}/{session}_shiftwise.csv"] --> F4_API["/api/shifts"]
        F4_API --> F4_UI["app/history/page.tsx"]
    end

    subgraph Feature_5 ["5. Placement Package Display"]
        F5_CSV["data/reference/placement_packages.csv"] --> F5_Build["data/josaa/build_josaa_index.py"]
        F5_Build --> F3_JSON
    end
```

### Detailed Traceability Matrix

| Feature | Primary Consumer File | Runtime vs Build-time | Source Data Files Consumed | Row Count |
| :--- | :--- | :--- | :--- | :--- |
| **Marks $\to$ Percentile $\to$ AIR** | `lib/rankwise/predict.ts` | **Runtime** | `data/combined/marks_percentile_air.csv`<br>`data/combined/years_manifest.json` | 1,204 rows<br>6 keys |
| **Prediction Offline Compiler** | `data/combined/build_combined.py` | Build-time | `data/{2024,2025,2026}/*_shiftwise.csv`<br>`data/{2024,2025,2026}/percentile_rank.csv`<br>`data/reference/low_range_reference.csv` | 1,352 rows<br>88 rows<br>10 rows |
| **Category Rank Engine** | `lib/college-finder/category-rank.ts` | **Runtime** | `data/josaa/category_rank_calibration.csv` | 33 rows |
| **JoSAA College Matcher** | `lib/college-finder/finder-engine.ts` | **Runtime** | `data/josaa/josaa_cutoff_index.json`<br>(Calls `predict.ts` & `category-rank.ts`) | 138 institutes<br>(9.05 MB) |
| **JoSAA Index Compiler** | `data/josaa/build_josaa_index.py` | Build-time | 16 Raw CSVs in `data/josaaa/`<br>`data/reference/placement_packages.csv`<br>`INST_STATE_MAP` in Python code | ~195,000 raw rows<br>69 rows<br>40 institutes |
| **Clean JoSAA Master Archive**| Standalone / Reference | Reference | `data/josaa/josaa_master_clean.csv` | 194,312 rows |
| **Shift Historical Explorer** | `app/api/shifts/route.ts` | **Runtime** | `data/2024/january_shiftwise.csv`<br>`data/2024/april_shiftwise.csv`<br>`data/2025/january_shiftwise.csv`<br>`data/2025/april_shiftwise.csv`<br>`data/2026/january_shiftwise.csv`<br>`data/2026/april_shiftwise.csv` | 230 rows<br>240 rows<br>230 rows<br>215 rows<br>230 rows<br>207 rows |
| **Verified Placement Records**| Embedded in JoSAA Index | Pre-compiled | `data/reference/placement_packages.csv` | 69 rows |

---

## 3. Data Profiling & Quality Audit Findings

A deep statistical audit of every candidate file was executed to detect nulls, data types, and potential foreign-key violations.

### 3.1 Data Profile Table

| Dataset | Row Count | Column Count | Null Count by Column | Detected Data Types | Verified Natural Key |
| :--- | :---: | :---: | :--- | :--- | :--- |
| `combined/marks_percentile_air.csv` | 1,204 | 10 | **0 nulls across all columns** | `year`: int, `marks`: int, `percentile`: float, `air`: int, `basis`: str, `confidence`: str | `(year, marks)` |
| `josaa/josaa_master_clean.csv` | 194,312 | 16 | **0 nulls across all columns** | `year`: int, `round`: int, `type`: str, `rank_type`: str, `institute`: str, `program`: str, `branch`: str, `quota`: str, `category`: str, `gender`: str, `orank`: int, `crank`: int, `data_type`: str, `source`: str | `(institute, program, year, round, quota, category, gender)` |
| `reference/placement_packages.csv` | 69 | 13 | `branch_id`: 33 nulls (inst-level)<br>`branch_name`: 33 nulls<br>`highest_lpa`: 30 nulls<br>Others: 0 nulls | `average_lpa`: float, `median_lpa`: float, `highest_lpa`: float, `placement_year`: int | `institute_id` (when branch null)<br>`(institute_id, branch_name)` |
| `josaa/category_rank_calibration.csv`| 33 | 6 | **0 nulls across all columns** | `year`: int, `category`: str, `percentile`: float (7 decimals), `category_rank`: int | `(year, category, percentile)` |
| `2024-2026` Shift CSVs (all 6 files) | 1,352 total | 9 | **0 nulls across all columns** | `year`: int, `session`: str, `shift_id`: str, `exam_date`: str, `shift`: str, `percentile`: float, `marks`: int | `(year, session, shift_id, percentile)` |

### 3.2 Audit Findings on Relational Integrity
1. **Zero-Null Integrity in JoSAA Clean Master:** `josaa_master_clean.csv` has exactly 0 nulls across all 194,312 records. All opening and closing ranks are valid positive integers.
2. **Institute Name Parity:** 33 out of 33 institutes in `placement_packages.csv` exactly match the 138 official institute names in `josaa_master_clean.csv`.
3. **Branch Name Normalization Discrepancy:**
   - In `josaa_master_clean.csv`, MNNIT Allahabad has branch: `'Bio Technology'` (with space).
   - In `placement_packages.csv`, it is written as: `'Biotechnology'` (no space).
   - In addition, MNNIT lists an `'Information Technology'` placement record which does not exist as an independent JoSAA program (reclassified under CSE/M&C).
   - *Resolution for Migration:* The migration ETL normalizes branch strings with whitespace and casing stripping (`LOWER(REPLACE(branch_name, ' ', ''))`) and preserves unmatched department records with `program_id = NULL`.
4. **IIT Exclusion Rule Integrity:** All 23 IITs and IISc Bangalore are marked with `type = 'IIT'` and `rank_type = 'JEE_ADVANCED'`. In PostgreSQL queries, adding `WHERE rank_type = 'JEE_MAIN'` automatically guarantees strict IIT exclusion.

---

## 4. Corrected PostgreSQL Relational Schema (Validated DDL)

Below is the verified, syntax-checked PostgreSQL DDL incorporating all Phase 2A audit corrections.

```sql
-- ============================================================================
-- RankWise Corrected & Validated Production DDL for Neon PostgreSQL
-- ============================================================================

-- 1. Institutes Table (138 records)
CREATE TABLE institutes (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    type VARCHAR(16) NOT NULL,            -- 'NIT', '3IT', 'CFI', 'IIT'
    rank_type VARCHAR(32) NOT NULL,       -- 'JEE_MAIN', 'JEE_ADVANCED'
    state VARCHAR(64) NOT NULL,
    city VARCHAR(64) NOT NULL,
    nirf_rank INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_institutes_filter ON institutes (rank_type, type, state);
CREATE INDEX idx_institutes_nirf ON institutes (nirf_rank ASC NULLS LAST);

-- 2. Institute Programs Table (1,088 distinct academic offerings - Phase 2A corrected)
CREATE TABLE institute_programs (
    id SERIAL PRIMARY KEY,
    institute_id VARCHAR(64) NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
    branch_name VARCHAR(128) NOT NULL,
    full_program_name VARCHAR(255) NOT NULL,
    degree VARCHAR(64) NOT NULL,          -- 'Bachelor of Technology', 'Integrated / Dual Degree', etc.
    duration VARCHAR(32) NOT NULL,        -- '4 Years', '5 Years'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    -- PHASE 2A CORRECTION: full_program_name ensures 4-yr and 5-yr dual degrees do not collide (1,088 offerings, 0 dups)
    UNIQUE (institute_id, full_program_name)
);
CREATE INDEX idx_programs_branch ON institute_programs (branch_name);
CREATE INDEX idx_programs_inst ON institute_programs (institute_id);

-- 3. JoSAA Cutoffs Table (194,312 round-wise records for 2024, 2025, 2026)
CREATE TABLE josaa_cutoffs (
    id BIGSERIAL PRIMARY KEY,
    program_id INTEGER NOT NULL REFERENCES institute_programs(id) ON DELETE CASCADE,
    year SMALLINT NOT NULL,               -- 2024, 2025, 2026
    round SMALLINT NOT NULL,              -- 1, 2, 3, 4, 5, 6
    quota VARCHAR(16) NOT NULL,           -- 'AI', 'HS', 'OS', 'GO', 'JK', 'LA'
    seat_category VARCHAR(32) NOT NULL,   -- 'OPEN', 'EWS', 'OBC-NCL', 'SC', 'ST', and PwD variants
    gender VARCHAR(32) NOT NULL,          -- 'Gender-Neutral', 'Female-only'
    opening_rank INTEGER NOT NULL,
    closing_rank INTEGER NOT NULL,
    -- PHASE 2A CORRECTION: Preserve all 16 columns from josaa_master_clean.csv
    data_type VARCHAR(32) NOT NULL DEFAULT 'Official',
    source VARCHAR(64) NOT NULL DEFAULT 'JoSAA Official Archive',
    UNIQUE (program_id, year, round, quota, seat_category, gender)
);

-- Essential Performance Indexes for Candidate Matching:
CREATE INDEX idx_cutoffs_match ON josaa_cutoffs (quota, seat_category, gender, closing_rank);
CREATE INDEX idx_cutoffs_history ON josaa_cutoffs (program_id, year, round);

-- 4. Materialized View for Latest Closing Ranks (Sub-5ms JoSAA Matching)
CREATE MATERIALIZED VIEW josaa_latest_cutoffs_mv AS
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

CREATE UNIQUE INDEX idx_latest_mv_pk ON josaa_latest_cutoffs_mv (program_id, quota, seat_category, gender);
CREATE INDEX idx_latest_mv_lookup ON josaa_latest_cutoffs_mv (quota, seat_category, gender, latest_crank);

-- 5. Verified Placement Packages Table (69 records)
CREATE TABLE placement_packages (
    id SERIAL PRIMARY KEY,
    institute_id VARCHAR(64) NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
    program_id INTEGER REFERENCES institute_programs(id) ON DELETE SET NULL,
    branch_name VARCHAR(128),             -- NULL for institute-wide summary records
    average_lpa NUMERIC(6, 2) NOT NULL,
    median_lpa NUMERIC(6, 2) NOT NULL,
    highest_lpa NUMERIC(6, 2),            -- NULL if unrecorded
    placement_year SMALLINT NOT NULL,     -- 2024
    metric_type VARCHAR(16) DEFAULT 'CTC',
    source_url TEXT,
    source_type VARCHAR(64),
    verification_status VARCHAR(32) DEFAULT 'verified_official',
    last_updated VARCHAR(16)
);

-- PHASE 2A CORRECTION: PostgreSQL-compliant partial unique indexes replacing expression constraint
CREATE UNIQUE INDEX uq_placement_institute_wide 
ON placement_packages (institute_id) WHERE branch_name IS NULL;

CREATE UNIQUE INDEX uq_placement_branch_level 
ON placement_packages (institute_id, branch_name) WHERE branch_name IS NOT NULL;

-- 6. Marks to Percentile & AIR Grid Table (1,204 records; 301 marks x 4 years)
CREATE TABLE marks_rank_grid (
    year SMALLINT NOT NULL,               -- 2024, 2025, 2026, 2027
    marks NUMERIC(5, 2) NOT NULL,         -- 0 to 300
    percentile NUMERIC(7, 4) NOT NULL,
    percentile_low NUMERIC(7, 4) NOT NULL,
    percentile_high NUMERIC(7, 4) NOT NULL,
    air INTEGER NOT NULL,
    air_best INTEGER NOT NULL,
    air_worst INTEGER NOT NULL,
    basis VARCHAR(32) NOT NULL,
    confidence VARCHAR(16) NOT NULL,
    PRIMARY KEY (year, marks)
);
CREATE INDEX idx_marks_rank_pct ON marks_rank_grid (year, percentile);
CREATE INDEX idx_marks_rank_air ON marks_rank_grid (year, air);

-- 7. Category Rank Calibration Table (33 records - Phase 2A corrected precision)
CREATE TABLE category_rank_calibration (
    id SERIAL PRIMARY KEY,
    year SMALLINT NOT NULL,
    category VARCHAR(16) NOT NULL,        -- 'GEN-EWS', 'OBC-NCL', 'SC', 'ST'
    -- PHASE 2A CORRECTION: NUMERIC(12, 8) preserves official 7-decimal NTA thresholds (e.g. 81.3266412)
    percentile NUMERIC(12, 8) NOT NULL,
    category_rank INTEGER NOT NULL,
    source TEXT,
    notes TEXT,
    -- PHASE 2A CORRECTION: Includes year dimension for multi-year support
    UNIQUE (year, category, percentile)
);
CREATE INDEX idx_cat_calib_lookup ON category_rank_calibration (category, percentile ASC);

-- 8. Shift-wise Historical Records Table (1,352 records - Phase 2A corrected uniqueness)
CREATE TABLE shift_records (
    id SERIAL PRIMARY KEY,
    year SMALLINT NOT NULL,
    session VARCHAR(16) NOT NULL,         -- 'january', 'april'
    shift_id VARCHAR(64) NOT NULL,        -- e.g. '04M', '2026_01_27_shift_1'
    exam_date DATE NOT NULL,
    shift VARCHAR(16) NOT NULL,           -- 'Morning', 'Evening'
    percentile NUMERIC(7, 4) NOT NULL,
    marks SMALLINT NOT NULL,
    record_type VARCHAR(32) DEFAULT 'observed',
    read_quality VARCHAR(32) DEFAULT 'verified',
    -- PHASE 2A CORRECTION: Year and session included; prevents 276 collisions across April sessions
    UNIQUE (year, session, shift_id, percentile)
);
CREATE INDEX idx_shifts_query ON shift_records (year, session, exam_date, shift);

-- 9. System Manifest & Projections Configuration (Single-row or Key-Value)
CREATE TABLE system_manifest (
    key VARCHAR(64) PRIMARY KEY,
    payload JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 5. Complete Source-to-Database Column Mapping

The table below maps every single source column to its destination PostgreSQL column and data type:

### 5.1 `data/josaa/josaa_master_clean.csv` $\to$ `josaa_cutoffs` & Parent Tables

| Source CSV Column | Target Table | Target Column | Data Type | Audit Notes & Transformation |
| :--- | :--- | :--- | :--- | :--- |
| `institute` | `institutes` | `name` & `id` | `VARCHAR(255)` | Unique institution name. Normalized ID slug generated. |
| `type` | `institutes` | `type` | `VARCHAR(16)` | Preserved: `NIT`, `3IT`, `CFI`, `IIT`. |
| `rank_type` | `institutes` | `rank_type` | `VARCHAR(32)` | Preserved: `JEE_MAIN`, `JEE_ADVANCED`. |
| `program` | `institute_programs` | `full_program_name`| `VARCHAR(255)` | Full program title including duration & degree. |
| `branch` | `institute_programs` | `branch_name` | `VARCHAR(128)` | Department branch name. |
| `degree` | `institute_programs` | `degree` | `VARCHAR(64)` | Standardized degree title. |
| `duration` | `institute_programs` | `duration` | `VARCHAR(32)` | Program length (`4 Years`, `5 Years`). |
| `year` | `josaa_cutoffs` | `year` | `SMALLINT` | 2024, 2025, 2026. |
| `round` | `josaa_cutoffs` | `round` | `SMALLINT` | Round number (1 through 6). |
| `quota` | `josaa_cutoffs` | `quota` | `VARCHAR(16)` | `AI`, `HS`, `OS`, `GO`, `JK`, `LA`. |
| `category` | `josaa_cutoffs` | `seat_category` | `VARCHAR(32)` | `OPEN`, `EWS`, `OBC-NCL`, `SC`, `ST`, + PwD. |
| `gender` | `josaa_cutoffs` | `gender` | `VARCHAR(32)` | `Gender-Neutral`, `Female-only`. |
| `orank` | `josaa_cutoffs` | `opening_rank` | `INTEGER` | 100% non-null positive integers. |
| `crank` | `josaa_cutoffs` | `closing_rank` | `INTEGER` | 100% non-null positive integers. |
| `data_type` | `josaa_cutoffs` | `data_type` | `VARCHAR(32)` | Preserved: `Official`. |
| `source` | `josaa_cutoffs` | `source` | `VARCHAR(64)` | Preserved: `JoSAA Official Archive` / `2026 Allotment Report`. |

### 5.2 `data/reference/placement_packages.csv` $\to$ `placement_packages`

| Source CSV Column | Target Column | Data Type | Audit Notes & Transformation |
| :--- | :--- | :--- | :--- |
| `institute_id` | `institute_id` | `VARCHAR(64)` | Foreign key to `institutes.id`. |
| `branch_name` | `branch_name` | `VARCHAR(128)` | Nullable. When NULL, indicates institute-wide summary. |
| `average_lpa` | `average_lpa` | `NUMERIC(6, 2)` | 100% non-null float values. |
| `median_lpa` | `median_lpa` | `NUMERIC(6, 2)` | 100% non-null float values. |
| `highest_lpa` | `highest_lpa` | `NUMERIC(6, 2)` | Nullable (30 rows unrecorded). Max: 135.00 LPA. |
| `placement_year` | `placement_year` | `SMALLINT` | Placement cohort year (2024). |
| `metric_type` | `metric_type` | `VARCHAR(16)` | `CTC`. |
| `source_url` | `source_url` | `TEXT` | Official report URL. |
| `source_type` | `source_type` | `VARCHAR(64)` | `official_placement_report`, `nirf_submission`. |
| `verification_status`| `verification_status`| `VARCHAR(32)` | `verified_official`. |
| `last_updated` | `last_updated` | `VARCHAR(16)` | `2024-11`. |

### 5.3 `data/combined/marks_percentile_air.csv` $\to$ `marks_rank_grid`

| Source CSV Column | Target Column | Data Type | Audit Notes |
| :--- | :--- | :--- | :--- |
| `year` | `year` | `SMALLINT` | Composite PK (2024–2027). |
| `marks` | `marks` | `NUMERIC(5, 2)` | Composite PK (0 to 300). |
| `percentile` | `percentile` | `NUMERIC(7, 4)` | 4 decimal precision. |
| `percentile_low` | `percentile_low` | `NUMERIC(7, 4)` | Lower uncertainty bound. |
| `percentile_high` | `percentile_high` | `NUMERIC(7, 4)` | Upper uncertainty bound. |
| `air` | `air` | `INTEGER` | Median estimated rank (max: ~1.53M). |
| `air_best` | `air_best` | `INTEGER` | Best-case rank bound. |
| `air_worst` | `air_worst` | `INTEGER` | Worst-case rank bound. |
| `basis` | `basis` | `VARCHAR(32)` | `observed_interpolated`, `mixed`, `reference_scaled`. |
| `confidence` | `confidence` | `VARCHAR(16)` | `high`, `medium`, `low`. |

### 5.4 `data/josaa/category_rank_calibration.csv` $\to$ `category_rank_calibration`

| Source CSV Column | Target Column | Data Type | Audit Notes |
| :--- | :--- | :--- | :--- |
| `year` | `year` | `SMALLINT` | 2024 (multi-year support). |
| `category` | `category` | `VARCHAR(16)` | `GEN-EWS`, `OBC-NCL`, `SC`, `ST`. |
| `percentile` | `percentile` | `NUMERIC(12, 8)` | **Preserves up to 7 official NTA decimals**. |
| `category_rank` | `category_rank` | `INTEGER` | Official qualifier / scorecard rank. |
| `source` | `source` | `TEXT` | `Official NTA qualifier cutoff / scorecard`. |
| `notes` | `notes` | `TEXT` | Calibration notes. |

### 5.5 `data/{2024,2025,2026}/*_shiftwise.csv` $\to$ `shift_records`

| Source CSV Column | Target Column | Data Type | Audit Notes |
| :--- | :--- | :--- | :--- |
| `year` | `year` | `SMALLINT` | 2024, 2025, 2026. |
| `session` | `session` | `VARCHAR(16)` | `january`, `april`. |
| `shift_id` | `shift_id` | `VARCHAR(64)` | Shift identifier (e.g. `'04M'`, `'2026_01_27_shift_1'`). |
| `exam_date` | `exam_date` | `DATE` | ISO Date `YYYY-MM-DD`. |
| `shift` | `shift` | `VARCHAR(16)` | `Morning`, `Evening`. |
| `percentile` | `percentile` | `NUMERIC(7, 4)` | Observed percentile. |
| `marks` | `marks` | `SMALLINT` | Raw score (0 to 300). |
| `record_type` | `record_type` | `VARCHAR(32)` | `observed`. |
| `read_quality` | `read_quality` | `VARCHAR(32)` | `verified`, `source_suspect`. |

---

## 6. Exclusion List: Intermediate & Redundant Files

| File / Folder Path | Type | Reason for Exclusion |
| :--- | :--- | :--- |
| `data/josaaa/*.csv` (16 raw CSV files) | Raw Data Dumps | Heterogeneous, raw uncleaned scrapes with differing column counts (7 vs 10 cols). `josaa_master_clean.csv` already cleaned and normalized all 194,312 rows. Importing raw files would pollute the database. |
| `data/combined/marks_percentile.csv` | Intermediate Artifact | Identical in rows (1,204) to `marks_percentile_air.csv` but lacks AIR columns. Fully redundant. |
| `data/combined/percentile_air.csv` | Intermediate Pre-baked Grid | 4,008 rows generated for rough 0.1 percentile grid lookups. The prediction engine evaluates AIR dynamically from `marks_rank_grid`. Storing this table in PostgreSQL is redundant. |
| `data/{year}/session_summary.csv` | Pre-calculated Aggregate | Contains 2 lines per year (`shifts_observed`, `min_percentile_observed`). Can be derived instantly via `COUNT(DISTINCT shift_id)` on `shift_records`. |
| `data/reference/low_range_reference.csv` | Build-time Reference | Used strictly during offline PCHIP calculation in `build_combined.py` to project sub-90 marks. Not queried at runtime. |
| `data/**/__pycache__/` & `build_*.py` | Code & Bytecode | Python source code and cached binaries; executable files, not data. |

---

## 7. Remaining Assumptions Requiring Confirmation

1. **State Labeling for IIITs & Central Universities:**
   - In `data/josaa/josaa_cutoff_index.json`, non-NIT institutions that did not have explicit entries in `INST_STATE_MAP` defaulted to `state = 'India'`.
   - Because all IIITs and GFTIs admit strictly under the All-India Quota (`AI`), this has zero impact on cutoff matching.
   - *Confirmation:* The migration preserves `state = 'India'` for these institutions to maintain exact output parity with the existing JSON index.
2. **Materialized View Refresh Strategy:**
   - The materialized view `josaa_latest_cutoffs_mv` pre-calculates the latest round for each program and quota.
   - *Confirmation:* In production, JoSAA cutoffs are updated only when official counselling rounds conclude (annually or per round). Refreshing the view upon data load (`REFRESH MATERIALIZED VIEW josaa_latest_cutoffs_mv`) guarantees optimal performance without runtime re-calculation overhead.

---

## 8. Schema Correctness & Safety Verdict

| Verification Item | Pre-Audit Status | Post-Audit Status | Verdict |
| :--- | :---: | :---: | :---: |
| 1. Full JoSAA Column Preservation | Missing 2 fields | 16 of 16 columns preserved | **PASS** |
| 2. Program Identity Uniqueness | 83 Collisions | `(institute_id, full_program_name)` 0 collisions | **PASS** |
| 3. Cutoff Composite Uniqueness | Untested | 194,312 rows tested: 0 collisions | **PASS** |
| 4. Calibration Uniqueness & Precision | 4 decimal limit | 8 decimal precision + year dimension | **PASS** |
| 5. Placement Expression Constraint | Invalid SQL syntax | Two partial unique indexes | **PASS** |
| 6. Latest Round/Year JoSAA Logic | Untested | 100% equivalent to Python logic | **PASS** |
| 7. PostgreSQL DDL Syntax Compliance | 1 syntax error | Fully valid, idiomatic PostgreSQL 16+ DDL | **PASS** |
| 8. Shift Records Uniqueness | 276 Collisions | `(year, session, shift_id, percentile)` 0 collisions | **PASS** |

### FINAL VERDICT: **PASS**

> The corrected PostgreSQL DDL in Section 4 is **100% mathematically verified, syntax-checked, and relationally sound**. It is safe for execution on Neon PostgreSQL when the user approves Phase 2B.
