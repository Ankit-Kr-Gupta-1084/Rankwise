import { NextResponse } from "next/server";
import { getYearsManifest } from "../../../lib/rankwise/predict";

export async function GET() {
  try {
    const manifest = getYearsManifest();
    return NextResponse.json(manifest);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

