// RankWise prediction engine. Reads data/combined/marks_percentile_air.csv and data/combined/years_manifest.json.
// Dynamically discovers all available years and the projected year.
// Every marks value in 0..300 returns a result; uncertainty is carried in the *_low/*_high fields.
import fs from "fs";
import path from "path";
import { getDb } from "@/lib/db";

export type Year = number;

export interface YearsManifest {
  observedYears: number[];
  projectedYear: number;
  availableYears: number[];
  incompleteYears?: Array<{ year: number; errors: string[] }>;
  projectionWeights?: Record<string, number>;
  generatedAt?: string;
}

export interface Prediction {
  year: Year; marks: number;
  percentile: number; percentileLow: number; percentileHigh: number;
  air: number; airBest: number; airWorst: number;      // airBest = better (smaller) rank
  confidence: "high" | "medium" | "low";
  basis: string;                                          // observed_interpolated | mixed | reference_scaled
  isProjection: boolean;
}

type Row = Omit<Prediction, "year" | "marks" | "isProjection">;
let cache: Map<number, Row[]> | null = null;
let manifestCache: YearsManifest | null = null;

export function getYearsManifest(): YearsManifest {
  if (manifestCache) return manifestCache;
  const manifestFile = path.join(process.cwd(), "data", "combined", "years_manifest.json");
  if (fs.existsSync(manifestFile)) {
    try {
      manifestCache = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
      return manifestCache!;
    } catch {
      // Fallback below
    }
  }
  // Fallback: discover from CSV data
  const years = getAvailableYears();
  const maxYear = years.length > 0 ? Math.max(...years) : 2027;
  const obs = years.filter((y) => y !== maxYear).sort((a, b) => a - b);
  manifestCache = {
    observedYears: obs,
    projectedYear: maxYear,
    availableYears: [...years].sort((a, b) => b - a),
    incompleteYears: []
  };
  return manifestCache!;
}

export function getAvailableYears(): number[] {
  const c = load();
  return Array.from(c.keys()).sort((a, b) => b - a);
}

export function getProjectedYear(): number {
  return getYearsManifest().projectedYear;
}

export function isProjectedYear(year: number): boolean {
  return year === getProjectedYear();
}

function load(): Map<number, Row[]> {
  if (cache) return cache;
  const file = path.join(process.cwd(), "data", "combined", "marks_percentile_air.csv");
  const [head, ...lines] = fs.readFileSync(file, "utf8").trim().split(/\r?\n/);
  const cols = head.split(",");
  const idx = (n: string) => cols.indexOf(n);
  cache = new Map();
  for (const ln of lines) {
    if (!ln.trim()) continue;
    const c = ln.split(","); const y = +c[idx("year")]; const m = +c[idx("marks")];
    if (!cache.has(y)) cache.set(y, []);
    cache.get(y)![m] = {
      percentile: +c[idx("percentile")], percentileLow: +c[idx("percentile_low")], percentileHigh: +c[idx("percentile_high")],
      air: +c[idx("air")], airBest: +c[idx("air_best")], airWorst: +c[idx("air_worst")],
      confidence: c[idx("confidence")] as Row["confidence"], basis: c[idx("basis")],
    };
  }
  return cache;
}

export async function loadGridFromDb(): Promise<boolean> {
  if (cache && cache.size > 0) return true;
  try {
    const db = getDb();
    if (!db) return false;
    const rows = await db`
      SELECT year, marks, percentile, percentile_low, percentile_high, air, air_best, air_worst, confidence, basis
      FROM marks_rank_grid
      ORDER BY year, marks ASC;
    `;
    if (!rows || rows.length === 0) return false;

    const newCache = new Map<number, Row[]>();
    for (const r of rows) {
      const y = Number(r.year);
      const m = Number(r.marks);
      if (!newCache.has(y)) newCache.set(y, []);
      newCache.get(y)![m] = {
        percentile: Number(r.percentile),
        percentileLow: Number(r.percentile_low),
        percentileHigh: Number(r.percentile_high),
        air: Number(r.air),
        airBest: Number(r.air_best),
        airWorst: Number(r.air_worst),
        confidence: r.confidence as Row["confidence"],
        basis: String(r.basis),
      };
    }
    cache = newCache;
    return true;
  } catch (err) {
    console.warn("PostgreSQL marks_rank_grid load failed, fallback to CSV:", err);
    return false;
  }
}

export function predict(marks: number, year?: Year): Prediction {
  if (!Number.isFinite(marks) || marks < 0 || marks > 300) throw new RangeError("marks must be between 0 and 300");
  const targetYear = year ?? getProjectedYear();
  const rows = load().get(targetYear);
  if (!rows) throw new Error(`no data for ${targetYear}`);
  const lo = Math.floor(marks), hi = Math.min(300, Math.ceil(marks)), t = marks - lo;
  const a = rows[lo], b = rows[hi];
  const mix = (x: number, y: number) => x + (y - x) * t;
  const mixLog = (x: number, y: number) => Math.round(Math.exp(mix(Math.log(x), Math.log(y))));
  return {
    year: targetYear, marks,
    percentile: mix(a.percentile, b.percentile), percentileLow: mix(a.percentileLow, b.percentileLow), percentileHigh: mix(a.percentileHigh, b.percentileHigh),
    air: mixLog(a.air, b.air), airBest: mixLog(a.airBest, b.airBest), airWorst: mixLog(a.airWorst, b.airWorst),
    confidence: t < 0.5 ? a.confidence : b.confidence, basis: t < 0.5 ? a.basis : b.basis,
    isProjection: isProjectedYear(targetYear),
  };
}

export function predictByPercentile(percentile: number, year?: Year): Prediction {
  if (!Number.isFinite(percentile) || percentile < 0 || percentile > 100) {
    throw new RangeError("percentile must be between 0 and 100");
  }
  const targetYear = year ?? getProjectedYear();
  const rows = load().get(targetYear);
  if (!rows) throw new Error(`no data for ${targetYear}`);

  // Find bounding marks
  let loM = 0;
  for (let m = 0; m <= 300; m++) {
    if (rows[m].percentile <= percentile) {
      loM = m;
    } else {
      break;
    }
  }
  const hiM = Math.min(300, loM + 1);
  if (loM === hiM || rows[hiM].percentile === rows[loM].percentile) {
    return predict(loM, targetYear);
  }
  const t = Math.max(0, Math.min(1, (percentile - rows[loM].percentile) / (rows[hiM].percentile - rows[loM].percentile)));
  const estimatedMarks = Math.round((loM + t * (hiM - loM)) * 10) / 10;
  return predict(estimatedMarks, targetYear);
}

export function predictByRank(rank: number, year?: Year): Prediction {
  if (!Number.isFinite(rank) || rank < 1) {
    throw new RangeError("rank must be at least 1");
  }
  const targetYear = year ?? getProjectedYear();
  const rows = load().get(targetYear);
  if (!rows) throw new Error(`no data for ${targetYear}`);

  // In rows, m goes 0..300. rows[0].air is highest rank (~1,400,000), rows[300].air is lowest rank (~101).
  let loM = 0;
  for (let m = 0; m <= 300; m++) {
    if (rows[m].air >= rank) {
      loM = m;
    } else {
      break;
    }
  }
  const hiM = Math.min(300, loM + 1);
  if (loM === hiM || rows[hiM].air === rows[loM].air) {
    return predict(loM, targetYear);
  }
  const logRank = Math.log(rank);
  const logLo = Math.log(rows[loM].air);
  const logHi = Math.log(rows[hiM].air);
  const t = (logLo === logHi) ? 0 : Math.max(0, Math.min(1, (logLo - logRank) / (logLo - logHi)));
  const estimatedMarks = Math.round((loM + t * (hiM - loM)) * 10) / 10;
  return predict(estimatedMarks, targetYear);
}
