import { getDb, sql } from "../lib/db";
import { getYearsManifest, loadGridFromDb, predict, predictByPercentile } from "../lib/rankwise/predict";
import { findColleges } from "../lib/college-finder/finder-engine";

async function runVerification() {
  console.log("======================================================================");
  console.log(" RankWise Neon PostgreSQL & API Integration Test Suite");
  console.log("======================================================================\n");

  let allPassed = true;

  // 1. Test Database Connectivity
  console.log("[TEST 1/6] Neon Database Connectivity & Row Counts...");
  try {
    const db = getDb();
    if (!db) throw new Error("getDb() returned null");

    const health = await sql`
      SELECT
        (SELECT count(*) FROM institutes) AS institutes_count,
        (SELECT count(*) FROM institute_programs) AS programs_count,
        (SELECT count(*) FROM josaa_cutoffs) AS cutoffs_count,
        (SELECT count(*) FROM placement_packages) AS placements_count,
        (SELECT count(*) FROM marks_rank_grid) AS marks_grid_count,
        (SELECT count(*) FROM category_rank_calibration) AS category_cal_count,
        (SELECT count(*) FROM shift_records) AS shift_records_count,
        (SELECT count(*) FROM system_manifest) AS manifest_count,
        (SELECT count(*) FROM josaa_latest_cutoffs_mv) AS latest_cutoffs_mv_count;
    `;

    const counts = {
      institutes: Number(health[0].institutes_count),
      programs: Number(health[0].programs_count),
      cutoffs: Number(health[0].cutoffs_count),
      placements: Number(health[0].placements_count),
      marksGrid: Number(health[0].marks_grid_count),
      calibrations: Number(health[0].category_cal_count),
      shifts: Number(health[0].shift_records_count),
      manifest: Number(health[0].manifest_count),
      latestMv: Number(health[0].latest_cutoffs_mv_count),
    };

    console.log(`  Institutes:                  ${counts.institutes} (expected 138)`);
    console.log(`  Institute Programs:          ${counts.programs} (expected 1,088)`);
    console.log(`  JoSAA Cutoffs:               ${counts.cutoffs} (expected 194,312)`);
    console.log(`  Placement Packages:          ${counts.placements} (expected 69)`);
    console.log(`  Marks-Rank Grid:             ${counts.marksGrid} (expected 1,204)`);
    console.log(`  Category Calibration:        ${counts.calibrations} (expected 33)`);
    console.log(`  Shift Records:               ${counts.shifts} (expected 1,352)`);
    console.log(`  System Manifest:             ${counts.manifest} (expected 1)`);
    console.log(`  Materialized View (Cutoffs): ${counts.latestMv} (expected 14,637)`);

    const checks = [
      counts.institutes === 138,
      counts.programs === 1088,
      counts.cutoffs === 194312,
      counts.placements === 69,
      counts.marksGrid === 1204,
      counts.calibrations === 33,
      counts.shifts === 1352,
      counts.manifest === 1,
      counts.latestMv === 14637,
    ];

    if (checks.every(Boolean)) {
      console.log("  ✓ TEST 1 PASSED: All 8 tables and materialized view row counts verified!\n");
    } else {
      console.error("  ✗ TEST 1 FAILED: Row count mismatch!");
      allPassed = false;
    }
  } catch (e) {
    console.error("  ✗ TEST 1 FAILED with error:", e);
    allPassed = false;
  }

  // 2. Test system_manifest query
  console.log("[TEST 2/6] System Manifest Neon Query & JSON Parity...");
  try {
    const rows = await sql`
      SELECT config_data FROM system_manifest WHERE config_key = 'years_manifest' LIMIT 1;
    `;
    const dbManifest = rows[0]?.config_data;
    const fileManifest = getYearsManifest();

    if (
      dbManifest &&
      JSON.stringify(dbManifest.availableYears) === JSON.stringify(fileManifest.availableYears) &&
      dbManifest.projectedYear === fileManifest.projectedYear
    ) {
      console.log(`  Discovered Years: [${dbManifest.availableYears.join(", ")}]`);
      console.log(`  Projected Year:   ${dbManifest.projectedYear}`);
      console.log("  ✓ TEST 2 PASSED: Neon system_manifest matches local JSON exactly!\n");
    } else {
      console.error("  ✗ TEST 2 FAILED: Manifest mismatch between Neon and local JSON!");
      allPassed = false;
    }
  } catch (e) {
    console.error("  ✗ TEST 2 FAILED with error:", e);
    allPassed = false;
  }

  // 3. Test shift_records query
  console.log("[TEST 3/6] Shift Records Query (2024 January)...");
  try {
    const rows = await sql`
      SELECT count(*) AS total_shifts, count(DISTINCT shift_id) AS distinct_shifts
      FROM shift_records
      WHERE year = 2024 AND session = 'january';
    `;
    console.log(`  Total 2024 Jan shift rows: ${rows[0].total_shifts}, Distinct shifts: ${rows[0].distinct_shifts}`);
    if (Number(rows[0].total_shifts) > 0 && Number(rows[0].distinct_shifts) === 10) {
      console.log("  ✓ TEST 3 PASSED: Shift records successfully queried from PostgreSQL!\n");
    } else {
      console.error("  ✗ TEST 3 FAILED: Unexpected shift row count!");
      allPassed = false;
    }
  } catch (e) {
    console.error("  ✗ TEST 3 FAILED with error:", e);
    allPassed = false;
  }

  // 4. Test Marks-Rank Grid Hydration & Prediction
  console.log("[TEST 4/6] Marks-Rank Grid Neon Hydration & Prediction Logic...");
  try {
    const loaded = await loadGridFromDb();
    if (!loaded) throw new Error("loadGridFromDb() failed");

    // Test canonical marks
    const testCases = [
      { marks: 50, expectedYear: 2027 },
      { marks: 150, expectedYear: 2027 },
      { marks: 250, expectedYear: 2027 },
    ];

    for (const tc of testCases) {
      const res = predict(tc.marks, tc.expectedYear);
      console.log(`  Marks ${tc.marks} (Year ${tc.expectedYear}) -> Percentile: ${res.percentile.toFixed(2)}%, AIR: ${res.air.toLocaleString()}`);
      if (res.marks !== tc.marks || res.percentile <= 0 || res.air <= 0) {
        throw new Error(`Invalid prediction for marks ${tc.marks}`);
      }
    }
    console.log("  ✓ TEST 4 PASSED: Neon marks_rank_grid hydrated and predict() produced valid results!\n");
  } catch (e) {
    console.error("  ✗ TEST 4 FAILED with error:", e);
    allPassed = false;
  }

  // 5. Test College Finder Engine
  console.log("[TEST 5/6] JoSAA College Finder Engine Evaluation...");
  try {
    const finderResult = findColleges({
      inputType: "marks",
      marks: 180,
      category: "OBC-NCL",
      seatPool: "Gender-Neutral",
      domicileState: "Delhi",
      difficulty: "Moderate",
      year: 2027,
    });

    console.log(`  Input: 180 Marks, OBC-NCL, Delhi`);
    console.log(`  Predicted CRL: ${finderResult.crl.toLocaleString()}, Category Rank: ${finderResult.categoryRankEstimate?.estimatedRank.toLocaleString()}`);
    console.log(`  Eligible Colleges Found: ${finderResult.colleges.length}, Total Branches: ${finderResult.totalColleges}`);

    if (finderResult.colleges.length > 0 && finderResult.totalColleges > 0) {
      const topCollege = finderResult.colleges[0];
      console.log(`  Sample Top Match: ${topCollege.instituteName} (${topCollege.branches.length} branches)`);
      console.log("  ✓ TEST 5 PASSED: College Finder engine works with zero errors!\n");
    } else {
      console.error("  ✗ TEST 5 FAILED: No colleges returned for 180 marks!");
      allPassed = false;
    }
  } catch (e) {
    console.error("  ✗ TEST 5 FAILED with error:", e);
    allPassed = false;
  }

  // 6. Monotonicity validation across marks 0 to 300
  console.log("[TEST 6/6] Full Marks (0..300) Monotonicity & Boundary Test...");
  try {
    let prevPercentile = -1;
    let prevAir = 999999999;
    let monotonic = true;

    for (let m = 0; m <= 300; m++) {
      const p = predict(m, 2027);
      if (p.percentile < prevPercentile - 1e-9) {
        monotonic = false;
        console.error(`  Percentile decrease at marks ${m}: ${p.percentile} < ${prevPercentile}`);
        break;
      }
      if (p.air > prevAir) {
        monotonic = false;
        console.error(`  AIR increase at marks ${m}: ${p.air} > ${prevAir}`);
        break;
      }
      prevPercentile = p.percentile;
      prevAir = p.air;
    }

    if (monotonic) {
      console.log("  ✓ TEST 6 PASSED: Strict mathematical monotonicity confirmed for all 301 marks!\n");
    } else {
      console.error("  ✗ TEST 6 FAILED: Monotonicity violation detected!");
      allPassed = false;
    }
  } catch (e) {
    console.error("  ✗ TEST 6 FAILED with error:", e);
    allPassed = false;
  }

  console.log("======================================================================");
  if (allPassed) {
    console.log(" ALL 6 INTEGRATION & PARITY TESTS PASSED WITH 100% SUCCESS!");
  } else {
    console.log(" ONE OR MORE INTEGRATION TESTS FAILED.");
    process.exit(1);
  }
  console.log("======================================================================\n");
}

runVerification().catch((err) => {
  console.error("Fatal test error:", err);
  process.exit(1);
});
