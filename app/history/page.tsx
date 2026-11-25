"use client";

import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import "./history.css";
import "../rankwise.css";

type Cell = { marks: number; quality: string };
type Shift = { id: string; date: string; shift: string; cells: Record<string, Cell> };

export default function HistoryPage() {
  const [years, setYears] = useState<string[]>(["2024", "2025", "2026"]);
  const [year, setYear] = useState("2026");
  const [session, setSession] = useState("january");
  const [tab, setTab] = useState<{ percentiles: number[]; shifts: Shift[] } | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/years")
      .then((r) => r.json())
      .then((m) => {
        if (m.observedYears && m.observedYears.length > 0) {
          const obs = m.observedYears.map(String);
          setYears(obs);
          if (!obs.includes(year)) {
            setYear(obs[obs.length - 1]);
          }
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    setErr("");
    fetch(`/api/shifts?year=${year}&session=${session}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setErr(d.error);
        else setTab(d);
      })
      .catch(() => setErr("Could not load historical shift data."))
      .finally(() => setLoading(false));
  }, [year, session]);

  // Compute smart KPI metrics from shift data (e.g. for 99th percentile)
  const kpis = useMemo(() => {
    if (!tab || !tab.shifts || tab.shifts.length === 0) return null;
    const targetP = tab.percentiles.includes(99)
      ? 99
      : tab.percentiles[0] ?? 99;

    let hardest: { shift: Shift; marks: number } | null = null;
    let easiest: { shift: Shift; marks: number } | null = null;

    for (const s of tab.shifts) {
      const c = s.cells[String(targetP)];
      if (c && c.marks) {
        if (!hardest || c.marks > hardest.marks) hardest = { shift: s, marks: c.marks };
        if (!easiest || c.marks < easiest.marks) easiest = { shift: s, marks: c.marks };
      }
    }

    const spread = hardest && easiest ? hardest.marks - easiest.marks : 0;

    return {
      totalShifts: tab.shifts.length,
      targetPercentile: targetP,
      hardest,
      easiest,
      spread,
    };
  }, [tab]);

  return (
    <div className="hist-page-root">
      {/* Top Navbar Header with DuoDevs Logo */}
      <header className="hist-header">
        <div className="hist-header-inner">
          <Link href="/" className="hist-brand-link" aria-label="Duodevs.tech">
            <img
              src="/duodevs-mark.png"
              alt="DuoDevs Logo"
              className="hist-brand-logo-img"
            />
            <span className="hist-brand-title">
              Duodevs<span className="hist-brand-accent">.tech</span>
            </span>
          </Link>

          <Link href="/" className="hist-back-btn">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            <span>Back to Predictor</span>
          </Link>
        </div>
      </header>

      {/* Main Container */}
      <main className="hist-container">
        {/* Hero Section */}
        <div className="hist-hero-wrap">
          <div className="hist-badge-pill">
            <span className="hist-badge-dot" />
            <span>Shift Archive &amp; Difficulty Matrix • 2024–2026</span>
          </div>
          <h1 className="hist-title">
            JEE Main <span className="hist-title-accent">Marks vs Percentile &amp; Shift Difficulty (2024–2026)</span>
          </h1>
          <p className="hist-sub">
            Shift-by-shift difficulty variations, marks-vs-percentile drift, and normalized qualifying score benchmarks.
          </p>
        </div>

        {/* Section Heading for Shift Matrix */}
        <div style={{ marginTop: "16px", marginBottom: "12px" }}>
          <h2 style={{ fontSize: "1.2rem", fontWeight: 700, color: "#0f172a", margin: "0 0 4px 0" }}>
            Shift Difficulty &amp; Session Comparison Matrix
          </h2>
          <p style={{ fontSize: "0.92rem", color: "#64748b", margin: 0 }}>
            Select session and examination year to analyze marks vs percentile cutoffs for each shift.
          </p>
        </div>

        {/* Toolbar: Session & Year Selectors */}
        <div className="hist-toolbar">
          <div className="hist-tabs-row">
            <button
              type="button"
              className={`hist-tab-btn ${session === "january" ? "active" : ""}`}
              onClick={() => setSession("january")}
            >
              January Session
            </button>
            <button
              type="button"
              className={`hist-tab-btn ${session === "april" ? "active" : ""}`}
              onClick={() => setSession("april")}
            >
              April Session
            </button>
          </div>

          <div className="hist-year-pills">
            {years.map((y) => (
              <button
                key={y}
                type="button"
                className={`hist-year-pill ${year === y ? "active" : ""}`}
                onClick={() => setYear(y)}
              >
                {y}
              </button>
            ))}
          </div>
        </div>

        {/* KPI Summary Cards */}
        {kpis && (
          <div className="hist-kpi-grid">
            <div className="hist-kpi-card">
              <div className="hist-kpi-label">Shifts Analyzed</div>
              <div className="hist-kpi-val">{kpis.totalShifts} Shifts</div>
              <div className="hist-kpi-desc">Across {session} {year}</div>
            </div>

            <div className="hist-kpi-card">
              <div className="hist-kpi-label">Hardest Shift ({kpis.targetPercentile}%ile)</div>
              <div className="hist-kpi-val" style={{ color: "#dc2626" }}>
                {kpis.hardest ? `${kpis.hardest.marks} Marks` : "—"}
              </div>
              <div className="hist-kpi-desc">
                {kpis.hardest
                  ? `${kpis.hardest.shift.date.slice(5)} (${kpis.hardest.shift.shift})`
                  : "—"}
              </div>
            </div>

            <div className="hist-kpi-card">
              <div className="hist-kpi-label">Easiest Shift ({kpis.targetPercentile}%ile)</div>
              <div className="hist-kpi-val" style={{ color: "#16a34a" }}>
                {kpis.easiest ? `${kpis.easiest.marks} Marks` : "—"}
              </div>
              <div className="hist-kpi-desc">
                {kpis.easiest
                  ? `${kpis.easiest.shift.date.slice(5)} (${kpis.easiest.shift.shift})`
                  : "—"}
              </div>
            </div>

            <div className="hist-kpi-card">
              <div className="hist-kpi-label">Score Spread (Drift)</div>
              <div className="hist-kpi-val" style={{ color: "#7c3aed" }}>
                ±{kpis.spread} Marks
              </div>
              <div className="hist-kpi-desc">Between shifts at 99%ile</div>
            </div>
          </div>
        )}

        {err && <div className="hist-err-box">{err}</div>}

        {/* Data Table */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "48px 0", color: "#64748b" }}>
            Loading shift matrix…
          </div>
        ) : tab ? (
          <div className="hist-table-wrap">
            <div className="hist-table-scroll">
              <table className="hist-table">
                <thead>
                  <tr>
                    <th className="hist-col-pct">PERCENTILE</th>
                    {tab.shifts.map((s) => (
                      <th key={s.id} className="hist-shift-head">
                        <div className="hist-shift-date">{s.date.slice(5)}</div>
                        <span className="hist-shift-sub">{s.shift}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tab.percentiles.map((p) => (
                    <tr key={p}>
                      <td className="hist-cell-pct">{p}%</td>
                      {tab.shifts.map((s) => {
                        const c = s.cells[String(p)];
                        return (
                          <td
                            key={s.id}
                            title={
                              c && c.quality !== "clear"
                                ? "Value partly unclear in source"
                                : undefined
                            }
                          >
                            <span className="hist-mark-val">
                              {c ? c.marks : "—"}
                              {c && c.quality !== "clear" ? "*" : ""}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="hist-footnote">
              * Cell values marked with an asterisk are derived from partially obscured or inconsistent source records and normalized.
            </div>
          </div>
        ) : null}

        {/* Comprehensive Student Guide to JEE Main Marks vs Percentile & Normalization */}
        <section style={{ marginTop: "48px", borderTop: "1px solid #e2e8f0", paddingTop: "36px", marginBottom: "40px" }}>
          <h2 className="hist-title" style={{ fontSize: "1.75rem", marginBottom: "8px" }}>
            Understanding JEE Main <span className="hist-title-accent">Shift Normalization &amp; Percentile Trends</span>
          </h2>
          <p className="hist-sub" style={{ marginBottom: "24px" }}>
            A detailed analytical guide explaining how paper difficulty, session timing, and NTA multi-session normalization influence your marks-to-percentile conversion.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px" }}>
            <div style={{ padding: "20px", borderRadius: "12px", border: "1px solid #e2e8f0", background: "#f8fafc" }}>
              <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "#0f172a", marginBottom: "8px" }}>
                What Is Marks vs Percentile Drift?
              </h3>
              <p style={{ fontSize: "0.92rem", color: "#475569", lineHeight: 1.55 }}>
                Marks vs percentile drift occurs because each exam shift features distinct question sets with varying difficulty levels. In a difficult shift, fewer students achieve high scores, lowering the raw marks required for a 99+ percentile. In an easy shift, raw marks inflate.
              </p>
            </div>

            <div style={{ padding: "20px", borderRadius: "12px", border: "1px solid #e2e8f0", background: "#f8fafc" }}>
              <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "#0f172a", marginBottom: "8px" }}>
                How NTA Normalization Operates
              </h3>
              <p style={{ fontSize: "0.92rem", color: "#475569", lineHeight: 1.55 }}>
                The National Testing Agency (NTA) normalizes raw scores using a percentile formula scaled to 7 decimal places. This ensures that a candidate’s rank is evaluated strictly relative to their peers in the exact same shift, preventing unfair disadvantages from difficult test papers.
              </p>
            </div>

            <div style={{ padding: "20px", borderRadius: "12px", border: "1px solid #e2e8f0", background: "#f8fafc" }}>
              <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "#0f172a", marginBottom: "8px" }}>
                January vs April Session Comparison
              </h3>
              <p style={{ fontSize: "0.92rem", color: "#475569", lineHeight: 1.55 }}>
                Historical data from 2024 to 2026 demonstrates that the April session typically experiences a score jump of 5 to 15 marks for identical percentiles. With students having completed their 12th board exams and full syllabus revision, average competitor scores rise noticeably in Session 2.
              </p>
            </div>

            <div style={{ padding: "20px", borderRadius: "12px", border: "1px solid #e2e8f0", background: "#f8fafc" }}>
              <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "#0f172a", marginBottom: "8px" }}>
                Benchmarking Your Target Score for 2027
              </h3>
              <p style={{ fontSize: "0.92rem", color: "#475569", lineHeight: 1.55 }}>
                Use these historical shift benchmarks to set safe target scores: aim for 195–215+ marks for a 99+ percentile in moderate shifts, and 160–180+ marks for 97+ percentile. Once you estimate your score, test your rank with our <Link href="/" style={{ color: "#2563eb", fontWeight: 600, textDecoration: "underline" }}>JEE Main Rank Predictor 2027</Link> or evaluate engineering admissions with our <Link href="/college-finder" style={{ color: "#7c3aed", fontWeight: 600, textDecoration: "underline" }}>JoSAA College Predictor</Link>.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Spacious Minimal Dark Navy Footer */}
      <footer className="rw-site-footer">
        <div className="rw-footer-corner-decor" aria-hidden="true">
          <div className="rw-footer-corner-glow" />
          <svg
            className="rw-footer-corner-svg"
            viewBox="0 0 140 140"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M140 25C102 36 68 72 58 140"
              stroke="#2563EB"
              strokeWidth="1.2"
              strokeOpacity="0.28"
              strokeLinecap="round"
            />
            <path
              d="M140 50C112 58 88 88 80 140"
              stroke="#2563EB"
              strokeWidth="1.2"
              strokeOpacity="0.20"
              strokeLinecap="round"
            />
            <path
              d="M140 75C122 80 106 104 102 140"
              stroke="#2563EB"
              strokeWidth="1.2"
              strokeOpacity="0.14"
              strokeLinecap="round"
            />
          </svg>
        </div>

        <div className="rw-footer-container">
          <div className="rw-footer-main">
            <h3 className="rw-footer-heading">
              Built by Engineers, for Future Engineers.
            </h3>
          </div>

          {/* Sitewide Internal Navigation Links */}
          <nav aria-label="RankWise Quick Links" style={{ display: "flex", flexWrap: "wrap", gap: "24px", justifyContent: "center", margin: "20px 0 10px 0" }}>
            <Link href="/" style={{ color: "#94a3b8", fontSize: "14px", textDecoration: "none", fontWeight: 500 }}>
              JEE Main Rank Predictor 2027
            </Link>
            <Link href="/college-finder" style={{ color: "#94a3b8", fontSize: "14px", textDecoration: "none", fontWeight: 500 }}>
              JoSAA College Predictor 2027
            </Link>
            <Link href="/history" style={{ color: "#94a3b8", fontSize: "14px", textDecoration: "none", fontWeight: 500 }}>
              Historical Marks vs Percentile Trends
            </Link>
          </nav>

          <div className="rw-footer-divider" />

          <div className="rw-footer-bottom">
            <p className="rw-footer-disclaimer-note">
              An independent initiative built to support JEE aspirants across India. Not affiliated with NTA or any government authority.
            </p>
            <div className="rw-footer-copyright">
              © 2027 JEE Predictor. All Rights Reserved.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
