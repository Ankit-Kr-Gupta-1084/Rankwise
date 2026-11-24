export type StudentCategory = 'General' | 'GEN-EWS' | 'OBC-NCL' | 'SC' | 'ST';
export type SeatPool = 'Gender-Neutral' | 'Female';
export type InstituteType = 'NIT' | '3IT' | 'CFI' | 'IIT';
export type RankType = 'JEE_MAIN' | 'JEE_ADVANCED';
export type AdmissionProbability = 'Very High' | 'High' | 'Moderate' | 'Low' | 'Very Low';

export interface CollegeFinderInput {
  inputType?: 'marks' | 'percentile' | 'rank' | 'category_rank';
  marks?: number;
  percentile?: number;
  rank?: number;
  categoryRank?: number;
  category: StudentCategory;
  seatPool: SeatPool;
  domicileState: string;
  difficulty?: 'Easy' | 'Moderate' | 'Difficult';
  year?: number;
}

export interface CategoryRankEstimate {
  category: StudentCategory;
  estimatedRank: number;
  rankBest: number;
  rankWorst: number;
  uncertaintyPercentage: number;
  confidenceTier: 'Validated (High)' | 'Calibrated (Moderate)' | 'Experimental (Limited Sample)';
  sampleCount: number;
  basis: string;
  isOfficial: boolean;
  disclosure: string;
}

export interface RoundCutoff {
  orank: number | null;
  crank: number | null;
}

export interface BranchResult {
  branchName: string;
  fullProgramName: string;
  degree: string;
  duration: string;
  matchedQuota: string;
  matchedCategory: string;
  matchedGender: string;
  latestOpeningRank: number | null;
  latestClosingRank: number | null;
  latestYear: number;
  latestRound: number;
  probability: AdmissionProbability;
  probabilityScore: number; // ratio of student rank to cutoff
  avgPackage: number | null;
  medianPackage?: number | null;
  placementYear?: number | null;
  roundWiseHistory: {
    [year: string]: {
      [round: string]: RoundCutoff;
    };
  };
}

export interface CollegeResult {
  instituteName: string;
  instituteType: InstituteType;
  rankType: RankType;
  city: string;
  state: string;
  nirfRank: number | null;
  highestPackage: number | null;
  avgPackage: number | null;
  medianPackage?: number | null;
  placementYear?: number | null;
  highProbabilityCount: number;
  branches: BranchResult[];
}

export interface CollegeFinderResponse {
  studentMarks: number;
  percentile: number;
  percentileLow: number;
  percentileHigh: number;
  crl: number;
  crlBest: number;
  crlWorst: number;
  effectiveEvaluationRank: number;
  category: StudentCategory;
  seatPool: SeatPool;
  domicileState: string;
  categoryRankEstimate: CategoryRankEstimate | null;
  colleges: CollegeResult[];
  totalColleges: number;
  totalBranches: number;
  iitNotice: string;
  inputType?: 'marks' | 'percentile' | 'rank' | 'category_rank';
  rawInputScore?: number;
}
