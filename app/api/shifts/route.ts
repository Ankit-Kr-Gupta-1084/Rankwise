import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

// Returns the observed shift-wise table for one year + session, straight from data/<year>/<session>_shiftwise.csv
export async function GET(req: Request) {
  const u = new URL(req.url);
  const year = u.searchParams.get("year") ?? "";
  const session = u.searchParams.get("session") ?? "";
  if (!/^\d{4}$/.test(year) || !["january", "april"].includes(session)) {
    return NextResponse.json({ error: "year must be 4 digits and session january|april" }, { status: 400 });
  }

  const file = path.join(process.cwd(), "data", year, `${session}_shiftwise.csv`);
  if (!fs.existsSync(file)) {
    return NextResponse.json({ error: `Shift data not available for year ${year} (${session} session)` }, { status: 404 });
  }

  const [head, ...lines] = fs.readFileSync(file, "utf8").trim().split(/\r?\n/);
  const col = head.split(",");
  const i = (n: string) => col.indexOf(n);
  const shifts = new Map<string, { id: string; date: string; shift: string; cells: Record<string, { marks: number; quality: string }> }>();
  const percentiles = new Set<number>();
  for (const ln of lines) {
    if (!ln.trim()) continue;
    const c = ln.split(",");
    const id = c[i("shift_id")];
    if (!shifts.has(id)) shifts.set(id, { id, date: c[i("exam_date")], shift: c[i("shift")], cells: {} });
    const p = Number(c[i("percentile")]);
    percentiles.add(p);
    shifts.get(id)!.cells[String(p)] = { marks: Number(c[i("marks")]), quality: c[i("read_quality")] };
  }
  return NextResponse.json({
    percentiles: [...percentiles].sort((a, b) => b - a),
    shifts: [...shifts.values()].sort((a, b) => (a.date + a.shift < b.date + b.shift ? -1 : 1)),
  });
}
