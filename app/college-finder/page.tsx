"use client";

import React, { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import "./college-finder.css";
import { getScaleBounds } from "@/lib/college-finder/scale-bounds";
import {
  AdmissionProbability,
  BranchResult,
  CollegeFinderResponse,
  CollegeResult,
  SeatPool,
  StudentCategory
} from "@/lib/college-finder/types";

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh", "Chhattisgarh",
  "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir",
  "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Madhya Pradesh", "Maharashtra",
  "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab",
  "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh",
  "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands", "Dadra and Nagar Haveli and Daman and Diu"
];

const CATEGORIES: StudentCategory[] = ["General", "GEN-EWS", "OBC-NCL", "SC", "ST"];

export default function CollegeFinderPage() {
  // Form Inputs: Default empty strings - nothing pre-selected or hardcoded
  const [scoreType, setScoreType] = useState<"marks" | "percentile" | "rank" | "category_rank">("marks");
  const [scoreValue, setScoreValue] = useState<string>("");
  const [category, setCategory] = useState<string>("");
  const [seatPool, setSeatPool] = useState<string>("");
  const [domicileState, setDomicileState] = useState<string>("");
  const [difficulty, setDifficulty] = useState<string>("Moderate");

  // State: loading starts true identically on both server and client to guarantee 0 hydration mismatch
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [data, setData] = useState<CollegeFinderResponse | null>(null);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [selectedPill, setSelectedPill] = useState<string | null>(null);
  const [filterDegree, setFilterDegree] = useState<string>("all");
  const [filterBranch, setFilterBranch] = useState<string>("all");
  const [filterDuration, setFilterDuration] = useState<string>("all");
  const [filterCollegeType, setFilterCollegeType] = useState<string>("all");
  const [filterProbability, setFilterProbability] = useState<string>("all");

  // Bookmarking / Shortlist
  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set());

  // Round-wise Details Modal
  const [activeModalBranch, setActiveModalBranch] = useState<{
    college: string;
    branch: BranchResult;
  } | null>(null);

  const toggleBookmark = (key: string) => {
    setBookmarks((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Auto-predict when redirected from Home page with query params
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const m = params.get("marks");
    const pct = params.get("percentile");
    const rk = params.get("rank");
    const catRk = params.get("categoryRank");

    if (!m && !pct && !rk && !catRk) {
      // Redirect to homepage in-place JoSAA college predictor
      if (typeof window !== "undefined") {
        window.location.replace("/?step=college-form");
      }
      return;
    }

    let activeType: "marks" | "percentile" | "rank" | "category_rank" = "marks";
    let val = "";

    if (catRk) {
      activeType = "category_rank";
      val = catRk;
    } else if (pct) {
      activeType = "percentile";
      val = pct;
    } else if (rk) {
      activeType = "rank";
      val = rk;
    } else if (m) {
      activeType = "marks";
      val = m;
    }

    const catParam = params.get("category");
    const poolParam = params.get("seatPool");
    const domParam = params.get("domicileState") || params.get("domicile");
    const diffParam = params.get("difficulty");

    const activeCat = catParam && CATEGORIES.includes(catParam as StudentCategory)
      ? catParam
      : "General";
    const activePool = poolParam === "Female" || poolParam === "Gender-Neutral"
      ? poolParam
      : "Gender-Neutral";
    const activeDom = domParam && INDIAN_STATES.includes(domParam)
      ? domParam
      : "Delhi";
    const activeDiff = diffParam && ["Easy", "Moderate", "Difficult"].includes(diffParam)
      ? diffParam
      : "Moderate";

    setScoreType(activeType);
    setScoreValue(val);
    setCategory(activeCat);
    setSeatPool(activePool);
    setDomicileState(activeDom);
    setDifficulty(activeDiff);

    setLoading(true);
    fetch("/api/college-finder/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        inputType: activeType,
        marks: activeType === "marks" ? Number(val) : undefined,
        percentile: activeType === "percentile" ? Number(val) : undefined,
        rank: activeType === "rank" ? Number(val) : (activeType === "category_rank" ? Number(val) : undefined),
        categoryRank: activeType === "category_rank" ? Number(val) : undefined,
        category: activeCat,
        seatPool: activePool,
        domicileState: activeDom,
        difficulty: activeDiff,
        year: 2027,
      }),
    })
      .then((r) => r.json())
      .then((resData) => {
        if (resData.error) setError(resData.error);
        else setData(resData);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Failed to load predictions")
      )
      .finally(() => setLoading(false));
  }, []);

  // Navigate directly back to homepage in-place JoSAA College Predictor
  const handleNewPrediction = () => {
    if (typeof window !== "undefined") {
      window.location.href = "/?step=college-form";
    }
  };

  async function handlePredict(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setError("");

    if (!scoreValue.trim()) {
      setError(`Please enter your ${scoreType === "marks" ? "marks (0–300)" : scoreType === "percentile" ? "percentile (0–100)" : "CRL rank"}.`);
      return;
    }

    const numVal = Number(scoreValue);
    if (isNaN(numVal)) {
      setError("Please enter a valid numeric value.");
      return;
    }

    if (scoreType === "marks" && (numVal < 0 || numVal > 300)) {
      setError("JEE Main Marks must be between 0 and 300.");
      return;
    }
    if (scoreType === "percentile" && (numVal < 0 || numVal > 100)) {
      setError("Percentile must be between 0 and 100.");
      return;
    }
    if (scoreType === "rank" && numVal < 1) {
      setError("Rank must be at least 1.");
      return;
    }

    if (!category) {
      setError("Please select your candidate category.");
      return;
    }
    if (!seatPool) {
      setError("Please select your seat pool (Gender-Neutral or Female-Only).");
      return;
    }
    if (!domicileState) {
      setError("Please select your home state (domicile).");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/college-finder/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inputType: scoreType,
          marks: scoreType === "marks" ? numVal : undefined,
          percentile: scoreType === "percentile" ? numVal : undefined,
          rank: scoreType === "rank" ? numVal : undefined,
          category,
          seatPool,
          domicileState,
          difficulty: difficulty || "Moderate",
          year: 2027,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to generate college predictions");
      }
      setData(json);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Network error. Please try again.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  // Filtered colleges & branches
  const filteredColleges = useMemo(() => {
    if (!data) return [];
    const term = searchTerm.toLowerCase().trim();
    const pill = selectedPill?.toLowerCase();

    return data.colleges
      .map((college) => {
        // College Type filter
        if (filterCollegeType !== "all") {
          if (filterCollegeType === "NIT" && college.instituteType !== "NIT") return null;
          if (filterCollegeType === "IIIT" && college.instituteType !== "3IT") return null;
          if (filterCollegeType === "CFI" && college.instituteType !== "CFI") return null;
        }

        const matchingBranches = college.branches.filter((b) => {
          // Degree filter
          if (filterDegree !== "all" && !b.degree.toLowerCase().includes(filterDegree.toLowerCase())) {
            return false;
          }

          // Duration filter
          if (filterDuration !== "all" && !b.duration.toLowerCase().includes(filterDuration.toLowerCase())) {
            return false;
          }

          // Probability filter
          if (filterProbability !== "all") {
            const probNorm = b.probability.toLowerCase();
            const filterNorm = filterProbability.toLowerCase();
            if (probNorm !== filterNorm && !probNorm.includes(filterNorm)) return false;
          }

          // Branch name filter
          if (filterBranch !== "all" && !b.branchName.toLowerCase().includes(filterBranch.toLowerCase())) {
            return false;
          }

          // Quick pill filter (AI, CSE, ML, Data Science)
          if (pill) {
            const bName = b.branchName.toLowerCase();
            if (
              pill === "cse" &&
              !bName.includes("computer") &&
              !bName.includes("cse") &&
              !bName.includes("information technology")
            )
              return false;
            if (pill === "ai" && !bName.includes("artificial") && !bName.includes("ai")) return false;
            if (pill === "ml" && !bName.includes("machine learning") && !bName.includes("ml")) return false;
            if (
              pill === "data science" &&
              !bName.includes("data science") &&
              !bName.includes("analytics")
            )
              return false;
          }

          // Search term filter
          if (term) {
            const matchesCollege = college.instituteName.toLowerCase().includes(term);
            const matchesBranch = b.branchName.toLowerCase().includes(term);
            const matchesCity = college.city.toLowerCase().includes(term);
            const matchesState = college.state.toLowerCase().includes(term);
            if (!matchesCollege && !matchesBranch && !matchesCity && !matchesState) return false;
          }

          return true;
        });

        if (matchingBranches.length === 0) return null;

        // Sort branches by closing rank ascending (lower closing rank numbers first)
        matchingBranches.sort((a, b) => (a.latestClosingRank ?? 9999999) - (b.latestClosingRank ?? 9999999));

        return {
          ...college,
          branches: matchingBranches,
          highProbabilityCount: matchingBranches.filter(
            (b) => b.probability === "Very High" || b.probability === "High"
          ).length,
        };
      })
      .filter((c): c is CollegeResult => c !== null)
      .sort((a, b) => {
        const minCloseA = Math.min(...a.branches.map((br) => br.latestClosingRank ?? 9999999));
        const minCloseB = Math.min(...b.branches.map((br) => br.latestClosingRank ?? 9999999));
        if (minCloseA !== minCloseB) return minCloseA - minCloseB;
        const aNirf = a.nirfRank ?? 999;
        const bNirf = b.nirfRank ?? 999;
        if (aNirf !== bNirf) return aNirf - bNirf;
        return a.instituteName.localeCompare(b.instituteName);
      });
  }, [
    data,
    searchTerm,
    selectedPill,
    filterDegree,
    filterBranch,
    filterDuration,
    filterCollegeType,
    filterProbability,
  ]);

  // Precision Instrument Gauge Calculation: Scale displays Category Rank, downside displays CRL Rank
  const isNonGeneral = data && data.category !== "General" && data.categoryRankEstimate;
  const categoryRankValue = (data?.categoryRankEstimate && data.categoryRankEstimate.estimatedRank)
    ? data.categoryRankEstimate.estimatedRank
    : (data?.crl ?? 0);
  const mainRank = categoryRankValue;
  const { minR, maxR } = getScaleBounds(mainRank);
  const minRank = minR;
  const maxRank = maxR;
  const gaugeSpan = Math.max(1, maxRank - minRank);
  const gaugeRatio = Math.max(0.08, Math.min(0.92, (mainRank - minRank) / gaugeSpan));
  const pointerPercent = isNaN(gaugeRatio) ? 50 : gaugeRatio * 100;
  const totalTicks = 37;

  // Candidate score text display
  const candidateScoreDisplay = useMemo(() => {
    if (!data) return "";
    if (data.inputType === "percentile") {
      return `JEE Main 2027 Percentile - ${data.percentile.toFixed(2)}%`;
    }
    if (data.inputType === "rank") {
      return `JEE Main 2027 CRL Rank - ${data.crl.toLocaleString("en-IN")}`;
    }
    return `JEE Main 2027 Score - ${data.studentMarks}`;
  }, [data]);

  return (
    <div className="cf-page-wrapper">
      <div className="cf-container">
        {/* Navigation Bar */}
        <div className="cf-top-nav">
          <Link href="/?step=college-form" className="cf-back-btn">
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
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            <span>Back</span>
          </Link>

          <Link href="/" className="cf-brand-nav-link" aria-label="Duodevs.tech">
            <img
              src="/duodevs-mark.png"
              alt="DuoDevs Logo"
              className="cf-brand-logo-img"
            />
            <span className="cf-brand-logo-text">
              Duodevs<span className="cf-brand-logo-accent">.tech</span>
            </span>
          </Link>
        </div>

        {error ? (
          <div className="cf-loading-card">
            <div style={{ color: "#ef4444", fontWeight: 600, fontSize: "14px", marginBottom: 14 }}>
              {error}
            </div>
            <button
              onClick={handleNewPrediction}
              className="cf-back-btn"
              style={{ margin: "0 auto", cursor: "pointer" }}
            >
              Return to JoSAA Predictor
            </button>
          </div>
        ) : !data ? (
          <div className="cf-fallback-root">
            <div className="cf-results-header" style={{ marginBottom: "28px" }}>
              <div className="cf-header-left">
                <div className="cf-hero-badge">
                  <span className="cf-hero-badge-dot" />
                  <span>100% Official JoSAA Data Based Prediction</span>
                </div>
                <h1 className="cf-main-title">
                  JEE Main <span className="cf-title-accent">College Predictor 2027</span> &amp; JoSAA College Finder
                </h1>
                <p className="cf-main-sub">
                  Accurate, data-backed seat allotment predictions across NITs, IIITs &amp; GFTIs calibrated to your score, category rank, and home state quota.
                </p>
              </div>
            </div>

            <div className="cf-loading-card">
              <div className="cf-spinner" />
              {loading ? (
                <>
                  <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: "16px 0 8px 0", color: "#0b0f19" }}>
                    Predicting Eligible Colleges…
                  </h2>
                  <p style={{ color: "#64748b", margin: "0 0 16px 0" }}>
                    Analyzing official JoSAA closing ranks across all NITs, IIITs and GFTIs.
                  </p>
                </>
              ) : (
                <>
                  <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: "16px 0 8px 0", color: "#0b0f19" }}>
                    Opening JoSAA College Predictor…
                  </h2>
                  <p style={{ color: "#64748b", margin: "0 0 16px 0" }}>
                    Redirecting to the in-place College Predictor on the home page.
                  </p>
                  <Link
                    href="/?step=college-form"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "10px 20px",
                      backgroundColor: "#2563eb",
                      color: "#ffffff",
                      borderRadius: "8px",
                      fontWeight: 600,
                      fontSize: "14px",
                      textDecoration: "none",
                    }}
                  >
                    <span>Open JoSAA College Predictor Form</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="5" y1="12" x2="19" y2="12" />
                      <polyline points="12 5 19 12 12 19" />
                    </svg>
                  </Link>
                </>
              )}
            </div>

            {/* Comprehensive Student Guide to JoSAA Counselling & Seat Allotment */}
            <section style={{ marginTop: "44px", borderTop: "1px solid #e2e8f0", paddingTop: "36px" }}>
              <h2 style={{ fontSize: "1.65rem", fontWeight: 800, color: "#0b0f19", marginBottom: "8px" }}>
                Understanding <span style={{ color: "#2563eb" }}>JoSAA Counselling &amp; College Prediction</span>
              </h2>
              <p style={{ color: "#64748b", fontSize: "1rem", lineHeight: 1.6, marginBottom: "24px" }}>
                Key principles to know about seat quotas, closing ranks, category allocations, and choosing the right engineering institute.
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px" }}>
                <div style={{ padding: "20px", borderRadius: "12px", border: "1px solid #e2e8f0", background: "#f8fafc" }}>
                  <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "#0f172a", marginBottom: "8px" }}>
                    NITs, IIITs &amp; GFTIs Seat Allocation
                  </h3>
                  <p style={{ fontSize: "0.92rem", color: "#475569", lineHeight: 1.55 }}>
                    Joint Seat Allocation Authority (JoSAA) manages 6 centralized counselling rounds for all 31 National Institutes of Technology (NITs), 26 Indian Institutes of Information Technology (IIITs), and 38+ Government Funded Technical Institutes (GFTIs) based on JEE Main scores.
                  </p>
                </div>

                <div style={{ padding: "20px", borderRadius: "12px", border: "1px solid #e2e8f0", background: "#f8fafc" }}>
                  <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "#0f172a", marginBottom: "8px" }}>
                    Category Ranks vs CRL
                  </h3>
                  <p style={{ fontSize: "0.92rem", color: "#475569", lineHeight: 1.55 }}>
                    Candidates belonging to GEN-EWS, OBC-NCL, SC, or ST receive a Category Rank in addition to their Common Rank List (CRL). In JoSAA seat allocation, category-reserved seats are filled exclusively using Category Ranks, while Open seats use CRL ranks.
                  </p>
                </div>

                <div style={{ padding: "20px", borderRadius: "12px", border: "1px solid #e2e8f0", background: "#f8fafc" }}>
                  <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "#0f172a", marginBottom: "8px" }}>
                    Gender-Neutral vs Female-Only Pool
                  </h3>
                  <p style={{ fontSize: "0.92rem", color: "#475569", lineHeight: 1.55 }}>
                    Under government directives, NITs and IIITs allocate supernumerary seats for female candidates to ensure at least 20% female enrollment. Female candidates are eligible for both Gender-Neutral seats and Female-Only supernumerary quotas.
                  </p>
                </div>

                <div style={{ padding: "20px", borderRadius: "12px", border: "1px solid #e2e8f0", background: "#f8fafc" }}>
                  <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "#0f172a", marginBottom: "8px" }}>
                    Home State (HS) vs Other State (OS) Quota
                  </h3>
                  <p style={{ fontSize: "0.92rem", color: "#475569", lineHeight: 1.55 }}>
                    NITs reserve 50% of their seats for candidates whose 12th board examination state matches the institute&apos;s home state (HS Quota). The remaining 50% is open to Other State (OS Quota) aspirants. IIITs typically allocate 100% of seats on an All India (AI) basis.
                  </p>
                </div>

                <div style={{ padding: "20px", borderRadius: "12px", border: "1px solid #e2e8f0", background: "#f8fafc" }}>
                  <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "#0f172a", marginBottom: "8px" }}>
                    Opening and Closing Ranks
                  </h3>
                  <p style={{ fontSize: "0.92rem", color: "#475569", lineHeight: 1.55 }}>
                    Closing ranks indicate the rank of the last candidate admitted to a specific program in that round. Round 6 closing ranks define the final cutoff. RankWise correlates your predicted rank against multi-year official Round 1–6 closing archives.
                  </p>
                </div>

                <div style={{ padding: "20px", borderRadius: "12px", border: "1px solid #e2e8f0", background: "#f8fafc" }}>
                  <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "#0f172a", marginBottom: "8px" }}>
                    Calculate Your JEE Rank First
                  </h3>
                  <p style={{ fontSize: "0.92rem", color: "#475569", lineHeight: 1.55 }}>
                    Need to determine your rank first? Calculate your All India Rank with our <Link href="/" style={{ color: "#2563eb", fontWeight: 600, textDecoration: "underline" }}>JEE Main Rank Predictor 2027</Link> or review <Link href="/history" style={{ color: "#7c3aed", fontWeight: 600, textDecoration: "underline" }}>Historical Shift Difficulty Analytics</Link>.
                  </p>
                </div>
              </div>
            </section>
          </div>
        ) : (
          /* Results View: Clean split hero layout with Homepage-style Scale */
          <div className="cf-results-root">
            {/* Top Header Section */}
            <div className="cf-results-header">
              {/* Left Column: Heading and Meta */}
              <div className="cf-header-left">
                {/* Modern Rosette Badge */}
                <div className="cf-hero-badge">
                  <span className="cf-hero-badge-dot" />
                  <span>100% Official Data Based Prediction</span>
                </div>

                <h1 className="cf-main-title">
                  JEE Main <span className="cf-title-accent">College Predictor 2027</span>
                </h1>

                <p className="cf-main-sub">
                  Accurate, data-backed seat allotment predictions across NITs, IIITs &amp; GFTIs calibrated to your score, category rank, and home state quota.
                </p>

                {/* Candidate Profile Chips Row */}
                <div className="cf-profile-chips">
                  <div className="cf-profile-chip">
                    <span className="cf-chip-lbl">Category</span>
                    <span className="cf-chip-val">{data.category}</span>
                  </div>
                  <div className="cf-profile-chip">
                    <span className="cf-chip-lbl">Seat Pool</span>
                    <span className="cf-chip-val">{data.seatPool}</span>
                  </div>
                  <div className="cf-profile-chip">
                    <span className="cf-chip-lbl">Home State</span>
                    <span className="cf-chip-val">{data.domicileState}</span>
                  </div>
                  <div className="cf-profile-chip cf-chip-highlight">
                    <span className="cf-chip-lbl">
                      {data.inputType === "percentile"
                        ? "Percentile"
                        : data.inputType === "rank"
                        ? "CRL AIR"
                        : data.inputType === "category_rank"
                        ? `${data.category} Rank`
                        : "Raw Score"}
                    </span>
                    <span className="cf-chip-val">
                      {data.inputType === "percentile"
                        ? `${data.percentile.toFixed(2)}%`
                        : data.inputType === "rank"
                        ? data.crl.toLocaleString("en-IN")
                        : data.inputType === "category_rank"
                        ? (data.categoryRankEstimate?.estimatedRank ?? data.crl).toLocaleString("en-IN")
                        : `${data.studentMarks} / 300`}
                    </span>
                  </div>
                </div>
              </div>

              {/* Right Column: Homepage-Style Scale Card with Category Rank & CRL Rank downside */}
              <div className="cf-scorecard-wrap">
                <div className="cf-gauge-card">
                  {/* Percentile Pill */}
                  <div className="cf-gauge-percentile-pill">
                    <svg className="cf-gauge-sparkle-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                    <span>Predicted JEE Main Percentile:</span>
                    <strong>{data.percentile.toFixed(2)}%</strong>
                  </div>

                  {/* Category Rank Header */}
                  <div className="cf-gauge-header-row">
                    {data.category !== "General" ? (
                      <div className="cf-gauge-cat-row">
                        <span className="cf-cat-tag-pill">{data.category}</span>
                        <span className="cf-gauge-title-text">Category Rank JEE 2027</span>
                      </div>
                    ) : (
                      <div className="cf-gauge-cat-row">
                        <span className="cf-cat-tag-pill general">ALL INDIA</span>
                        <span className="cf-gauge-title-text">CRL AIR Rank JEE 2027</span>
                      </div>
                    )}
                  </div>

                  {/* Numbers Row: Left min, Center big main, Right max */}
                  <div className="cf-gauge-numbers-row">
                    <div className="cf-gauge-bound-col left">
                      <span className="cf-bound-label">Min</span>
                      <span className="cf-gauge-side-val left">
                        {minRank.toLocaleString("en-IN")}
                      </span>
                    </div>

                    <div className="cf-gauge-center-col">
                      <span className="cf-gauge-main-val">
                        {mainRank.toLocaleString("en-IN")}
                      </span>
                      <span className="cf-main-val-sub">
                        {data.category !== "General" ? `${data.category} Merit Rank` : "All-India AIR"}
                      </span>
                    </div>

                    <div className="cf-gauge-bound-col right">
                      <span className="cf-bound-label">Max</span>
                      <span className="cf-gauge-side-val right">
                        {maxRank.toLocaleString("en-IN")}
                      </span>
                    </div>
                  </div>

                  {/* Precision Gauge Ruler Track matching Homepage */}
                  <div className="cf-gauge-ruler" aria-hidden="true">
                    {Array.from({ length: totalTicks }).map((_, i) => (
                      <span
                        key={i}
                        className={`cf-gauge-tick ${i % 4 === 0 ? "major" : ""}`}
                      />
                    ))}
                    <div
                      className="cf-gauge-pointer"
                      style={{
                        left: `calc(10px + (100% - 20px) * ${pointerPercent / 100})`,
                      }}
                    >
                      <span className="cf-pointer-cap" />
                    </div>
                  </div>
                </div>

                {/* Downside CRL Rank: Dedicated sleek pill panel */}
                {data.category !== "General" ? (
                  <div className="cf-crl-panel">
                    <div className="cf-crl-left">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="2" y1="12" x2="22" y2="12" />
                        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                      </svg>
                      <span>Predicted All-India CRL:</span>
                      <strong>{data.crl.toLocaleString("en-IN")}</strong>
                    </div>
                    <span className="cf-crl-badge">Used for OPEN Quota</span>
                  </div>
                ) : (
                  <div className="cf-crl-panel general">
                    <div className="cf-crl-left">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                      <span>Evaluated across All-India OPEN &amp; State Quotas</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* IIT Exclusion Notice */}
            <div className="cf-iit-notice">
              <span className="cf-iit-notice-icon">ℹ</span>
              <span>
                <strong>Note on IITs:</strong> IIT admission cutoffs require a JEE Advanced rank and are
                excluded from this JEE Main-based prediction. Only NITs, IIITs, and Centrally Funded Technical Institutes (GFTIs) are evaluated.
              </span>
            </div>

            {/* Toolbar: Search input & New Prediction (Save this List removed) */}
            <div className="cf-toolbar">
              <div className="cf-search-box">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  className="cf-search-input"
                  placeholder="Search by college or branch..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                  <button
                    type="button"
                    className="cf-search-clear"
                    onClick={() => setSearchTerm("")}
                    aria-label="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>

              <div className="cf-toolbar-actions">
                <button
                  type="button"
                  className="cf-btn-outline"
                  onClick={handleNewPrediction}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
                  </svg>
                  <span>New Prediction</span>
                </button>
              </div>
            </div>

            {/* Filter Pills and Dropdowns */}
            <div className="cf-filters-row">
              <div className="cf-pills">
                {["AI", "CSE", "ML", "Data Science"].map((pill) => {
                  const isActive = selectedPill === pill;
                  return (
                    <button
                      key={pill}
                      type="button"
                      className={`cf-pill ${isActive ? "active" : ""}`}
                      onClick={() => setSelectedPill(isActive ? null : pill)}
                    >
                      <span>{pill}</span>
                      {isActive && <span className="cf-pill-x">✕</span>}
                    </button>
                  );
                })}
              </div>

              <div className="cf-dropdowns-row">
                <select
                  className="cf-filter-select"
                  value={filterDegree}
                  onChange={(e) => setFilterDegree(e.target.value)}
                >
                  <option value="all">All Degrees</option>
                  <option value="Bachelor of Technology">B.Tech</option>
                  <option value="Integrated / Dual Degree">Dual Degree</option>
                  <option value="Bachelor of Architecture">B.Arch</option>
                </select>

                <select
                  className="cf-filter-select"
                  value={filterBranch}
                  onChange={(e) => setFilterBranch(e.target.value)}
                >
                  <option value="all">All Branches</option>
                  <option value="Computer Science">Computer Science</option>
                  <option value="Information Technology">Information Technology</option>
                  <option value="Electronics">Electronics & Comm.</option>
                  <option value="Electrical">Electrical</option>
                  <option value="Mechanical">Mechanical</option>
                  <option value="Civil">Civil</option>
                  <option value="Chemical">Chemical</option>
                </select>

                <select
                  className="cf-filter-select"
                  value={filterDuration}
                  onChange={(e) => setFilterDuration(e.target.value)}
                >
                  <option value="all">All Durations</option>
                  <option value="4 Years">4 Years</option>
                  <option value="5 Years">5 Years</option>
                </select>

                <select
                  className="cf-filter-select"
                  value={filterCollegeType}
                  onChange={(e) => setFilterCollegeType(e.target.value)}
                >
                  <option value="all">All Institutes</option>
                  <option value="NIT">NITs Only</option>
                  <option value="IIIT">IIITs Only</option>
                  <option value="CFI">GFTIs / CFIs Only</option>
                </select>

                <select
                  className="cf-filter-select"
                  value={filterProbability}
                  onChange={(e) => setFilterProbability(e.target.value)}
                >
                  <option value="all">All Probabilities</option>
                  <option value="Very High">Very High</option>
                  <option value="High">High</option>
                  <option value="Moderate">Medium / Moderate</option>
                  <option value="Low">Low</option>
                </select>
              </div>
            </div>

            {/* Results Table matching Image 1 & 2 */}
            <div className="cf-table-wrap">
              <table className="cf-table">
                <thead>
                  <tr>
                    <th className="cf-col-college">COLLEGE</th>
                    <th className="cf-col-branch">BRANCH</th>
                    <th className="cf-col-josaa">
                      <div className="cf-josaa-th-top">JOSAA 2026 - ROUND 5</div>
                      <div className="cf-josaa-th-sub">
                        <span>OPENING RANK</span>
                        <span>CLOSING RANK</span>
                      </div>
                    </th>
                    <th className="cf-col-prob">PROBABILITY</th>
                    <th className="cf-col-pkg">AVG PACKAGE</th>
                    <th className="cf-col-action">ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredColleges.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="cf-empty-state">
                        <div className="cf-empty-box">
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.8">
                            <circle cx="11" cy="11" r="8" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                          </svg>
                          <h4>No matching colleges found</h4>
                          <p>Try clearing or broadening your search filters.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredColleges.map((college) => {
                      const collegeKey = college.instituteName;
                      const isCollegeBookmarked = bookmarks.has(collegeKey);

                      return (
                        <tr key={college.instituteName} className="cf-college-row">
                          {/* Left Column: College Meta */}
                          <td className="cf-college-info">
                            <div className="cf-college-name-row">
                              <span className="cf-college-title">{college.instituteName}</span>
                              <button
                                type="button"
                                className={`cf-bookmark-btn ${isCollegeBookmarked ? "active" : ""}`}
                                onClick={() => toggleBookmark(collegeKey)}
                                title={isCollegeBookmarked ? "Remove from shortlist" : "Bookmark college"}
                              >
                                <svg width="15" height="15" viewBox="0 0 24 24" fill={isCollegeBookmarked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
                                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                                </svg>
                              </button>
                            </div>

                            <div className="cf-college-loc">
                              {college.city}, {college.state}
                            </div>

                            {college.nirfRank && (
                              <div className="cf-college-nirf">
                                NIRF Rank - {college.nirfRank}
                              </div>
                            )}

                            {college.highestPackage && (
                              <div className="cf-pkg-stat">
                                <span className="cf-sparkle">✦</span>
                                <span>Highest Package: {college.highestPackage} Lpa</span>
                              </div>
                            )}

                            {college.highProbabilityCount > 0 && (
                              <div className="cf-high-prob-tag">
                                • {college.highProbabilityCount} High Probability Branches
                              </div>
                            )}
                          </td>

                          {/* Right Columns: Branches List */}
                          <td colSpan={5} className="cf-branch-list-td">
                            <table className="cf-nested-branch-table">
                              <tbody>
                                {college.branches.map((b) => {
                                  const branchKey = `${college.instituteName}|${b.branchName}`;
                                  const isBranchBookmarked = bookmarks.has(branchKey);

                                  return (
                                    <tr key={b.branchName} className="cf-nested-branch-row">
                                      {/* Branch & Degree */}
                                      <td className="cf-subcol-branch">
                                        <div className="cf-branch-title-row">
                                          <span className="cf-branch-title">{b.branchName}</span>
                                          <button
                                            type="button"
                                            className={`cf-bookmark-btn ${isBranchBookmarked ? "active" : ""}`}
                                            onClick={() => toggleBookmark(branchKey)}
                                            title="Bookmark branch"
                                          >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill={isBranchBookmarked ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
                                              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                                            </svg>
                                          </button>
                                        </div>
                                        <div className="cf-branch-deg">{b.degree}</div>
                                      </td>

                                      {/* JoSAA Cutoff (Opening & Closing) */}
                                      <td className="cf-subcol-josaa">
                                        <div className="cf-rank-flank">
                                          <div className="cf-rank-num-group">
                                            <span className="cf-orank" title="Opening Rank">
                                              {b.latestOpeningRank ? b.latestOpeningRank.toLocaleString("en-IN") : "—"}
                                            </span>
                                            <span className="cf-crank" title="Closing Rank">
                                              {b.latestClosingRank ? b.latestClosingRank.toLocaleString("en-IN") : "—"}
                                            </span>
                                          </div>
                                          <div className="cf-rank-quota-tag">
                                            {b.matchedCategory !== "OPEN" ? (
                                              <span className="cf-badge-cat-rank">{b.matchedCategory} Rank</span>
                                            ) : (
                                              <span className="cf-badge-crl-rank">CRL Rank</span>
                                            )}
                                            <span className="cf-badge-quota-sub">{b.matchedQuota}</span>
                                          </div>
                                        </div>
                                      </td>

                                      {/* Probability Badge with Distinct Colors */}
                                      <td className="cf-subcol-prob">
                                        <span className={`cf-prob-badge ${b.probability.toLowerCase().replace(" ", "-")}`}>
                                          {b.probability}
                                        </span>
                                      </td>

                                      {/* Average Package */}
                                      <td className="cf-subcol-pkg">
                                        {b.avgPackage ? (
                                          <span className="cf-pkg-val">{b.avgPackage} Lpa</span>
                                        ) : (
                                          <span className="cf-pkg-na">—</span>
                                        )}
                                      </td>

                                      {/* Action: Open Historical Analysis Modal */}
                                      <td className="cf-subcol-action">
                                        <button
                                          type="button"
                                          className="cf-action-link"
                                          onClick={() =>
                                            setActiveModalBranch({
                                              college: college.instituteName,
                                              branch: b,
                                            })
                                          }
                                        >
                                          Round-wise Details
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Historical Analysis Modal (Structured, Sexy & Professional) */}
            {activeModalBranch && (
              <div
                className="cf-modal-overlay"
                onClick={() => setActiveModalBranch(null)}
              >
                <div
                  className="cf-modal-box"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Modal Header */}
                  <div className="cf-modal-header">
                    <div>
                      <div className="cf-modal-badge">
                        Historical Cutoff Analysis · JoSAA Rounds
                      </div>
                      <h3 className="cf-modal-title">{activeModalBranch.branch.branchName}</h3>
                      <div className="cf-modal-inst">{activeModalBranch.college}</div>
                      <div className="cf-modal-tags-row">
                        <span className="cf-modal-tag">Quota: <strong>{activeModalBranch.branch.matchedQuota}</strong></span>
                        <span className="cf-modal-tag">Category: <strong>{activeModalBranch.branch.matchedCategory}</strong></span>
                        <span className="cf-modal-tag">Seat Pool: <strong>{activeModalBranch.branch.matchedGender}</strong></span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="cf-modal-close"
                      onClick={() => setActiveModalBranch(null)}
                      aria-label="Close"
                    >
                      ×
                    </button>
                  </div>

                  {/* Summary Metric Strip */}
                  <div className="cf-history-strip">
                    <div className="cf-history-stat-card">
                      <div className="cf-history-stat-lbl">Latest Closing Rank</div>
                      <div className="cf-history-stat-val">
                        {activeModalBranch.branch.latestClosingRank
                          ? activeModalBranch.branch.latestClosingRank.toLocaleString("en-IN")
                          : "—"}
                      </div>
                    </div>
                    <div className="cf-history-stat-card">
                      <div className="cf-history-stat-lbl">Your Predicted Rank</div>
                      <div className="cf-history-stat-val">
                        {data.effectiveEvaluationRank.toLocaleString("en-IN")}
                      </div>
                    </div>
                    <div className="cf-history-stat-card">
                      <div className="cf-history-stat-lbl">Admission Chance</div>
                      <div className="cf-history-stat-val">
                        <span className={`cf-prob-badge ${activeModalBranch.branch.probability.toLowerCase().replace(" ", "-")}`}>
                          {activeModalBranch.branch.probability}
                        </span>
                      </div>
                    </div>
                  </div>

                  {(() => {
                    const historyYears = Object.keys(activeModalBranch.branch.roundWiseHistory || {}).sort();
                    return (
                      <>
                        <div className="cf-modal-table-wrap">
                          <table className="cf-history-table">
                            <thead>
                              <tr>
                                <th>Round</th>
                                {historyYears.map((y) => (
                                  <th key={y}>{y} Closing Rank</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {[1, 2, 3, 4, 5, 6].map((roundNum) => {
                                const rKey = String(roundNum);
                                const hasAnyData = historyYears.some(
                                  (y) => activeModalBranch.branch.roundWiseHistory[y]?.[rKey]?.crank != null
                                );
                                if (roundNum === 6 && !hasAnyData) return null;
                                const isFinalRound = roundNum === 5;

                                return (
                                  <tr key={roundNum} className={isFinalRound ? "cf-history-highlight-row" : ""}>
                                    <td>
                                      <strong>Round {roundNum}</strong>
                                      {isFinalRound && <span className="cf-final-tag">Allotment</span>}
                                    </td>
                                    {historyYears.map((y) => {
                                      const crank = activeModalBranch.branch.roundWiseHistory[y]?.[rKey]?.crank;
                                      return (
                                        <td key={y}>
                                          {crank ? (
                                            <span className="cf-history-crank">
                                              {crank.toLocaleString("en-IN")}
                                            </span>
                                          ) : (
                                            <span className="cf-history-na">—</span>
                                          )}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </>
                    );
                  })()}

                  <div className="cf-modal-footer-info">
                    <div className="cf-modal-disclaimer">
                      * Historical closing ranks are verified from official JoSAA round archives. Past cutoffs serve as analytical benchmarks and do not constitute an official seat guarantee.
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Spacious Minimal Dark Navy Footer */}
      <footer className="rw-site-footer" style={{ marginTop: "60px", background: "#090d16", padding: "48px 24px 32px 24px", borderTop: "1px solid rgba(255, 255, 255, 0.08)" }}>
        <div style={{ maxWidth: "1140px", margin: "0 auto", textAlign: "center" }}>
          <h3 style={{ color: "#ffffff", fontSize: "1.25rem", fontWeight: 700, margin: "0 0 16px 0" }}>
            Built by Engineers, for Future Engineers.
          </h3>

          {/* Sitewide Internal Navigation Links */}
          <nav aria-label="RankWise Quick Links" style={{ display: "flex", flexWrap: "wrap", gap: "24px", justifyContent: "center", margin: "16px 0 24px 0" }}>
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

          <div style={{ height: "1px", background: "rgba(255, 255, 255, 0.08)", margin: "20px 0" }} />

          <p style={{ color: "#64748b", fontSize: "13px", margin: "0 0 8px 0" }}>
            An independent initiative built to support JEE aspirants across India. Not affiliated with NTA, JoSAA, or any government authority.
          </p>
          <div style={{ color: "#475569", fontSize: "12px" }}>
            © 2027 JEE Predictor. All Rights Reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
