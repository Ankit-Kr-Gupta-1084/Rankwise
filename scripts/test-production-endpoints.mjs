import { spawn } from "child_process";

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log("======================================================================");
  console.log(" RankWise Production Server & Endpoint Integration Test");
  console.log("======================================================================\n");

  const port = 3099;
  const server = spawn("npx.cmd", ["next", "start", "-p", String(port)], {
    shell: true,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });

  server.stdout.on("data", (data) => {
    // console.log(`[Next.js stdout]: ${data.toString().trim()}`);
  });
  server.stderr.on("data", (data) => {
    console.error(`[Next.js stderr]: ${data.toString().trim()}`);
  });

  // Wait for server to start
  console.log(`Starting Next.js production server on port ${port}...`);
  let isReady = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const res = await fetch(`http://localhost:${port}/api/years`);
      if (res.ok) {
        isReady = true;
        break;
      }
    } catch {}
    await wait(500);
  }

  if (!isReady) {
    server.kill();
    throw new Error("Next.js production server failed to start within 15 seconds.");
  }
  console.log("✓ Next.js production server is live and responsive!\n");

  let allPassed = true;

  try {
    // 1. /api/db-test
    console.log("[TEST 1/6] GET /api/db-test...");
    const dbRes = await fetch(`http://localhost:${port}/api/db-test`);
    const dbData = await dbRes.json();
    console.log(`  Status: ${dbRes.status}`);
    console.log(`  Database: ${dbData.database}`);
    console.log(`  Institutes: ${dbData.tables?.institutes}, Cutoffs: ${dbData.tables?.josaa_cutoffs}`);
    if (dbData.success && dbData.tables?.institutes === 138 && dbData.tables?.josaa_cutoffs === 194312) {
      console.log("  ✓ TEST 1 PASSED: Neon database verified via API!\n");
    } else {
      console.error("  ✗ TEST 1 FAILED:", dbData);
      allPassed = false;
    }

    // 2. /api/years
    console.log("[TEST 2/6] GET /api/years...");
    const yRes = await fetch(`http://localhost:${port}/api/years`);
    const yData = await yRes.json();
    console.log(`  Status: ${yRes.status}`);
    console.log(`  Available Years: [${yData.availableYears?.join(", ")}], Projected: ${yData.projectedYear}`);
    if (yData.availableYears?.length >= 4 && yData.projectedYear === 2027) {
      console.log("  ✓ TEST 2 PASSED: System manifest returned accurately!\n");
    } else {
      console.error("  ✗ TEST 2 FAILED:", yData);
      allPassed = false;
    }

    // 3. /api/shifts?year=2024&session=january
    console.log("[TEST 3/6] GET /api/shifts?year=2024&session=january...");
    const sRes = await fetch(`http://localhost:${port}/api/shifts?year=2024&session=january`);
    const sData = await sRes.json();
    console.log(`  Status: ${sRes.status}`);
    console.log(`  Distinct shifts: ${sData.shifts?.length}, Percentiles tracked: ${sData.percentiles?.length}`);
    if (sData.shifts?.length === 10 && sData.percentiles?.length > 10) {
      console.log("  ✓ TEST 3 PASSED: Shift records API verified!\n");
    } else {
      console.error("  ✗ TEST 3 FAILED:", sData);
      allPassed = false;
    }

    // 4. /api/predict?marks=150&year=2027
    console.log("[TEST 4/6] GET /api/predict?marks=150&year=2027...");
    const pRes = await fetch(`http://localhost:${port}/api/predict?marks=150&year=2027`);
    const pData = await pRes.json();
    console.log(`  Status: ${pRes.status}`);
    console.log(`  Marks: ${pData.marks} -> Percentile: ${pData.percentile}%, AIR: ${pData.air}`);
    if (pData.marks === 150 && pData.percentile > 90 && pData.air > 0) {
      console.log("  ✓ TEST 4 PASSED: Prediction API working with Neon marks_rank_grid!\n");
    } else {
      console.error("  ✗ TEST 4 FAILED:", pData);
      allPassed = false;
    }

    // 5. POST /api/college-finder/predict
    console.log("[TEST 5/6] POST /api/college-finder/predict...");
    const cfRes = await fetch(`http://localhost:${port}/api/college-finder/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        inputType: "marks",
        marks: 180,
        category: "OBC-NCL",
        seatPool: "Gender-Neutral",
        domicileState: "Delhi",
        difficulty: "Moderate",
        year: 2027,
      }),
    });
    const cfData = await cfRes.json();
    console.log(`  Status: ${cfRes.status}`);
    console.log(`  Colleges Found: ${cfData.colleges?.length}, Total Branches: ${cfData.totalColleges}`);
    if (cfData.colleges?.length > 0 && cfData.totalColleges > 0) {
      console.log(`  Sample Top Match: ${cfData.colleges[0].instituteName} (${cfData.colleges[0].branches.length} branches)`);
      console.log("  ✓ TEST 5 PASSED: College Finder API fully operational!\n");
    } else {
      console.error("  ✗ TEST 5 FAILED:", cfData);
      allPassed = false;
    }

    // 6. Homepage GET /
    console.log("[TEST 6/6] GET / (Homepage HTML)...");
    const hRes = await fetch(`http://localhost:${port}/`);
    const html = await hRes.text();
    console.log(`  Status: ${hRes.status}, HTML length: ${html.length}`);
    if (hRes.ok && html.includes("RankWise") || html.includes("JEE")) {
      console.log("  ✓ TEST 6 PASSED: Homepage HTML renders successfully!\n");
    } else {
      console.error("  ✗ TEST 6 FAILED");
      allPassed = false;
    }

  } finally {
    server.kill();
  }

  console.log("======================================================================");
  if (allPassed) {
    console.log(" ALL PRODUCTION ENDPOINTS & DATABASE TESTS PASSED WITH 100% SUCCESS!");
  } else {
    console.error(" ONE OR MORE ENDPOINT TESTS FAILED.");
    process.exit(1);
  }
  console.log("======================================================================\n");
}

run().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
