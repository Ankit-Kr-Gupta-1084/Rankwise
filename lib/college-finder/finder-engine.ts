// Core JoSAA College Finder engine for RankWise.
// Consumes data/josaa/josaa_cutoff_index.json and reuses lib/rankwise/predict.ts.
// Strictly excludes IITs from JEE Main comparisons.
import fs from "fs";
import path from "path";
import { predict, predictByPercentile, predictByRank, Year } from "../rankwise/predict";
import { estimateCategoryRank } from "./category-rank";
import {
  AdmissionProbability,
  BranchResult,
  CollegeFinderInput,
  CollegeFinderResponse,
  CollegeResult,
  InstituteType,
  RankType,
  RoundCutoff,
  SeatPool,
  StudentCategory
} from "./types";

interface StoredCutoffItem {
  quota: string;
  category: string;
  gender: string;
  history: {
    [year: string]: {
      [round: string]: RoundCutoff;
    };
  };
  latest_crank: number | null;
  latest_orank: number | null;
  latest_year: number | null;
  latest_round: number | null;
}

interface StoredProgramItem {
  branch_name: string;
  full_name: string;
  degree: string;
  duration: string;
  avg_package: number | null;
  median_package?: number | null;
  highest_package?: number | null;
  placement_year?: number | null;
  placement_source?: string | null;
  cutoffs: {
    [cutoffKey: string]: StoredCutoffItem;
  };
}

interface StoredInstituteItem {
  name: string;
  type: InstituteType;
  rank_type: RankType;
  state: string;
  city: string;
  nirf_rank: number | null;
  highest_package: number | null;
  avg_package: number | null;
  median_package?: number | null;
  placement_year?: number | null;
  placement_source?: string | null;
  programs: {
    [branchName: string]: StoredProgramItem;
  };
}

type StoredIndex = Record<string, StoredInstituteItem>;

let cachedIndex: StoredIndex | null = null;

function loadIndex(): StoredIndex {
  if (cachedIndex) return cachedIndex;
  const indexPath = path.join(process.cwd(), "data", "josaa", "josaa_cutoff_index.json");
  const raw = fs.readFileSync(indexPath, "utf8");
  cachedIndex = JSON.parse(raw);
  return cachedIndex!;
}

function calculateProbability(studentRank: number, closingRank: number): { prob: AdmissionProbability | null; score: number } {
  if (!closingRank || closingRank <= 0) return { prob: null, score: 99 };
  const ratio = studentRank / closingRank;
  // ratio <= 1.0 means student rank is <= closing rank (student cleared the cutoff)
  // Very High: student rank is well within cutoff (with 20%+ cushion)
  if (ratio <= 0.80) return { prob: 'Very High', score: ratio };
  // High: student rank clears the cutoff
  if (ratio <= 1.00) return { prob: 'High', score: ratio };
  // Moderate: within 15% of cutoff or within 250 ranks for top rankers (achievable in round 2-6)
  if (ratio <= 1.15 || studentRank - closingRank <= 250) return { prob: 'Moderate', score: ratio };
  // Low: within 30% of cutoff or within 500 ranks (ambitious / possible in CSAB spot rounds)
  if (ratio <= 1.30 || studentRank - closingRank <= 500) return { prob: 'Low', score: ratio };
  // Unreachable / Out of reach: cutoff is far too high (e.g. closing rank 2,000 for rank 170,000)
  return { prob: null, score: ratio };
}

function normalizeState(s: string): string {
  return (s || "").trim().toLowerCase();
}

function mapStudentCategoryToSeatCategory(cat: StudentCategory): string[] {
  switch (cat) {
    case 'General':
      return ['OPEN'];
    case 'GEN-EWS':
      return ['EWS', 'OPEN'];
    case 'OBC-NCL':
      return ['OBC-NCL', 'OPEN'];
    case 'SC':
      return ['SC', 'OPEN'];
    case 'ST':
      return ['ST', 'OPEN'];
    default:
      return ['OPEN'];
  }
}

export function findColleges(input: CollegeFinderInput): CollegeFinderResponse {
  const predictionYear = (input.year ?? 2027) as Year;
  const inputType = input.inputType ?? "marks";
  let pred;
  let rawScore = input.marks;

  if (inputType === "percentile") {
    const p = Number(input.percentile);
    if (!Number.isFinite(p) || p < 0 || p > 100) {
      throw new RangeError("Percentile must be between 0 and 100");
    }
    pred = predictByPercentile(p, predictionYear);
    rawScore = p;
  } else if (inputType === "rank") {
    const r = Number(input.rank);
    if (!Number.isFinite(r) || r < 1) {
      throw new RangeError("Rank must be at least 1");
    }
    pred = predictByRank(r, predictionYear);
    rawScore = r;
  } else if (inputType === "category_rank") {
    const cr = Number(input.categoryRank ?? input.rank);
    if (!Number.isFinite(cr) || cr < 1) {
      throw new RangeError("Category Rank must be at least 1");
    }
    // Estimate approximate CRL based on category demographic multiplier
    let mult = 1.0;
    if (input.category === "OBC-NCL") mult = 2.85;
    else if (input.category === "GEN-EWS") mult = 7.5;
    else if (input.category === "SC") mult = 14.5;
    else if (input.category === "ST") mult = 29.0;
    const estimatedCrl = Math.max(1, Math.round(cr * mult));
    pred = predictByRank(estimatedCrl, predictionYear);
    rawScore = cr;
  } else {
    const marks = Number(input.marks);
    if (!Number.isFinite(marks) || marks < 0 || marks > 300) {
      throw new RangeError("Marks must be between 0 and 300");
    }
    pred = predict(marks, predictionYear);
    rawScore = marks;
  }

  const crl = pred.air;
  const percentile = pred.percentile;

  // Category Rank Estimation (if student selected a reserved category)
  let categoryRankEst = estimateCategoryRank(input.category, crl, percentile);
  if (inputType === "category_rank" && categoryRankEst) {
    const cr = Number(input.categoryRank ?? input.rank);
    categoryRankEst = {
      ...categoryRankEst,
      estimatedRank: cr,
      rankBest: Math.max(1, cr - Math.min(200, Math.round(cr * 0.05))),
      rankWorst: cr + Math.min(200, Math.round(cr * 0.05)),
    };
  }

  const index = loadIndex();
  const collegeResults: CollegeResult[] = [];
  let totalBranchesCount = 0;

  const studentState = normalizeState(input.domicileState);
  const seatCategories = mapStudentCategoryToSeatCategory(input.category);

  for (const [instName, inst] of Object.entries(index)) {
    // RULE: Strictly exclude IITs and JEE Advanced rank-based institutions
    if (inst.rank_type === 'JEE_ADVANCED' || inst.type === 'IIT') {
      continue;
    }

    const instState = normalizeState(inst.state);
    const isHomeState = instState.length > 0 && (instState === studentState || studentState.includes(instState) || instState.includes(studentState));

    // Determine applicable quotas
    const allowedQuotas: string[] = ['AI'];
    if (isHomeState) {
      allowedQuotas.push('HS');
      if (instState === 'goa') allowedQuotas.push('GO');
      if (instState.includes('jammu') || instState.includes('kashmir')) allowedQuotas.push('JK');
    } else {
      allowedQuotas.push('OS');
    }

    const branchResults: BranchResult[] = [];

    for (const [branchKey, prog] of Object.entries(inst.programs)) {
      // Find matching cutoffs
      let bestMatch: {
        cutoff: StoredCutoffItem;
        evalRank: number;
        matchedQuota: string;
        matchedCat: string;
        prob: AdmissionProbability;
        score: number;
      } | null = null;

      const isReservedStudent = input.category !== "General";

      for (const seatCat of seatCategories) {
        // Reserved category uses Category Rank for reserved seats, CRL for OPEN seats
        const evalRank = seatCat === 'OPEN' ? crl : (categoryRankEst ? categoryRankEst.estimatedRank : crl);

        for (const q of allowedQuotas) {
          // Check requested gender pool first
          const targetGenders = input.seatPool === 'Female' ? ['Female-only', 'Gender-Neutral'] : ['Gender-Neutral'];

          for (const gen of targetGenders) {
            const cutoffKey = `${q}|${seatCat}|${gen}`;
            const cItem = prog.cutoffs[cutoffKey];
            if (cItem && cItem.latest_crank) {
              const { prob, score } = calculateProbability(evalRank, cItem.latest_crank);
              if (prob !== null) {
                const isCatSeat = seatCat !== 'OPEN';
                const currentIsCatSeat = bestMatch && bestMatch.matchedCat !== 'OPEN';

                // Category prioritization: Reserved candidates should always match their Category quota if available
                let shouldReplace = false;
                if (!bestMatch) {
                  shouldReplace = true;
                } else if (isReservedStudent && isCatSeat && !currentIsCatSeat) {
                  shouldReplace = true;
                } else if (isReservedStudent && !isCatSeat && currentIsCatSeat) {
                  shouldReplace = false;
                } else if (score < bestMatch.score) {
                  shouldReplace = true;
                }

                if (shouldReplace) {
                  bestMatch = {
                    cutoff: cItem,
                    evalRank,
                    matchedQuota: q,
                    matchedCat: seatCat,
                    prob,
                    score
                  };
                }
              }
            }
          }
        }
      }

      if (bestMatch && bestMatch.cutoff.latest_crank && bestMatch.prob) {
        branchResults.push({
          branchName: prog.branch_name,
          fullProgramName: prog.full_name,
          degree: prog.degree,
          duration: prog.duration,
          matchedQuota: bestMatch.matchedQuota,
          matchedCategory: bestMatch.matchedCat,
          matchedGender: bestMatch.cutoff.gender,
          latestOpeningRank: bestMatch.cutoff.latest_orank,
          latestClosingRank: bestMatch.cutoff.latest_crank,
          latestYear: bestMatch.cutoff.latest_year ?? 2026,
          latestRound: bestMatch.cutoff.latest_round ?? 5,
          probability: bestMatch.prob,
          probabilityScore: bestMatch.score,
          avgPackage: prog.avg_package ?? null,
          medianPackage: prog.median_package ?? null,
          placementYear: prog.placement_year ?? null,
          roundWiseHistory: bestMatch.cutoff.history
        });
      }
    }

    if (branchResults.length > 0) {
      // Sort branches: Cutoffs closing at low ranks appear first relative to student score & category rank
      branchResults.sort((a, b) => {
        if (input.category !== "General") {
          const aIsCat = a.matchedCategory !== "OPEN";
          const bIsCat = b.matchedCategory !== "OPEN";
          if (aIsCat && !bIsCat) return -1;
          if (!aIsCat && bIsCat) return 1;
        }
        const crA = a.latestClosingRank ?? 9999999;
        const crB = b.latestClosingRank ?? 9999999;
        return crA - crB;
      });

      const highProbCount = branchResults.filter(
        (b) => b.probability === 'Very High' || b.probability === 'High'
      ).length;

      totalBranchesCount += branchResults.length;

      collegeResults.push({
        instituteName: inst.name,
        instituteType: inst.type,
        rankType: inst.rank_type,
        city: inst.city,
        state: inst.state,
        nirfRank: inst.nirf_rank,
        highestPackage: inst.highest_package ?? null,
        avgPackage: inst.avg_package ?? null,
        medianPackage: inst.median_package ?? null,
        placementYear: inst.placement_year ?? null,
        highProbabilityCount: highProbCount,
        branches: branchResults
      });
    }
  }

  // Sort colleges:
  // Colleges which close at lower ranks relative to candidate marks/rank are first seen (top premier colleges first)
  collegeResults.sort((a, b) => {
    const minCloseA = Math.min(...a.branches.map((br) => br.latestClosingRank ?? 9999999));
    const minCloseB = Math.min(...b.branches.map((br) => br.latestClosingRank ?? 9999999));
    
    // Lower closing rank comes first (more competitive / higher prestige relative to marks)
    if (minCloseA !== minCloseB) {
      return minCloseA - minCloseB;
    }

    // Tie-break: NIRF rank (lower is better)
    const aNirf = a.nirfRank ?? 999;
    const bNirf = b.nirfRank ?? 999;
    if (aNirf !== bNirf) return aNirf - bNirf;

    // Tie-break: Highest package (higher is better)
    const aPkg = a.highestPackage ?? 0;
    const bPkg = b.highestPackage ?? 0;
    if (aPkg !== bPkg) return bPkg - aPkg;

    return a.instituteName.localeCompare(b.instituteName);
  });

  const effectiveEvaluationRank = categoryRankEst ? categoryRankEst.estimatedRank : crl;

  return {
    studentMarks: pred.marks,
    percentile: pred.percentile,
    percentileLow: pred.percentileLow,
    percentileHigh: pred.percentileHigh,
    crl: pred.air,
    crlBest: pred.airBest,
    crlWorst: pred.airWorst,
    effectiveEvaluationRank,
    category: input.category,
    seatPool: input.seatPool,
    domicileState: input.domicileState,
    categoryRankEstimate: categoryRankEst,
    colleges: collegeResults,
    totalColleges: collegeResults.length,
    totalBranches: totalBranchesCount,
    iitNotice: "IIT admission requires a JEE Advanced rank and is excluded from this JEE Main prediction system. Only NITs, IIITs, and Centrally Funded Technical Institutes (GFTIs) are evaluated.",
    inputType,
    rawInputScore: rawScore,
  };
}
