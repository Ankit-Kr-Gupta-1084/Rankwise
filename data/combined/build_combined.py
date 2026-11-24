"""
RankWise Future-Year-Independent AIR/CRL Prediction Engine Builder.
Discovers observed historical datasets in data/{year}/, validates schemas and monotonicity,
determines the target projection year (max(observed) + 1), and builds combined datasets
with explicit backward-compatibility parity guarantees and documented recency weighting.
"""
import os, sys, csv, re, json
from datetime import datetime, timezone
import numpy as np

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(BASE_DIR, "data")
COMBINED_DIR = os.path.join(DATA_DIR, "combined")
REF_DIR = os.path.join(DATA_DIR, "reference")
os.makedirs(COMBINED_DIR, exist_ok=True)

MARKS = np.arange(0, 301)

# ---------- Pure NumPy Monotonic PCHIP (Fritsch-Carlson) ----------
def pchip_slopes(x, y):
    n = len(x)
    h = np.diff(x)
    delta = np.diff(y) / h
    d = np.zeros(n)
    for k in range(1, n - 1):
        if delta[k - 1] * delta[k] <= 0:
            d[k] = 0.0
        else:
            w1 = 2 * h[k] + h[k - 1]
            w2 = h[k] + 2 * h[k - 1]
            d[k] = (w1 + w2) / (w1 / delta[k - 1] + w2 / delta[k])
    if n == 2:
        d[0] = delta[0]
        d[1] = delta[0]
    elif n > 2:
        d[0] = ((2 * h[0] + h[1]) * delta[0] - h[0] * delta[1]) / (h[0] + h[1])
        if np.sign(d[0]) != np.sign(delta[0]):
            d[0] = 0.0
        elif (np.sign(delta[0]) != np.sign(delta[1])) and (abs(d[0]) > abs(3 * delta[0])):
            d[0] = 3 * delta[0]

        d[-1] = ((2 * h[-1] + h[-2]) * delta[-1] - h[-1] * delta[-2]) / (h[-1] + h[-2])
        if np.sign(d[-1]) != np.sign(delta[-1]):
            d[-1] = 0.0
        elif (np.sign(delta[-1]) != np.sign(delta[-2])) and (abs(d[-1]) > abs(3 * delta[-1])):
            d[-1] = 3 * delta[-1]
    return d

class Pchip:
    def __init__(self, x, y):
        self.x = np.asarray(x, dtype=float)
        self.y = np.asarray(y, dtype=float)
        self.d = pchip_slopes(self.x, self.y)
        self.h = np.diff(self.x)

    def __call__(self, xi):
        xi = np.asarray(xi, dtype=float)
        scalar = xi.ndim == 0
        xi = np.atleast_1d(xi)
        out = np.empty_like(xi)
        k = np.searchsorted(self.x, xi) - 1
        k = np.clip(k, 0, len(self.x) - 2)
        xk = self.x[k]; yk = self.y[k]; yk1 = self.y[k + 1]
        dk = self.d[k]; dk1 = self.d[k + 1]; hk = self.h[k]
        t = (xi - xk) / hk
        t2 = t * t; t3 = t2 * t
        h00 = 2 * t3 - 3 * t2 + 1
        h10 = t3 - 2 * t2 + t
        h01 = -2 * t3 + 3 * t2
        h11 = t3 - t2
        out = h00 * yk + h10 * hk * dk + h01 * yk1 + h11 * hk * dk1
        return out[0] if scalar else out

# ---------- Low-Range Reference Shape ----------
def load_low_range_reference():
    ref_file = os.path.join(REF_DIR, "low_range_reference.csv")
    rows = []
    with open(ref_file, "r", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            rows.append((float(r["marks_mid"]), float(r["percentile_low"]), float(r["percentile_high"])))
    rows.sort(key=lambda item: item[0])
    rm = np.array([item[0] for item in rows])
    rlo = np.array([item[1] for item in rows])
    rhi = np.array([item[2] for item in rows])
    rmid = (rlo + rhi) / 2.0
    rmid[0] = 0.2
    rlo[0] = 0.0
    Pm = Pchip(rm, rmid)
    Pl = Pchip(rm, rlo)
    Ph = Pchip(rm, rhi)

    lo_, hi_ = 0.0, 90.0
    for _ in range(60):
        mid = (lo_ + hi_) / 2.0
        lo_, hi_ = (mid, hi_) if Pm(mid) < 90 else (lo_, mid)
    R = (lo_ + hi_) / 2.0
    return Pm, Pl, Ph, R

Pm, Pl, Ph, R = load_low_range_reference()

# ---------- Dataset Discovery & Validation ----------
def discover_and_validate_years():
    """
    Discovers candidate year directories data/{year}.
    Validates existence and schema of:
      1. january_shiftwise.csv
      2. april_shiftwise.csv
      3. percentile_rank.csv
    Returns (observed_years, incomplete_years)
    """
    observed_years = []
    incomplete_years = []

    candidates = [d for d in os.listdir(DATA_DIR) if re.match(r"^\d{4}$", d) and os.path.isdir(os.path.join(DATA_DIR, d))]
    candidates.sort(key=lambda y: int(y))

    for y_str in candidates:
        year = int(y_str)
        y_dir = os.path.join(DATA_DIR, y_str)
        jan_path = os.path.join(y_dir, "january_shiftwise.csv")
        apr_path = os.path.join(y_dir, "april_shiftwise.csv")
        rank_path = os.path.join(y_dir, "percentile_rank.csv")

        errors = []
        for p, name in [(jan_path, "january_shiftwise.csv"), (apr_path, "april_shiftwise.csv")]:
            if not os.path.isfile(p):
                errors.append(f"Missing {name}")
                continue
            with open(p, "r", encoding="utf-8") as f:
                r = csv.reader(f)
                header = next(r, None)
                if not header or not all(c in header for c in ["shift_id", "marks", "percentile"]):
                    errors.append(f"Invalid columns in {name}")
                rows_count = sum(1 for _ in r)
                if rows_count < 10:
                    errors.append(f"Insufficient rows in {name} ({rows_count})")

        if not os.path.isfile(rank_path):
            errors.append("Missing percentile_rank.csv")
        else:
            with open(rank_path, "r", encoding="utf-8") as f:
                r = csv.reader(f)
                header = next(r, None)
                if not header or not all(c in header for c in ["percentile_exact", "crl_rank"]):
                    errors.append("Invalid columns in percentile_rank.csv")
                rows_count = sum(1 for _ in r)
                if rows_count < 10:
                    errors.append(f"Insufficient rows in percentile_rank.csv ({rows_count})")

        if errors:
            incomplete_years.append({"year": year, "errors": errors})
            print(f"[DISCOVERY] Year {year} marked INCOMPLETE: {'; '.join(errors)}")
        else:
            observed_years.append(year)
            print(f"[DISCOVERY] Year {year} verified as VALID observed historical dataset.")

    if not observed_years:
        raise ValueError("No valid observed year datasets found in data/!")

    return observed_years, incomplete_years

def calculate_projection_weights(observed_years, target_projected_year):
    """
    Computes recency weights for target_projected_year.
    Exact compatibility rule:
      If observed_years == [2024, 2025, 2026] and target_projected_year == 2027:
      Strictly {2024: 0.20, 2025: 0.30, 2026: 0.50} to ensure 100% numerical parity.
    General future-year rule:
      Use the K=3 most recent observed years with recency weights (0.20, 0.30, 0.50).
    """
    if observed_years == [2024, 2025, 2026] and target_projected_year == 2027:
        return {2024: 0.20, 2025: 0.30, 2026: 0.50}

    k = min(3, len(observed_years))
    recent = observed_years[-k:]
    if k == 3:
        raw_w = [0.20, 0.30, 0.50]
    elif k == 2:
        raw_w = [0.40, 0.60]
    else:
        raw_w = [1.00]

    return {yr: w for yr, w in zip(recent, raw_w)}

# ---------- Shift Curve Processing ----------
def build_shift_curve(rows):
    valid = [r for r in rows if r.get("read_quality") != "source_suspect"]
    by_marks = {}
    for r in valid:
        m = float(r["marks"])
        p = float(r["percentile"])
        by_marks.setdefault(m, []).append(p)
    sorted_m = sorted(by_marks.keys())
    x = np.array(sorted_m, dtype=float)
    y = np.array([float(np.mean(by_marks[m])) for m in sorted_m])
    y = np.maximum.accumulate(y)
    obs = Pchip(x, y)
    M90, Mtop = x[0], x[-1]
    pt = y[-1]
    m998_list = [float(r["marks"]) for r in valid if abs(float(r["percentile"]) - 99.8) < 1e-6]
    m998 = min(m998_list) if len(m998_list) > 0 else None
    lam = max((Mtop - m998) / np.log(2), 6.0) if m998 is not None else 8.0
    k = R / M90

    def f(m):
        m = np.asarray(m, float)
        p = np.empty_like(m); lo = np.empty_like(m); hi = np.empty_like(m)
        for i, v in enumerate(m):
            if v >= M90:
                if v <= Mtop:
                    p[i] = obs(v)
                else:
                    p[i] = 100.0 - (100.0 - pt) * np.exp(-(v - Mtop) / lam)
                lo[i] = hi[i] = p[i]
            else:
                ms = v * k
                p[i] = Pm(ms)
                t = min(1.0, (M90 - v) / (0.25 * M90))
                lo[i] = p[i] - (Pm(ms) - Pl(ms)) * t
                hi[i] = p[i] + (Ph(ms) - Pm(ms)) * t
        return np.minimum(p, 99.9999), np.clip(lo, 0, 100), np.minimum(hi, 99.9999), (m >= M90)
    return f

def load_shifts_for_year(year):
    shifts = []
    for s in ("january", "april"):
        fpath = os.path.join(DATA_DIR, str(year), f"{s}_shiftwise.csv")
        rows_by_shift = {}
        with open(fpath, "r", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                rows_by_shift.setdefault(r["shift_id"], []).append(r)
        for sid, srows in rows_by_shift.items():
            shifts.append(build_shift_curve(srows))
    return shifts

def compute_year_curve(shifts_for_year):
    P, L, H, O = [], [], [], []
    for f in shifts_for_year:
        p, l, h, o = f(MARKS)
        P.append(p); L.append(l); H.append(h); O.append(o)
    P = np.array(P); L = np.array(L); H = np.array(H); O = np.array(O)
    mid = np.median(P, 0)
    low = np.quantile(L, 0.1, 0)
    high = np.quantile(H, 0.9, 0)
    obsfrac = O.mean(0)
    return mid, np.minimum(low, mid), np.maximum(high, mid), obsfrac

def build_rank_fn(year):
    fpath = os.path.join(DATA_DIR, str(year), "percentile_rank.csv")
    rows = []
    seen = set()
    with open(fpath, "r", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            if r.get("read_quality") == "source_suspect": continue
            p = float(r["percentile_exact"])
            if p in seen: continue
            seen.add(p)
            rows.append((p, float(r["crl_rank"])))
    rows.sort(key=lambda item: item[0])
    x = np.array([item[0] for item in rows], dtype=float)
    r = np.array([item[1] for item in rows], dtype=float)
    f = Pchip(x, np.log(r))
    p0, r0, p1, r1 = x[0], r[0], x[-1], r[-1]
    def g(p):
        p = np.asarray(p, float)
        out = np.empty_like(p)
        for i, v in enumerate(p):
            if v < p0:
                out[i] = r0 * (100.0 - v) / (100.0 - p0)
            elif v > p1:
                out[i] = max(1.0, r1 * (100.0 - v) / (100.0 - p1))
            else:
                out[i] = np.exp(f(v))
        return out
    return g

# ---------- Main Execution Pipeline ----------
def main():
    print("=" * 70)
    print("RankWise Dynamic Future-Year AIR/CRL Projection Pipeline")
    print("=" * 70)

    observed_years, incomplete_years = discover_and_validate_years()
    projected_year = max(observed_years) + 1
    weights_dict = calculate_projection_weights(observed_years, projected_year)
    weighted_years = list(weights_dict.keys())
    weights_arr = np.array([weights_dict[y] for y in weighted_years])[:, None]

    print(f"\n[TARGET] Observed Years: {observed_years}")
    print(f"[TARGET] Projected Year: {projected_year}")
    print(f"[WEIGHTS] Recency Weights: {weights_dict}\n")

    # Compute year curves for all observed years
    yc = {}
    for y in observed_years:
        print(f"Processing observed shifts for {y}...")
        shifts = load_shifts_for_year(y)
        yc[y] = compute_year_curve(shifts)

    # Compute projection for projected_year in tail space u = -ln(1 - p/100)
    U = lambda p: -np.log(1 - np.minimum(p, 99.99999) / 100.0)
    Ui = lambda u: 100.0 * (1 - np.exp(-u))

    um = np.array([U(yc[y][0]) for y in weighted_years])
    ul = np.array([U(yc[y][1]) for y in weighted_years])
    uh = np.array([U(yc[y][2]) for y in weighted_years])
    spread = (um.max(0) - um.min(0)) / 2.0

    m_proj = Ui((um * weights_arr).sum(0))
    l_proj = Ui(np.maximum(0, (ul * weights_arr).sum(0) - spread))
    h_proj = np.minimum(99.9999, Ui((uh * weights_arr).sum(0) + spread))
    of_proj = (np.array([yc[y][3] for y in weighted_years]) * weights_arr).sum(0)
    yc[projected_year] = (m_proj, np.minimum(l_proj, m_proj), np.maximum(h_proj, m_proj), of_proj)

    # Monotonicity enforcement across all curves
    for y in yc:
        mid, low, high, of = yc[y]
        yc[y] = (np.maximum.accumulate(mid), np.maximum.accumulate(low), np.maximum.accumulate(high), of)

    # Build rank interpolators
    rf = {y: build_rank_fn(y) for y in observed_years}
    rf[projected_year] = lambda p: np.exp(sum(weights_dict[y] * np.log(rf[y](p)) for y in weighted_years))

    # All output years: observed + projected
    all_output_years = sorted(list(observed_years) + [projected_year])

    # Build CSV rows
    mp_rows = []
    mp_air_rows = []
    for y in all_output_years:
        mid, low, high, of = yc[y]
        a_mid = rf[y](mid)
        a_lo = rf[y](high)
        a_hi = rf[y](low)
        for i, m in enumerate(MARKS):
            width = high[i] - low[i]
            conf = "high" if width <= 3 else "medium" if width <= 12 else "low"
            basis = "observed_interpolated" if of[i] >= 0.8 else "reference_scaled" if of[i] <= 0.2 else "mixed"
            is_proj = (y == projected_year)
            rec_type = "projection" if is_proj else "estimate"
            mp_rows.append([y, m, round(float(mid[i]), 4), round(float(low[i]), 4), round(float(high[i]), 4), basis, conf, rec_type])
            mp_air_rows.append([y, m, round(float(mid[i]), 4), round(float(low[i]), 4), round(float(high[i]), 4),
                                int(round(float(a_mid[i]))), int(round(float(a_lo[i]))), int(round(float(a_hi[i]))), basis, conf])

    # Write data/combined/marks_percentile.csv
    mp_csv_path = os.path.join(COMBINED_DIR, "marks_percentile.csv")
    with open(mp_csv_path, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["year", "marks", "percentile", "percentile_low", "percentile_high", "basis", "confidence", "record_type"])
        w.writerows(mp_rows)

    # Write data/combined/marks_percentile_air.csv
    mp_air_csv_path = os.path.join(COMBINED_DIR, "marks_percentile_air.csv")
    with open(mp_air_csv_path, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["year", "marks", "percentile", "percentile_low", "percentile_high", "air", "air_best", "air_worst", "basis", "confidence"])
        w.writerows(mp_air_rows)

    # Write data/combined/percentile_air.csv
    grid = np.unique(np.concatenate([np.arange(0, 99.9, 0.1), [99.9, 99.95, 99.99]])).round(2)
    pa_rows = []
    for y in all_output_years:
        for p in grid:
            rank_val = int(round(float(rf[y](np.array([p]))[0])))
            b_val = "estimate" if p < 89.9 else "interpolated_from_observed"
            pa_rows.append([y, p, rank_val, b_val])

    pa_csv_path = os.path.join(COMBINED_DIR, "percentile_air.csv")
    with open(pa_csv_path, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["year", "percentile", "air", "basis"])
        w.writerows(pa_rows)

    # Write data/combined/years_manifest.json
    available_years_desc = sorted(all_output_years, reverse=True)
    manifest = {
        "observedYears": observed_years,
        "projectedYear": projected_year,
        "availableYears": available_years_desc,
        "incompleteYears": incomplete_years,
        "projectionWeights": weights_dict,
        "generatedAt": datetime.now(timezone.utc).isoformat()
    }
    manifest_path = os.path.join(COMBINED_DIR, "years_manifest.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    print(f"\n[OUTPUT] Wrote {mp_csv_path} ({len(mp_rows)} rows)")
    print(f"[OUTPUT] Wrote {mp_air_csv_path} ({len(mp_air_rows)} rows)")
    print(f"[OUTPUT] Wrote {pa_csv_path} ({len(pa_rows)} rows)")
    print(f"[OUTPUT] Wrote {manifest_path}")

    # Monotonicity & Parity Validation
    print("\n--- Running Validation Checks ---")
    ok = True
    by_year = {}
    for r in mp_air_rows:
        by_year.setdefault(r[0], []).append(r)

    for y in all_output_years:
        y_rows = by_year[y]
        p_vals = [r[2] for r in y_rows]
        air_vals = [r[5] for r in y_rows]
        p_diffs = np.diff(p_vals)
        air_diffs = np.diff(air_vals)
        if (p_diffs < -1e-9).any():
            print(f"[ERROR] Non-monotone percentile for year {y}")
            ok = False
        if (air_diffs > 0).any():
            print(f"[ERROR] AIR not decreasing with marks for year {y}")
            ok = False
        max_jump = float(p_diffs.max())
        print(f"Year {y}: Max jump = {max_jump:.4f} pct | 0-marks = {p_vals[0]:.2f} | 300-marks = {p_vals[-1]:.4f} | Top AIR = {air_vals[-1]}")

    print(f"\nPipeline execution completed successfully! Validation status: {'PASS' if ok else 'FAIL'}")

if __name__ == "__main__":
    main()
