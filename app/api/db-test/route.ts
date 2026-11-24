import { NextResponse } from "next/server";
import { sql, getDb } from "@/lib/db";

export async function GET() {
  const db = getDb();
  if (!db) {
    return NextResponse.json(
      {
        success: false,
        message: "Database connection failed (DATABASE_URL not set)",
      },
      { status: 500 }
    );
  }

  try {
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
        (SELECT count(*) FROM josaa_latest_cutoffs_mv) AS latest_cutoffs_mv_count,
        current_database() AS database,
        NOW() AS server_time;
    `;

    return NextResponse.json({
      success: true,
      message: "Neon PostgreSQL connected and all 8 tables + materialized view verified",
      database: health[0].database,
      serverTime: health[0].server_time,
      tables: {
        institutes: Number(health[0].institutes_count),
        institute_programs: Number(health[0].programs_count),
        josaa_cutoffs: Number(health[0].cutoffs_count),
        placement_packages: Number(health[0].placements_count),
        marks_rank_grid: Number(health[0].marks_grid_count),
        category_rank_calibration: Number(health[0].category_cal_count),
        shift_records: Number(health[0].shift_records_count),
        system_manifest: Number(health[0].manifest_count),
        josaa_latest_cutoffs_mv: Number(health[0].latest_cutoffs_mv_count),
      },
    });
  } catch (error) {
    console.error("Database health check failed:", error);
    return NextResponse.json(
      { success: false, message: "Database query failed", error: (error as Error).message },
      { status: 500 }
    );
  }
}
