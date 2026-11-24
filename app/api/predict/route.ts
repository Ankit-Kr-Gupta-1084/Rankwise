import { NextResponse } from "next/server";
import { predict, predictByPercentile, getProjectedYear, Year, loadGridFromDb } from "../../../lib/rankwise/predict";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const marksParam = u.searchParams.get("marks");
  const percentileParam = u.searchParams.get("percentile");
  const yearParam = u.searchParams.get("year");
  const year = (yearParam ? Number(yearParam) : getProjectedYear()) as Year;

  // Hydrate grid from PostgreSQL if available
  await loadGridFromDb();

  try {
    if (percentileParam !== null && percentileParam !== "") {
      const percentile = Number(percentileParam);
      return NextResponse.json(predictByPercentile(percentile, year));
    }
    const marks = Number(marksParam);
    return NextResponse.json(predict(marks, year));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
