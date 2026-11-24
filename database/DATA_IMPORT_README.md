# RankWise Production PostgreSQL Data Import Guide

This guide documents the execution, safety guarantees, conflict handling, and rollback limitations of the automated data importer script:
`scripts/import-rankwise-data.ts`

---

## 1. Prerequisites & Execution Environment

The script is built specifically for the RankWise stack and requires **zero external npm packages** for CSV parsing. It leverages **native Node.js v20.6+ / v22+ / v24+ TypeScript execution** (`--experimental-strip-types`) and native environment file loading (`--env-file=.env.local`).

### Prerequisites
1. PostgreSQL schema migration `001_initial_schema.sql` has been executed on the target Neon database.
2. The `DATABASE_URL` connection string is present in `.env.local`:
   ```env
   DATABASE_URL="postgres://user:password@ep-xyz.neon.tech/rankwise_db?sslmode=require"
   ```
3. All source datasets exist under `data/`:
   - `data/josaa/josaa_master_clean.csv` (194,312 rows)
   - `data/reference/placement_packages.csv` (69 rows)
   - `data/combined/marks_percentile_air.csv` (1,204 rows)
   - `data/josaa/category_rank_calibration.csv` (33 rows)
   - `data/{2024,2025,2026}/*_shiftwise.csv` (6 files, 1,352 rows)
   - `data/combined/years_manifest.json` (1 object)

### Execution Command
Run the importer from the project root (`c:\Users\priya\rankwise`):

```bash
node --env-file=.env.local --experimental-strip-types scripts/import-rankwise-data.ts
```

*(Note: In PowerShell, ensure you are in the project root directory. Do not pass credentials on the command line.)*

---

## 2. Foreign-Key Safe Ingestion Pipeline

To respect PostgreSQL relational constraints and primary/foreign key hierarchies, data is imported strictly in this 8-stage sequence:

```mermaid
flowchart TD
    A["Stage 1: institutes (138 rows)"] --> B["Stage 2: institute_programs (1,088 rows)"]
    B --> C["Stage 3: josaa_cutoffs (194,312 rows)"]
    C --> D["Stage 4: REFRESH MATERIALIZED VIEW josaa_latest_cutoffs_mv"]
    D --> E["Stage 5: placement_packages (69 rows)"]
    E --> F["Stage 6: marks_rank_grid (1,204 rows)"]
    F --> G["Stage 7: category_rank_calibration (33 rows) & shift_records (1,352 rows)"]
    G --> H["Stage 8: system_manifest (1 row)"]
    H --> I["Stage 9: Automated Row Count Audit & Parity Verification"]
```

### Dynamic ID Resolution Strategy
- **`institutes.id`**: Uses official placement IDs for the 33 tracked institutes (e.g., `'NIT-TRICHY'`, `'MNNIT-ALLAHABAD'`) and clean deterministic slugs for the remaining 105 institutes.
- **`institute_programs.id`**: Resolves `program_id` dynamically from PostgreSQL by querying `SELECT id, institute_id, full_program_name FROM institute_programs`. **Never assumes predictable SERIAL sequences.**
- **`josaa_cutoffs.program_id`**: In-memory lookup maps each JoSAA row's `(institute_id, full_program_name)` to its actual database `program_id`.

---

## 3. Conflict Handling & Idempotency Strategy

Every table operation uses explicit `ON CONFLICT (...) DO UPDATE SET ...` matching the table's primary or unique constraint.

| Target Table | Unique Constraint / Conflict Target | Conflict Action | Safety Guarantee |
| :--- | :--- | :--- | :--- |
| `institutes` | `ON CONFLICT (name)` | `DO UPDATE SET type, rank_type, state, city, nirf_rank` | Safe to re-run; updates metadata if changed. |
| `institute_programs` | `ON CONFLICT (institute_id, full_program_name)` | `DO UPDATE SET branch_name, degree, duration` | Prevents 4-yr B.Tech vs 5-yr Dual Degree merge collisions. |
| `josaa_cutoffs` | `ON CONFLICT (program_id, year, round, quota, seat_category, gender)` | `DO UPDATE SET opening_rank, closing_rank, data_type, source` | Idempotent; preserves exact ranks without creating duplicates. |
| `placement_packages` (Institute-wide) | `ON CONFLICT (institute_id) WHERE branch_name IS NULL` | `DO UPDATE SET average_lpa, median_lpa, highest_lpa, ...` | Partial index match; guarantees 1 summary per institute. |
| `placement_packages` (Branch-level) | `ON CONFLICT (institute_id, branch_name) WHERE branch_name IS NOT NULL` | `DO UPDATE SET average_lpa, median_lpa, highest_lpa, ...` | Partial index match; guarantees 1 record per department. |
| `marks_rank_grid` | `ON CONFLICT (year, marks)` | `DO UPDATE SET percentile, air, air_best, air_worst, ...` | Replaces or updates grid cells cleanly. |
| `category_rank_calibration` | `ON CONFLICT (year, category, percentile)` | `DO UPDATE SET category_rank, source, notes` | Preserves 7-decimal NTA cutoffs without duplication. |
| `shift_records` | `ON CONFLICT (year, session, shift_id, percentile)` | `DO UPDATE SET marks, record_type, read_quality` | Multi-year key prevents duplicate collisions across April sessions. |
| `system_manifest` | `ON CONFLICT (key)` | `DO UPDATE SET payload, updated_at = NOW()` | Updates projection config JSONB in place. |

---

## 4. Batch Performance & Parameter Limits

- PostgreSQL limits parameterized statements to `65,535` parameters per query.
- For `josaa_cutoffs` (10 parameters per row):
  - Ingestion is chunked into batches of **500 rows** (`5,000` parameters per batch).
  - 194,312 rows are imported across **389 batches**.
  - This avoids memory spikes and HTTP payload timeouts on Neon Serverless.

---

## 5. Rollback Limitations & Recovery Strategy

### Limitations of Serverless HTTP Batching
- Because the script runs over Neon Serverless HTTP (`@neondatabase/serverless`), each chunked batch of 500 rows is an individual transaction.
- If a fatal network failure occurs halfway through `josaa_cutoffs` (e.g., at batch 200 of 389), rows from batches 1–200 remain committed in the database.
- **Why this is safe:** Because of our `ON CONFLICT (...) DO UPDATE` idempotency strategy, re-running the script will **not** fail, duplicate, or corrupt the data. It will simply overwrite/continue from where it left off until all 194,312 rows are verified.

### Clean Teardown / Full Reset (If Desired)
If you ever need to reset the data completely before re-importing:
```sql
TRUNCATE TABLE institutes, marks_rank_grid, category_rank_calibration, shift_records, system_manifest CASCADE;
REFRESH MATERIALIZED VIEW josaa_latest_cutoffs_mv;
```
*(Because of `ON DELETE CASCADE`, truncating `institutes` cleanly cascades to `institute_programs`, `josaa_cutoffs`, and `placement_packages`.)*

---

## 6. Expected Final Row Counts

Upon completion, the script automatically executes a consolidated database audit query. All counts must report `✓ PASS`:

| Database Object | Target Row Count | Validation Check |
| :--- | :---: | :---: |
| `institutes` | **138** | `count(*) === 138` |
| `institute_programs` | **1,088** | `count(*) === 1088` |
| `josaa_cutoffs` | **194,312** | `count(*) === 194312` |
| `josaa_latest_cutoffs_mv` | **~14,637** | `count(*) > 14000` |
| `placement_packages` | **69** | `count(*) === 69` |
| `marks_rank_grid` | **1,204** | `count(*) === 1204` |
| `category_rank_calibration` | **33** | `count(*) === 33` |
| `shift_records` | **1,352** | `count(*) === 1352` |
| `system_manifest` | **1** | `count(*) === 1` |

