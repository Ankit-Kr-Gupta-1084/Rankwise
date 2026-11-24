import { NextResponse } from "next/server";
import { findColleges } from "@/lib/college-finder/finder-engine";
import { CollegeFinderInput, SeatPool, StudentCategory } from "@/lib/college-finder/types";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const inputType = (u.searchParams.get("inputType") || "marks") as "marks" | "percentile" | "rank" | "category_rank";
  const marksParam = u.searchParams.get("marks");
  const percentileParam = u.searchParams.get("percentile");
  const rankParam = u.searchParams.get("rank");
  const categoryRankParam = u.searchParams.get("categoryRank");

  const marks = marksParam != null ? Number(marksParam) : undefined;
  const percentile = percentileParam != null ? Number(percentileParam) : undefined;
  const rank = rankParam != null ? Number(rankParam) : undefined;
  const categoryRank = categoryRankParam != null ? Number(categoryRankParam) : undefined;

  const category = (u.searchParams.get("category") || "General") as StudentCategory;
  const seatPool = (u.searchParams.get("seatPool") || "Gender-Neutral") as SeatPool;
  const domicileState = u.searchParams.get("domicileState") || "Delhi";
  const difficulty = (u.searchParams.get("difficulty") || "Moderate") as CollegeFinderInput["difficulty"];
  const year = Number(u.searchParams.get("year") || 2027);

  if (inputType === "percentile") {
    if (percentile === undefined || isNaN(percentile) || percentile < 0 || percentile > 100) {
      return NextResponse.json({ error: "Percentile must be between 0 and 100" }, { status: 400 });
    }
  } else if (inputType === "rank") {
    if (rank === undefined || isNaN(rank) || rank < 1) {
      return NextResponse.json({ error: "Rank must be at least 1" }, { status: 400 });
    }
  } else if (inputType === "category_rank") {
    const cr = categoryRank ?? rank;
    if (cr === undefined || isNaN(cr) || cr < 1) {
      return NextResponse.json({ error: "Category Rank must be at least 1" }, { status: 400 });
    }
  } else {
    if (marks === undefined || isNaN(marks) || marks < 0 || marks > 300) {
      return NextResponse.json({ error: "Marks must be between 0 and 300" }, { status: 400 });
    }
  }

  try {
    const result = findColleges({ inputType, marks, percentile, rank, categoryRank, category, seatPool, domicileState, difficulty, year });
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error computing college predictions";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const inputType = (body.inputType || "marks") as "marks" | "percentile" | "rank" | "category_rank";
    const marks = body.marks != null ? Number(body.marks) : undefined;
    const percentile = body.percentile != null ? Number(body.percentile) : undefined;
    const rank = body.rank != null ? Number(body.rank) : undefined;
    const categoryRank = body.categoryRank != null ? Number(body.categoryRank) : undefined;

    if (inputType === "percentile") {
      if (percentile === undefined || isNaN(percentile) || percentile < 0 || percentile > 100) {
        return NextResponse.json({ error: "Percentile must be between 0 and 100" }, { status: 400 });
      }
    } else if (inputType === "rank") {
      if (rank === undefined || isNaN(rank) || rank < 1) {
        return NextResponse.json({ error: "Rank must be at least 1" }, { status: 400 });
      }
    } else if (inputType === "category_rank") {
      const cr = categoryRank ?? rank;
      if (cr === undefined || isNaN(cr) || cr < 1) {
        return NextResponse.json({ error: "Category Rank must be at least 1" }, { status: 400 });
      }
    } else {
      if (marks === undefined || isNaN(marks) || marks < 0 || marks > 300) {
        return NextResponse.json({ error: "Marks must be between 0 and 300" }, { status: 400 });
      }
    }

    const result = findColleges({
      inputType,
      marks,
      percentile,
      rank,
      categoryRank,
      category: body.category || "General",
      seatPool: body.seatPool || "Gender-Neutral",
      domicileState: body.domicileState || "Delhi",
      difficulty: body.difficulty || "Moderate",
      year: Number(body.year || 2027)
    });
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error computing college predictions";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

