import { NextResponse } from "next/server";
import { getYearsManifest } from "../../../lib/rankwise/predict";
import { getDb } from "@/lib/db";

export async function GET() {
  try {
    const db = getDb();
    if (db) {
      try {
        const rows = await db`
          SELECT payload
          FROM system_manifest
          WHERE key = 'years_manifest'
          LIMIT 1;
        `;
        if (rows && rows.length > 0 && rows[0].payload) {
          return NextResponse.json(rows[0].payload);
        }
      } catch (dbErr) {
        console.warn("Neon DB query for system_manifest failed, falling back to JSON:", dbErr);
      }
    }

    const manifest = getYearsManifest();
    return NextResponse.json(manifest);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
