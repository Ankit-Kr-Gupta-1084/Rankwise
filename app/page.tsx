"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { getScaleBounds } from "@/lib/college-finder/scale-bounds";
import "./rankwise.css";

type P = {
  year: number;
  marks: number;
  percentile: number;
  percentileLow: number;
  percentileHigh: number;
  air: number;
  airBest: number;
  airWorst: number;
  confidence: "high" | "medium" | "low";
  isProjection: boolean;
};

const DEFAULT_YEARS = [2027, 2026, 2025, 2024];

const CATEGORIES = ["General", "GEN-EWS", "OBC-NCL", "SC", "ST"] as const;
const DIFFICULTIES = ["Easy", "Moderate", "Difficult"] as const;
const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh", "Chhattisgarh",
  "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir",
  "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Madhya Pradesh", "Maharashtra",
  "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab",
  "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh",
  "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands", "Dadra and Nagar Haveli and Daman and Diu"
];

const formatPercentile = (v: number) => {
  if (v >= 99.99) return "99.99+";
  return v.toFixed(2);
};

const formatAir = (v: number) => {
  return Math.round(v).toLocaleString("en-IN");
};

export default function Home() {
  const [inputValue, setInputValue] = useState("");
  const [availableYears, setAvailableYears] = useState<number[]>(DEFAULT_YEARS);
  const [projectedYear, setProjectedYear] = useState<number>(2027);
  const [data, setData] = useState<P[] | null>(null);
  const [cardStep, setCardStep] = useState<"input" | "result" | "counselling" | "college-form">("input");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // Counselling Form Preferences (Default empty - user must select)
  const [cfCategory, setCfCategory] = useState<string>("");
  const [cfSeatPool, setCfSeatPool] = useState<string>("");
  const [cfDomicile, setCfDomicile] = useState<string>("");

  // Hero College Predictor Form State (triggered by JoSAA card)
  const [cfHeroScoreType, setCfHeroScoreType] = useState<"marks" | "rank" | "category_rank">("marks");
  const [cfHeroScoreVal, setCfHeroScoreVal] = useState<string>("");

  // Animated rolling counter states
  const [displayPercentile, setDisplayPercentile] = useState<string>("0.00");
  const [displayAir, setDisplayAir] = useState<string>("0");
  const [pointerPercent, setPointerPercent] = useState<number>(50);
  const [showTrendsModal, setShowTrendsModal] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [activeReviewIdx, setActiveReviewIdx] = useState<number>(1);
  const animRef = useRef<number | null>(null);

  const reviewsData = [
    {
      id: 0,
      quote: "Best tool out there with the most accurate rank prediction.",
      author: "Aditi Pandey",
      badge: "Easiest tool out there",
      stars: 5,
    },
    {
      id: 1,
      quote: "Helped me find the best IIT with CS that I could get at my rank.",
      author: "Ankit Gupta",
      badge: "Helped find the best college",
      stars: 5,
    },
    {
      id: 2,
      quote: "This tool helped me save a lot of time in finding the best college for myself.",
      author: "Rishabh Jain",
      badge: "Saved 2 months of uncertainty",
      stars: 5,
    },
  ];

  const handleCopyLink = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.origin);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleWhatsAppShare = () => {
    if (typeof window !== "undefined") {
      const url = window.location.origin;
      const msg = encodeURIComponent(
        "Check out RankWise — Free JEE Main Rank & JoSAA College Allotment Predictor. Highly accurate, data-backed, and official cutoff trends: " + url
      );
      window.open(`https://api.whatsapp.com/send?text=${msg}`, "_blank");
    }
  };

  useEffect(() => {
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  // Handle URL navigation like /?step=college-form (seamless return from results or external links)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("step") === "college-form") {
        setCardStep("college-form");
        setCfCategory("");
        setCfSeatPool("");
        setCfDomicile("");
        setCfHeroScoreVal("");
        setErr("");
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }
  }, []);

  useEffect(() => {
    if (showTrendsModal) {
      document.body.style.overflow = "hidden";
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") setShowTrendsModal(false);
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => {
        document.body.style.overflow = "";
        window.removeEventListener("keydown", handleKeyDown);
      };
    } else {
      document.body.style.overflow = "";
    }
  }, [showTrendsModal]);

  useEffect(() => {
    fetch("/api/years")
      .then((r) => r.json())
      .then((m) => {
        if (m.availableYears && m.availableYears.length > 0) {
          setAvailableYears(m.availableYears);
          if (m.projectedYear) {
            setProjectedYear(m.projectedYear);
          }
        }
      })
      .catch(() => {});
  }, []);

  // Rolling counter animation function (synchronizes numbers with the moving blue pointer on the scale)
  function startRollingAnimation(
    targetPercentile: number,
    targetAir: number,
    airBest: number,
    airWorst: number
  ) {
    if (animRef.current) cancelAnimationFrame(animRef.current);

    const span = Math.max(1, airWorst - airBest);
    const targetRatio = Math.max(0.06, Math.min(0.94, (targetAir - airBest) / span));
    const targetPercent = targetRatio * 100;

    const duration = 1400; // ms
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Cubic ease out curve
      const ease = 1 - Math.pow(1 - progress, 3);

      if (progress < 1) {
        // While rolling (first 82% of duration), generate fluttering numbers and scale pointer motion
        if (progress < 0.82) {
          const flutterP = Math.min(
            99.99,
            Math.max(10, ease * targetPercentile + (Math.random() * 6 - 3))
          );
          setDisplayPercentile(flutterP.toFixed(2));

          const flutterAir = Math.max(
            1,
            Math.round(ease * targetAir + (Math.random() * 20000 - 10000) * (1 - progress))
          );
          setDisplayAir(flutterAir.toLocaleString("en-IN"));

          // Pointer sweeps smoothly across scale with harmonic oscillation matching the rolling digits
          const wave = Math.sin(elapsed * 0.018) * (1 - progress) * 22;
          const curPointer = Math.max(5, Math.min(95, ease * targetPercent + wave));
          setPointerPercent(curPointer);
        } else {
          // Decelerate smoothly directly to target values
          const curP = ease * targetPercentile;
          setDisplayPercentile(curP.toFixed(2));

          const curAir = Math.round(ease * targetAir);
          setDisplayAir(curAir.toLocaleString("en-IN"));

          const curPointer = Math.max(5, Math.min(95, ease * targetPercent));
          setPointerPercent(curPointer);
        }

        animRef.current = requestAnimationFrame(animate);
      } else {
        // Exactly lock to the final calculated target
        setDisplayPercentile(formatPercentile(targetPercentile));
        setDisplayAir(formatAir(targetAir));
        setPointerPercent(targetPercent);
      }
    };

    animRef.current = requestAnimationFrame(animate);
  }

  async function handlePredict() {
    setErr("");
    const val = Number(inputValue.trim());

    if (inputValue.trim() === "" || !Number.isFinite(val)) {
      setErr("Please enter your expected marks between 0 and 300.");
      return;
    }

    if (val < 0 || val > 300) {
      setErr("Marks must be between 0 and 300.");
      return;
    }

    setBusy(true);
    try {
      const res = await Promise.all(
        availableYears.map((y) =>
          fetch(`/api/predict?marks=${val}&year=${y}`).then((r) => r.json())
        )
      );

      if (res.some((r) => r.error)) {
        setErr(res.find((r) => r.error)?.error || "Error calculating rank.");
      } else {
        setData(res);
        const targetProj = res.find((d) => d.year === projectedYear) ?? res[0];
        setCardStep("result");
        startRollingAnimation(
          targetProj.percentile,
          targetProj.air,
          targetProj.airBest,
          targetProj.airWorst
        );
      }
    } catch {
      setErr("Something went wrong. Try again.");
    }
    setBusy(false);
  }

  const main = data?.find((d) => d.year === projectedYear) ?? data?.[0];
  const scaleBounds = main ? getScaleBounds(main.air) : { minR: 0, maxR: 0 };

  // Gauge calculation: calculate relative position of predicted rank between best and worst
  const totalTicks = 37;
  let activeTickIndex = 18;
  if (main) {
    const diff = Math.max(1, scaleBounds.maxR - scaleBounds.minR);
    const ratio = Math.max(0.06, Math.min(0.94, (main.air - scaleBounds.minR) / diff));
    activeTickIndex = Math.round(ratio * (totalTicks - 1));
  }

  return (
    <div className="rw-page-root">
      {/* Top Navbar Header with DuoDevs Logo */}
      <header className="rw-header">
        <div className="rw-header-inner">
          <Link href="/" className="rw-brand-link" aria-label="Duodevs.tech">
            <img
              src="/duodevs-mark.png"
              alt="DuoDevs Logo"
              className="rw-brand-logo-img"
            />
            <span className="rw-brand-title">
              Duodevs<span className="rw-brand-accent">.tech</span>
            </span>
          </Link>
        </div>
      </header>

      {/* Corner Grid Pattern - ONLY in Top Right Corner */}
      <div className="rw-corner-grid" aria-hidden="true" />

      <div className="rw-container">
        {/* Main Two-Column Hero Section */}
        <div className="rw-hero-layout">
          {/* Left Hero Column */}
          <div className="rw-hero-left">
            {/* Pill Badge */}
            <div className="rw-badge-pill">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="#059669"
                className="rw-badge-rosette"
                aria-hidden="true"
              >
                <path d="m8.6 22.5-1.9-3.2-3.6-.8.4-3.7-2.5-2.7 2.5-2.7-.4-3.7 3.6-.8 1.9-3.2 3.4 1.5 3.4-1.5 1.9 3.2 3.6.8-.4 3.7 2.5 2.7-2.5 2.7.4 3.7-3.6.8-1.9 3.2-3.4-1.5-3.4 1.5z" />
                <path
                  d="m9.5 12 2 2 4.5-4.5"
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>100% Free, No Charges</span>
            </div>

            {/* Title */}
            <h1 className="rw-hero-title">
              JEE Main
              <br />
              <span className="rw-blue-text">Rank Predictor</span> {projectedYear}
            </h1>

            {/* Subtitle */}
            <p className="rw-hero-sub">
              Get accurate predictions based on your expected JEE Marks or Percentile.
            </p>

            {/* Trust / Social Proof Badges */}
            <div className="rw-trust-row">
              {/* Item 1 */}
              <div className="rw-trust-item">
                <div className="rw-trust-icon blue">
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </div>
                <div className="rw-trust-text">
                  <span className="rw-trust-title">51,350+</span>
                  <span className="rw-trust-desc">Students Predicted</span>
                </div>
              </div>

              <div className="rw-trust-divider" />

              {/* Item 2 */}
              <div className="rw-trust-item">
                <div className="rw-trust-icon green">
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.1"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    <path d="m9 12 2 2 4-4" />
                  </svg>
                </div>
                <div className="rw-trust-text">
                  <span className="rw-trust-title">Trusted by</span>
                  <span className="rw-trust-desc">JEE Aspirants</span>
                </div>
              </div>

              <div className="rw-trust-divider" />

              {/* Item 3 */}
              <div className="rw-trust-item">
                <div className="rw-trust-icon trophy">
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                    <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                    <path d="M4 22h16" />
                    <path d="M10 14.66V17c0 .55-.45 1-1 1H8c-.55 0-1 .45-1 1v1h10v-1c0-.55-.45-1-1-1h-1c-.55 0-1-.45-1-1v-2.34" />
                    <path d="M6 4h12v7a6 6 0 0 1-12 0V4z" />
                  </svg>
                </div>
                <div className="rw-trust-text">
                  <span className="rw-trust-title">B.Tech IT Graduates</span>
                  <span className="rw-trust-desc">Build & Verify</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Hero Column: Predictor Card Widget */}
          <div className="rw-hero-right">
            <div className="rw-widget-card">
              {cardStep === "input" && (
                /* Input Mode (Matches picture) */
                <>
                  <div className="rw-widget-header">
                    <div className="rw-widget-icon-box">
                      <svg
                        width="22"
                        height="22"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M3 3v18h18" />
                        <path d="m19 9-5 5-4-4-3 3" />
                        <path d="m14 9h5v5" />
                      </svg>
                    </div>
                    <h3 className="rw-widget-title">Predict Your JEE Rank</h3>
                  </div>

                  <p className="rw-widget-sub">
                    Enter your expected JEE Main marks out of 300 to predict your rank.
                  </p>

                  {/* Dedicated Marks Input with sleek / 300 denominator */}
                  <div className="rw-marks-field-wrapper">
                    <label className="rw-marks-field-label">Expected Score</label>
                    <div className={`rw-marks-input-container ${err ? "has-error" : ""}`}>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        className="rw-marks-input-element"
                        placeholder="e.g. 240"
                        value={inputValue}
                        onChange={(e) => {
                          const v = e.target.value.replace(/[^0-9]/g, "");
                          if (v === "" || (Number(v) <= 300 && v.length <= 3)) {
                            setInputValue(v);
                            if (err) setErr("");
                          }
                        }}
                        onKeyDown={(e) => e.key === "Enter" && handlePredict()}
                        maxLength={3}
                        autoFocus
                      />
                      <div className="rw-marks-denominator" aria-hidden="true">
                        <span className="rw-slash">/</span>
                        <span className="rw-max-score">300</span>
                      </div>
                    </div>
                  </div>

                  {/* Submit Button (NO ARROWS) */}
                  <button
                    type="button"
                    className="rw-predict-submit-btn"
                    onClick={handlePredict}
                    disabled={busy}
                  >
                    {busy ? (
                      "Calculating…"
                    ) : (
                      <>
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                        >
                          <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
                        </svg>
                        <span>Predict My Rank</span>
                      </>
                    )}
                  </button>

                  {err && <div className="rw-err-box">{err}</div>}
                </>
              )}

              {cardStep === "result" && main && (
                /* Result Mode with Precision Ruler Gauge (No Edit button, No arrows) */
                <div className="rw-result-card-inner">
                  <div className="rw-res-header">
                    <div className="rw-widget-icon-box">
                      <svg
                        width="22"
                        height="22"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M3 3v18h18" />
                        <path d="m19 9-5 5-4-4-3 3" />
                        <path d="m14 9h5v5" />
                      </svg>
                    </div>
                    <div>
                      <div className="rw-res-badge">
                        <span>JEE Main {projectedYear}</span>
                        <span className="rw-dot">•</span>
                        <span>{inputValue} / 300 Marks</span>
                      </div>
                      <h3 className="rw-widget-title">Predicted Result</h3>
                    </div>
                  </div>

                  {/* Precision Gauge Card */}
                  <div className="rw-gauge-card">
                    {/* Percentile Pill */}
                    <div className="rw-gauge-percentile-pill">
                      <span>Predicted Percentile:</span>
                      <strong>{displayPercentile}%</strong>
                    </div>

                    <div className="rw-gauge-title">
                      Predicted JEE Main {projectedYear} Rank
                    </div>

                    {/* Row: Best Rank, Main Big Animated Rank, Worst Rank */}
                    <div className="rw-gauge-numbers-row">
                      <span className="rw-gauge-side-val left">
                        {scaleBounds.minR.toLocaleString("en-IN")}
                      </span>
                      <span className="rw-gauge-main-val">
                        {displayAir}
                      </span>
                      <span className="rw-gauge-side-val right">
                        {scaleBounds.maxR.toLocaleString("en-IN")}
                      </span>
                    </div>

                    {/* Precision Horizontal Tick-Marks Ruler with Dynamic Red Stopper Pointer */}
                    <div className="rw-gauge-ruler" aria-hidden="true">
                      {Array.from({ length: totalTicks }).map((_, i) => (
                        <span key={i} className="rw-gauge-tick" />
                      ))}
                      <div
                        className="rw-gauge-pointer"
                        style={{
                          left: `calc(10px + (100% - 20px) * ${pointerPercent / 100})`,
                        }}
                      />
                    </div>

                    {/* Option to Analyse Previous Year Trends directly below scale */}
                    <button
                      type="button"
                      className="rw-gauge-trends-trigger"
                      onClick={() => setShowTrendsModal(true)}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
                        <polyline points="16 7 22 7 22 13" />
                      </svg>
                      <span>Analyse Previous Year Trends</span>
                    </button>
                  </div>

                  {/* Action: Open Counselling Preferences inside the SAME box */}
                  <button
                    type="button"
                    className="rw-predict-submit-btn"
                    onClick={() => {
                      setCfCategory("");
                      setCfSeatPool("");
                      setCfDomicile("");
                      setErr("");
                      setCardStep("counselling");
                    }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
                    </svg>
                    <span>Explore Eligible Colleges</span>
                  </button>

                  <button
                    type="button"
                    className="rw-res-recalc-btn"
                    onClick={() => {
                      setCardStep("input");
                      setInputValue("");
                      setErr("");
                    }}
                  >
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="rw-undo-icon"
                    >
                      <polyline points="1 4 1 10 7 10" />
                      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                    </svg>
                    <span>Predict another score</span>
                  </button>
                </div>
              )}

              {cardStep === "counselling" && (
                /* Counselling Preferences Form Mode inside the SAME Box (Dropdowns, No Difficulty) */
                <div className="rw-result-card-inner">
                  <div className="rw-res-header">
                    <div className="rw-widget-icon-box">
                      <svg
                        width="22"
                        height="22"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.1"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                        <path d="M6 12v5c3 3 9 3 12 0v-5" />
                      </svg>
                    </div>
                    <div>
                      <div className="rw-res-badge">
                        <span>{inputValue} / 300 Marks</span>
                        <span className="rw-dot">•</span>
                        <span>JoSAA {projectedYear}</span>
                      </div>
                      <h3 className="rw-widget-title">Explore Eligible Colleges</h3>
                    </div>
                  </div>

                  <p className="rw-widget-sub">
                    Select your category and quota details to discover eligible NITs, IIITs & CFIs.
                  </p>

                  <div className="rw-cf-fields-stack">
                    {/* Candidate Category Dropdown */}
                    <div className="rw-cf-field">
                      <label className="rw-cf-label">Candidate Category <span className="rw-req">*</span></label>
                      <div className="rw-cf-select-wrap">
                        <select
                          className={`rw-cf-native-select ${!cfCategory ? "rw-placeholder-active" : ""}`}
                          value={cfCategory}
                          onChange={(e) => {
                            setCfCategory(e.target.value);
                            if (err) setErr("");
                          }}
                          required
                        >
                          <option value="" disabled className="rw-placeholder-opt">
                            Select Candidate Category
                          </option>
                          {CATEGORIES.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                        <div className="rw-cf-select-chevron" aria-hidden="true">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                            <path d="m6 9 6 6 6-6" />
                          </svg>
                        </div>
                      </div>
                    </div>

                    {/* Seat Pool Dropdown */}
                    <div className="rw-cf-field">
                      <label className="rw-cf-label">Seat Pool <span className="rw-req">*</span></label>
                      <div className="rw-cf-select-wrap">
                        <select
                          className={`rw-cf-native-select ${!cfSeatPool ? "rw-placeholder-active" : ""}`}
                          value={cfSeatPool}
                          onChange={(e) => {
                            setCfSeatPool(e.target.value);
                            if (err) setErr("");
                          }}
                          required
                        >
                          <option value="" disabled className="rw-placeholder-opt">
                            Select Seat Pool
                          </option>
                          <option value="Gender-Neutral">Gender-Neutral</option>
                          <option value="Female">Female-only</option>
                        </select>
                        <div className="rw-cf-select-chevron" aria-hidden="true">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                            <path d="m6 9 6 6 6-6" />
                          </svg>
                        </div>
                      </div>
                    </div>

                    {/* Domicile State Dropdown */}
                    <div className="rw-cf-field">
                      <label className="rw-cf-label">12th Domicile State (Home State Quota) <span className="rw-req">*</span></label>
                      <div className="rw-cf-select-wrap">
                        <select
                          className={`rw-cf-native-select ${!cfDomicile ? "rw-placeholder-active" : ""}`}
                          value={cfDomicile}
                          onChange={(e) => {
                            setCfDomicile(e.target.value);
                            if (err) setErr("");
                          }}
                          required
                        >
                          <option value="" disabled className="rw-placeholder-opt">
                            Select 12th Home State (Domicile)
                          </option>
                          {INDIAN_STATES.map((st) => (
                            <option key={st} value={st}>
                              {st}
                            </option>
                          ))}
                        </select>
                        <div className="rw-cf-select-chevron" aria-hidden="true">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                            <path d="m6 9 6 6 6-6" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  </div>

                  {err && <div className="rw-err-box">{err}</div>}

                  {/* Primary Submit Button */}
                  <button
                    type="button"
                    className="rw-predict-submit-btn"
                    onClick={() => {
                      if (!cfCategory) {
                        setErr("Please select your Candidate Category.");
                        return;
                      }
                      if (!cfSeatPool) {
                        setErr("Please select your Seat Pool.");
                        return;
                      }
                      if (!cfDomicile) {
                        setErr("Please select your 12th Home State (Domicile).");
                        return;
                      }
                      const query = new URLSearchParams({
                        marks: inputValue,
                        category: cfCategory,
                        seatPool: cfSeatPool,
                        domicileState: cfDomicile,
                      }).toString();
                      window.location.href = `/college-finder?${query}`;
                    }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
                    </svg>
                    <span>100% Official Data Based Prediction</span>
                  </button>

                  {/* Secondary Back Button */}
                  <button
                    type="button"
                    className="rw-res-recalc-btn"
                    onClick={() => setCardStep("result")}
                  >
                    ← Back to Rank Result
                  </button>
                </div>
              )}

              {cardStep === "college-form" && (
                /* Specialized JoSAA College Predictor Mode directly inside hero box */
                <div className="rw-result-card-inner">
                  <div className="rw-widget-header">
                    <div className="rw-widget-icon-box">
                      <svg
                        width="22"
                        height="22"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                        <path d="M6 12v5c3 3 9 3 12 0v-5" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="rw-widget-title">JoSAA College Predictor</h3>
                    </div>
                  </div>

                  <p className="rw-widget-sub">
                    Fill raw marks, CRL rank, or Category rank to discover eligible NITs, IIITs & CFIs.
                  </p>

                  {/* Method Switcher Tabs */}
                  <div className="rw-cf-mode-tabs">
                    <button
                      type="button"
                      className={`rw-cf-mode-tab ${cfHeroScoreType === "marks" ? "active" : ""}`}
                      onClick={() => {
                        setCfHeroScoreType("marks");
                        setCfHeroScoreVal("");
                        setErr("");
                      }}
                    >
                      Marks (0–300)
                    </button>
                    <button
                      type="button"
                      className={`rw-cf-mode-tab ${cfHeroScoreType === "rank" ? "active" : ""}`}
                      onClick={() => {
                        setCfHeroScoreType("rank");
                        setCfHeroScoreVal("");
                        setErr("");
                      }}
                    >
                      CRL Rank
                    </button>
                    <button
                      type="button"
                      className={`rw-cf-mode-tab ${cfHeroScoreType === "category_rank" ? "active" : ""}`}
                      onClick={() => {
                        setCfHeroScoreType("category_rank");
                        setCfHeroScoreVal("");
                        setErr("");
                      }}
                    >
                      Category Rank
                    </button>
                  </div>

                  {/* Input Field with suffix */}
                  <div className="rw-marks-field-wrapper">
                    <label className="rw-marks-field-label">
                      {cfHeroScoreType === "marks"
                        ? "Expected Score"
                        : cfHeroScoreType === "rank"
                        ? "Expected CRL AIR Rank"
                        : "Expected Category Rank"}
                    </label>
                    <div className={`rw-marks-input-container ${err ? "has-error" : ""}`}>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        className="rw-marks-input-element"
                        placeholder={
                          cfHeroScoreType === "marks"
                            ? "e.g. 185"
                            : cfHeroScoreType === "rank"
                            ? "e.g. 18450"
                            : "e.g. 4200"
                        }
                        value={cfHeroScoreVal}
                        onChange={(e) => {
                          const v = e.target.value.replace(/[^0-9]/g, "");
                          if (cfHeroScoreType === "marks") {
                            if (v === "" || (Number(v) <= 300 && v.length <= 3)) {
                              setCfHeroScoreVal(v);
                              if (err) setErr("");
                            }
                          } else {
                            if (v === "" || Number(v) <= 1500000) {
                              setCfHeroScoreVal(v);
                              if (err) setErr("");
                            }
                          }
                        }}
                      />
                      <div className="rw-marks-denominator" aria-hidden="true">
                        <span className="rw-max-score">
                          {cfHeroScoreType === "marks" ? "/ 300" : cfHeroScoreType === "rank" ? "CRL" : "CAT"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Dropdowns */}
                  <div className="rw-cf-fields-stack">
                    <div className="rw-cf-field">
                      <label className="rw-cf-label">Candidate Category <span className="rw-req">*</span></label>
                      <div className="rw-cf-select-wrap">
                        <select
                          className={`rw-cf-native-select ${!cfCategory ? "rw-placeholder-active" : ""}`}
                          value={cfCategory}
                          onChange={(e) => {
                            setCfCategory(e.target.value);
                            if (err) setErr("");
                          }}
                          required
                        >
                          <option value="" disabled className="rw-placeholder-opt">
                            Select Candidate Category
                          </option>
                          {CATEGORIES.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                        <div className="rw-cf-select-chevron" aria-hidden="true">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                            <path d="m6 9 6 6 6-6" />
                          </svg>
                        </div>
                      </div>
                    </div>

                    <div className="rw-cf-field">
                      <label className="rw-cf-label">Seat Pool <span className="rw-req">*</span></label>
                      <div className="rw-cf-select-wrap">
                        <select
                          className={`rw-cf-native-select ${!cfSeatPool ? "rw-placeholder-active" : ""}`}
                          value={cfSeatPool}
                          onChange={(e) => {
                            setCfSeatPool(e.target.value);
                            if (err) setErr("");
                          }}
                          required
                        >
                          <option value="" disabled className="rw-placeholder-opt">
                            Select Seat Pool
                          </option>
                          <option value="Gender-Neutral">Gender-Neutral</option>
                          <option value="Female">Female-only</option>
                        </select>
                        <div className="rw-cf-select-chevron" aria-hidden="true">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                            <path d="m6 9 6 6 6-6" />
                          </svg>
                        </div>
                      </div>
                    </div>

                    <div className="rw-cf-field">
                      <label className="rw-cf-label">12th Domicile State <span className="rw-req">*</span></label>
                      <div className="rw-cf-select-wrap">
                        <select
                          className={`rw-cf-native-select ${!cfDomicile ? "rw-placeholder-active" : ""}`}
                          value={cfDomicile}
                          onChange={(e) => {
                            setCfDomicile(e.target.value);
                            if (err) setErr("");
                          }}
                          required
                        >
                          <option value="" disabled className="rw-placeholder-opt">
                            Select 12th Domicile State
                          </option>
                          {INDIAN_STATES.map((st) => (
                            <option key={st} value={st}>
                              {st}
                            </option>
                          ))}
                        </select>
                        <div className="rw-cf-select-chevron" aria-hidden="true">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                            <path d="m6 9 6 6 6-6" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  </div>

                  {err && <div className="rw-err-box">{err}</div>}

                  {/* Primary Predict Button */}
                  <button
                    type="button"
                    className="rw-predict-submit-btn"
                    onClick={() => {
                      if (!cfHeroScoreVal.trim()) {
                        setErr("Please enter your score or rank.");
                        return;
                      }
                      if (!cfCategory) {
                        setErr("Please select your Candidate Category.");
                        return;
                      }
                      if (!cfSeatPool) {
                        setErr("Please select your Seat Pool.");
                        return;
                      }
                      if (!cfDomicile) {
                        setErr("Please select your 12th Domicile State.");
                        return;
                      }
                      const query = new URLSearchParams({
                        inputType: cfHeroScoreType,
                        category: cfCategory,
                        seatPool: cfSeatPool,
                        domicileState: cfDomicile,
                      });
                      if (cfHeroScoreType === "marks") {
                        query.set("marks", cfHeroScoreVal);
                      } else if (cfHeroScoreType === "rank") {
                        query.set("rank", cfHeroScoreVal);
                      } else {
                        query.set("categoryRank", cfHeroScoreVal);
                        query.set("rank", cfHeroScoreVal);
                      }
                      window.location.href = `/college-finder?${query.toString()}`;
                    }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z" />
                    </svg>
                    <span>100% Official Data Based Prediction</span>
                  </button>

                  <button
                    type="button"
                    className="rw-res-recalc-btn"
                    onClick={() => {
                      setCardStep("input");
                      setErr("");
                    }}
                  >
                    ← Back to standard rank predictor
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Explore Specialized RankWise Tools Section */}
        <section className="rw-more-options-section">
          <div className="rw-section-header-wrap rw-center">
            <h2 className="rw-section-title">
              Explore Specialized <span className="rw-title-accent">RankWise</span> Tools
            </h2>
            <p className="rw-section-sub">
              Make confident, data-backed decisions with algorithmic JoSAA allotment predictions and multi-year shift difficulty analytics.
            </p>
          </div>

          <div className="rw-options-grid">
            {/* Option 1: College Finder */}
            <div
              className="rw-spec-card blue"
              style={{ cursor: "pointer" }}
              onClick={() => {
                setCardStep("college-form");
                setCfHeroScoreType("marks");
                setCfHeroScoreVal("");
                setCfCategory("");
                setCfSeatPool("");
                setCfDomicile("");
                setErr("");
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            >
              <div className="rw-spec-top">
                <div className="rw-spec-icon-box blue">
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                    <path d="M6 12v5c3 3 9 3 12 0v-5" />
                  </svg>
                </div>
                <span className="rw-spec-badge blue">
                  <span className="rw-spec-dot blue" />
                  JoSAA Rounds 1-6 Engine
                </span>
              </div>

              <div className="rw-spec-body">
                <div className="rw-spec-content">
                  <h3 className="rw-spec-title">
                    JoSAA College &amp; Branch Predictor
                  </h3>
                  <p className="rw-spec-desc">
                    Discover eligible NITs, IIITs, and CFIs based on your predicted CRL, category rank spline, seat quota, and domicile state.
                  </p>
                  <span className="rw-spec-btn blue">
                    <span>Launch Predictor</span>
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="5" y1="12" x2="19" y2="12" />
                      <polyline points="12 5 19 12 12 19" />
                    </svg>
                  </span>
                </div>

                <div className="rw-spec-art-wrap" aria-hidden="true">
                  <svg
                    width="170"
                    height="140"
                    viewBox="0 0 170 140"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="rw-spec-card-art"
                  >
                    <defs>
                      <radialGradient id="blueGlow" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#dbeafe" stopOpacity="0.75" />
                        <stop offset="100%" stopColor="#eff6ff" stopOpacity="0" />
                      </radialGradient>
                      <filter id="docShadow" x="-15%" y="-15%" width="135%" height="135%" filterUnits="userSpaceOnUse">
                        <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#1d64ec" floodOpacity="0.08" />
                      </filter>
                      <filter id="capShadow" x="-20%" y="-20%" width="150%" height="150%" filterUnits="userSpaceOnUse">
                        <feDropShadow dx="0" dy="5" stdDeviation="5" floodColor="#1e40af" floodOpacity="0.25" />
                      </filter>
                    </defs>

                    {/* Ambient Glow */}
                    <circle cx="95" cy="75" r="60" fill="url(#blueGlow)" />

                    {/* Allotment Document Sheet */}
                    <g filter="url(#docShadow)">
                      <rect x="20" y="24" width="102" height="84" rx="14" fill="#ffffff" stroke="#bfdbfe" strokeWidth="2.2" />
                      <rect x="32" y="38" width="40" height="6" rx="3" fill="#93c5fd" />
                      <rect x="32" y="52" width="68" height="5" rx="2.5" fill="#dbeafe" />
                      <rect x="32" y="64" width="50" height="5" rx="2.5" fill="#dbeafe" />
                      <rect x="32" y="76" width="58" height="5" rx="2.5" fill="#dbeafe" />
                      <rect x="32" y="88" width="34" height="5" rx="2.5" fill="#e2e8f0" />
                    </g>

                    {/* 3D Graduation Cap */}
                    <g filter="url(#capShadow)">
                      {/* Under skull band */}
                      <path d="M96 90C96 90 106 103 121 103C136 103 146 90 146 90V97C146 105 135 111 121 111C107 111 96 105 96 97V90Z" fill="#1e40af" />
                      {/* Rhombus Diamond Top */}
                      <path d="M121 70L156 84L121 98L86 84L121 70Z" fill="#2563eb" />
                      {/* Top Highlight Facet */}
                      <path d="M121 70L156 84L121 87L86 84L121 70Z" fill="#3b82f6" />
                      {/* Button */}
                      <circle cx="121" cy="84" r="2.5" fill="#93c5fd" />
                      {/* Tassel */}
                      <path d="M121 84C128 87 134 92 135 99L134 109" stroke="#bfdbfe" strokeWidth="2" strokeLinecap="round" />
                      <circle cx="134" cy="110" r="2.5" fill="#93c5fd" />
                    </g>
                  </svg>
                </div>
              </div>
            </div>

            {/* Option 2: Historical Analysis */}
            <Link href="/history" className="rw-spec-card purple">
              <div className="rw-spec-top">
                <div className="rw-spec-icon-box purple">
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 3v18h18" />
                    <path d="m19 9-5 5-4-4-3 3" />
                    <circle cx="19" cy="9" r="2" fill="currentColor" />
                  </svg>
                </div>
                <span className="rw-spec-badge purple">
                  <span className="rw-spec-dot purple" />
                  2024–2026 Shift Matrix
                </span>
              </div>

              <div className="rw-spec-body">
                <div className="rw-spec-content">
                  <h3 className="rw-spec-title">
                    Historical Shift Difficulty Analytics
                  </h3>
                  <p className="rw-spec-desc">
                    Analyze shift-by-shift difficulty variations, marks-vs-percentile drift, and normalized qualifying score benchmarks.
                  </p>
                  <span className="rw-spec-btn purple-outline">
                    <span>Explore Analytics</span>
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="5" y1="12" x2="19" y2="12" />
                      <polyline points="12 5 19 12 12 19" />
                    </svg>
                  </span>
                </div>

                <div className="rw-spec-art-wrap" aria-hidden="true">
                  <svg
                    width="170"
                    height="140"
                    viewBox="0 0 170 140"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    className="rw-spec-card-art"
                  >
                    <defs>
                      <radialGradient id="purpleGlow" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#ede9fe" stopOpacity="0.85" />
                        <stop offset="100%" stopColor="#faf5ff" stopOpacity="0" />
                      </radialGradient>
                      <linearGradient id="purpleBarGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#a855f7" />
                        <stop offset="100%" stopColor="#7c3aed" />
                      </linearGradient>
                      <filter id="barShadow" x="-20%" y="-10%" width="140%" height="130%" filterUnits="userSpaceOnUse">
                        <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#7c3aed" floodOpacity="0.18" />
                      </filter>
                    </defs>

                    {/* Ambient Glow */}
                    <circle cx="95" cy="75" r="60" fill="url(#purpleGlow)" />

                    {/* Grounding Base Shelf */}
                    <rect x="28" y="116" width="114" height="3" rx="1.5" fill="#ede9fe" />

                    {/* 4 Ascending Rounded Bars */}
                    <g filter="url(#barShadow)">
                      {/* Bar 1 (Shortest) */}
                      <rect x="36" y="90" width="18" height="26" rx="9" fill="#e9d5ff" />
                      {/* Bar 2 */}
                      <rect x="62" y="66" width="18" height="50" rx="9" fill="#d8b4fe" />
                      {/* Bar 3 */}
                      <rect x="88" y="44" width="18" height="72" rx="9" fill="#c084fc" />
                      {/* Bar 4 (Tallest, Vibrant Gradient) */}
                      <rect x="114" y="22" width="20" height="94" rx="10" fill="url(#purpleBarGrad)" />
                    </g>
                  </svg>
                </div>
              </div>
            </Link>
          </div>
        </section>

        {/* 1. Student Success Stories */}
        <section className="rw-reviews-section">
          <div className="rw-section-header-wrap rw-center">
            <h2 className="rw-section-title rw-center">
              Student Success <span className="rw-title-accent">Stories</span>
            </h2>
            <p className="rw-section-sub rw-center">
              Real reviews from students who used our predictor to get into dream colleges
            </p>
          </div>

          <div className="rw-carousel-wrapper">
            {/* Prev Button */}
            <button
              type="button"
              className="rw-carousel-nav prev"
              onClick={() => setActiveReviewIdx((prev) => (prev === 0 ? 2 : prev - 1))}
              aria-label="Previous review"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>

            {/* 3D Perspective Stage */}
            <div className="rw-carousel-stage">
              {[
                (activeReviewIdx + 2) % 3, // left slot
                activeReviewIdx,            // center slot
                (activeReviewIdx + 1) % 3, // right slot
              ].map((idx, pos) => {
                const review = reviewsData[idx];
                const slotClass = pos === 1 ? "slot-center" : pos === 0 ? "slot-left" : "slot-right";
                return (
                  <div
                    key={review.id}
                    className={`rw-review-card ${slotClass}`}
                    onClick={() => {
                      if (pos !== 1) setActiveReviewIdx(idx);
                    }}
                  >
                    <div className="rw-review-body">
                      <div className="rw-review-top">
                        <div className="rw-quote-icon">
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="#93c5fd">
                            <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
                          </svg>
                        </div>
                        <div className="rw-stars" aria-label="5 stars">
                          {"★★★★★"}
                        </div>
                      </div>

                      <div className="rw-review-main-row">
                        <div className="rw-review-text-wrap">
                          <p className="rw-review-text">{`"${review.quote.replace(/^"|"$/g, "")}"`}</p>
                          <div className="rw-review-author-name">
                            <span>{review.author}</span>
                          </div>
                        </div>

                        {/* HD Scalable Vector Avatar */}
                        <div className="rw-review-avatar-wrap" aria-hidden="true">
                          <svg width="62" height="62" viewBox="0 0 68 68" fill="none" xmlns="http://www.w3.org/2000/svg" className="rw-review-avatar-svg">
                            <defs>
                              <linearGradient id={`avatarBg-${review.id}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#eff6ff" />
                                <stop offset="100%" stopColor="#dbeafe" />
                              </linearGradient>
                              <linearGradient id={`gownGrad-${review.id}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#2563eb" />
                                <stop offset="100%" stopColor="#1d4ed8" />
                              </linearGradient>
                              <linearGradient id={`capGrad-${review.id}`} x1="0" y1="0" x2="1" y2="1">
                                <stop offset="0%" stopColor="#1e3a8a" />
                                <stop offset="100%" stopColor="#1e40af" />
                              </linearGradient>
                              <clipPath id={`avatarClip-${review.id}`}>
                                <circle cx="34" cy="34" r="32" />
                              </clipPath>
                            </defs>
                            <circle cx="34" cy="34" r="32" fill={`url(#avatarBg-${review.id})`} stroke="#bfdbfe" strokeWidth="1.5" />
                            <g clipPath={`url(#avatarClip-${review.id})`}>
                              {/* Gown & Shoulders */}
                              <path d="M10 60C10 49 19 44 34 44C49 44 58 49 58 60V68H10V60Z" fill={`url(#gownGrad-${review.id})`} />
                              {/* White Shirt Collar */}
                              <path d="M28 44L34 52L40 44H28Z" fill="#ffffff" />
                              {/* Neck */}
                              <rect x="30" y="36" width="8" height="10" rx="3" fill="#fed7aa" />
                              {/* Face */}
                              <ellipse cx="34" cy="29" rx="10" ry="11" fill="#fed7aa" />
                              {/* Ears */}
                              <circle cx="23" cy="29" r="2.5" fill="#fed7aa" />
                              <circle cx="45" cy="29" r="2.5" fill="#fed7aa" />
                              {/* Hair */}
                              <path d="M24 26C24 19 28 17 34 17C40 17 44 19 44 26C44 25 40 23 34 23C28 23 24 25 24 26Z" fill="#1e293b" />
                              {/* Cap Lower Band */}
                              <path d="M26 19H42V22C42 23.5 38.4 24.5 34 24.5C29.6 24.5 26 23.5 26 22V19Z" fill="#1e3a8a" />
                              {/* Mortarboard Diamond Top */}
                              <path d="M34 10L52 16L34 22L16 16L34 10Z" fill={`url(#capGrad-${review.id})`} />
                              {/* Center Button */}
                              <circle cx="34" cy="16" r="1.5" fill="#fbbf24" />
                              {/* Gold Tassel */}
                              <path d="M34 16C39 17 44 19 45 22L46 28" stroke="#f59e0b" strokeWidth="1.8" strokeLinecap="round" />
                              <circle cx="46" cy="29" r="1.8" fill="#f59e0b" />
                            </g>
                          </svg>
                        </div>
                      </div>
                    </div>

                    {/* Mint Green Bottom Strip with Bolt */}
                    <div className="rw-review-banner">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="rw-review-bolt">
                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                      </svg>
                      <span>{review.badge}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Next Button */}
            <button
              type="button"
              className="rw-carousel-nav next"
              onClick={() => setActiveReviewIdx((prev) => (prev === 2 ? 0 : prev + 1))}
              aria-label="Next review"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>

          {/* Carousel Pagination Dots */}
          <div className="rw-carousel-dots">
            {[0, 1, 2].map((i) => (
              <button
                key={i}
                type="button"
                className={`rw-carousel-dot ${activeReviewIdx === i ? "active" : ""}`}
                onClick={() => setActiveReviewIdx(i)}
                aria-label={`Show review ${i + 1}`}
              />
            ))}
          </div>
        </section>

        {/* 2. Why Choose Our JEE Predictor? */}
        <section className="rw-why-section">
          <div className="rw-section-header-wrap rw-center">
            <h2 className="rw-section-title rw-center">
              Why Choose Our <span className="rw-title-accent">JEE Predictor?</span>
            </h2>
            <p className="rw-section-sub rw-center">
              Trusted by thousands of students for accurate college predictions and expert guidance.
            </p>
          </div>
          <div className="rw-why-grid">
            {/* Card 1: Rank Prediction */}
            <div className="rw-why-card blue">
              <div className="rw-why-icon-box blue">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="20" x2="18" y2="10" />
                  <line x1="12" y1="20" x2="12" y2="4" />
                  <line x1="6" y1="20" x2="6" y2="14" />
                </svg>
              </div>
              <div className="rw-why-card-content">
                <h3 className="rw-why-title">Rank Prediction</h3>
                <p className="rw-why-desc">
                  Turn your marks or percentile into calibrated All India Rank (AIR) and category rank estimates using multi-year score curves.
                </p>
                <div className="rw-why-tag blue">AIR &amp; Category Rank</div>
              </div>
              <div className="rw-why-corner-wash blue" aria-hidden="true" />
            </div>

            {/* Card 2: College Prediction */}
            <div className="rw-why-card purple">
              <div className="rw-why-icon-box purple">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                  <path d="M6 12v5c3 3 9 3 12 0v-5" />
                </svg>
              </div>
              <div className="rw-why-card-content">
                <h3 className="rw-why-title">College Prediction</h3>
                <p className="rw-why-desc">
                  Discover eligible NITs, IIITs, and CFIs across JoSAA Rounds 1–6 matching your category, quota, and state domicile.
                </p>
                <div className="rw-why-tag purple">JoSAA Rounds 1–6</div>
              </div>
              <div className="rw-why-corner-wash purple" aria-hidden="true" />
            </div>

            {/* Card 3: Most Accurate */}
            <div className="rw-why-card green">
              <div className="rw-why-icon-box green">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <circle cx="12" cy="12" r="6" />
                  <circle cx="12" cy="12" r="2" />
                </svg>
              </div>
              <div className="rw-why-card-content">
                <h3 className="rw-why-title">Most Accurate</h3>
                <p className="rw-why-desc">
                  Predictions refined against 3+ years of official opening &amp; closing cut-offs, historical seat matrices, and admission trends.
                </p>
                <div className="rw-why-tag green">Data-Backed Accuracy</div>
              </div>
              <div className="rw-why-corner-wash green" aria-hidden="true" />
            </div>

            {/* Card 4: Flexible Inputs */}
            <div className="rw-why-card orange">
              <div className="rw-why-icon-box orange">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="4" y1="6" x2="20" y2="6" />
                  <circle cx="9" cy="6" r="2.5" fill="currentColor" />
                  <line x1="4" y1="12" x2="20" y2="12" />
                  <circle cx="15" cy="12" r="2.5" fill="currentColor" />
                  <line x1="4" y1="18" x2="20" y2="18" />
                  <circle cx="8" cy="18" r="2.5" fill="currentColor" />
                </svg>
              </div>
              <div className="rw-why-card-content">
                <h3 className="rw-why-title">Flexible Inputs</h3>
                <p className="rw-why-desc">
                  Start with raw marks (out of 300) or official NTA percentile — get precise outcomes with seamless automatic conversion.
                </p>
                <div className="rw-why-tag orange">Marks &amp; Percentile</div>
              </div>
              <div className="rw-why-corner-wash orange" aria-hidden="true" />
            </div>

            {/* Card 5: Advanced Algorithm-Based Prediction */}
            <div className="rw-why-card purple">
              <div className="rw-why-icon-box purple">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-2.04z" />
                  <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-2.04z" />
                </svg>
              </div>
              <div className="rw-why-card-content">
                <h3 className="rw-why-title">Advanced Algorithm-Based Prediction</h3>
                <p className="rw-why-desc">
                  Multi-factor algorithms analyze shift-by-shift difficulty variations, marks-vs-percentile drift, and normalized qualifying scores.
                </p>
                <div className="rw-why-tag purple">Shift Drift Engine</div>
              </div>
              <div className="rw-why-corner-wash purple" aria-hidden="true" />
            </div>

            {/* Card 6: Trusted by 51K+ Students */}
            <div className="rw-why-card blue">
              <div className="rw-why-icon-box blue">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <div className="rw-why-card-content">
                <h3 className="rw-why-title">Trusted by 51K+ Students</h3>
                <p className="rw-why-desc">
                  Helping 51,000+ JEE aspirants make confident, informed counseling choices with transparent, data-backed insights.
                </p>
                <div className="rw-why-tag blue">All-India Community</div>
              </div>
              <div className="rw-why-corner-wash blue" aria-hidden="true" />
            </div>
          </div>
        </section>

        {/* 3. Share on WhatsApp & Copy Link Banner */}
        <section className="rw-share-section">
          <div className="rw-share-bar">
            <div className="rw-share-left">
              <div className="rw-matrix-grid" aria-hidden="true">
                {[
                  true, false, false, true, false,
                  false, true, true, false, true,
                  true, false, true, true, false,
                ].map((lit, idx) => (
                  <span key={idx} className={`rw-matrix-dot ${lit ? "lit" : ""}`} />
                ))}
              </div>
              <div className="rw-share-text">
                Help your friends by sharing this FREE tool in your friend and coaching groups
              </div>
            </div>
            <div className="rw-share-actions">
              <button
                type="button"
                className="rw-share-btn-wa"
                onClick={handleWhatsAppShare}
                aria-label="Share on WhatsApp"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
                </svg>
                <span>Share on WhatsApp</span>
              </button>
              <button
                type="button"
                className="rw-share-btn-copy"
                onClick={handleCopyLink}
                aria-label="Copy link"
              >
                {copied ? (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                    </svg>
                    <span>Copy Link</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </section>
      </div>

      {/* Spacious Minimal Dark Navy Footer */}
      <footer className="rw-site-footer">
        {/* Subtle decorative curved strokes in top-right corner */}
        <div className="rw-footer-corner-decor" aria-hidden="true">
          <div className="rw-footer-corner-glow" />
          <svg
            className="rw-footer-corner-svg"
            width="140"
            height="140"
            viewBox="0 0 140 140"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M140 25C105 35 70 70 55 140"
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
          {/* Top Brand Heading */}
          <div className="rw-footer-main">
            <h3 className="rw-footer-heading">
              Built by Engineers, for Future Engineers.
            </h3>
          </div>

          <div className="rw-footer-divider" />

          {/* Bottom Legal & Copyright Section */}
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

      {/* Previous Year Trends Modal Dialog (Centered with full background blur) */}
      {showTrendsModal && data && (
        <div
          className="rw-modal-backdrop"
          onClick={() => setShowTrendsModal(false)}
          aria-modal="true"
          role="dialog"
        >
          <div
            className="rw-modal-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="rw-modal-header">
              <div className="rw-modal-header-left">
                <div className="rw-widget-icon-box">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
                    <polyline points="16 7 22 7 22 13" />
                  </svg>
                </div>
                <div>
                  <h3 className="rw-modal-title">Previous Year Trends Analysis</h3>
                  <p className="rw-modal-sub">
                    Expected result for {inputValue} / 300 Marks across JEE Main sessions
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="rw-modal-close-btn"
                onClick={() => setShowTrendsModal(false)}
                aria-label="Close modal"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Modal Body: Comparison Table */}
            <div className="rw-modal-body">
              <div className="rw-modal-table-wrap">
                <table className="rw-trends-table">
                  <thead>
                    <tr>
                      <th>Session / Year</th>
                      <th>Percentile</th>
                      <th>Approximate AIR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...data]
                      .sort((a, b) => b.year - a.year)
                      .map((row) => {
                        const isPred = row.year === projectedYear || row.isProjection;
                        return (
                          <tr
                            key={row.year}
                            className={isPred ? "rw-tr-highlight" : ""}
                          >
                            <td>
                              <div className="rw-year-cell">
                                <strong>JEE Main {row.year}</strong>
                                {isPred && (
                                  <span className="rw-pred-badge">Predicted</span>
                                )}
                              </div>
                            </td>
                            <td>
                              <div className="rw-table-val">
                                <strong>{formatPercentile(row.percentile)}%</strong>
                                {isPred && (
                                  <span className="rw-table-range">
                                    ({formatPercentile(row.percentileLow)} – {formatPercentile(row.percentileHigh)})
                                  </span>
                                )}
                              </div>
                            </td>
                            <td>
                              <div className="rw-table-val">
                                <strong>{formatAir(row.air)}</strong>
                                {isPred && (
                                  <span className="rw-table-range">
                                    ({formatAir(row.airBest)} – {formatAir(row.airWorst)})
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>

              {/* Explanatory note */}
              <div className="rw-trends-note">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#1d64ec"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                <span>
                  <strong>Trend Insight:</strong> Score-to-rank conversions shift across sessions based on shift difficulty and total candidate pool size. {projectedYear} uses multi-year weighted trends.
                </span>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="rw-modal-footer">
              <Link
                href="/history"
                className="rw-modal-link"
                onClick={() => setShowTrendsModal(false)}
              >
                <span>Explore Detailed Shift Archive</span>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </Link>
              <button
                type="button"
                className="rw-modal-action-btn"
                onClick={() => setShowTrendsModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
