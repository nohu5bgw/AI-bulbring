import { NextResponse } from "next/server";
import { getPortfolio, getBudget, getGoals, getSettings } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/data — portfolio, budget, and goals for the side panels. */
export async function GET() {
  const [portfolio, budget, goals, settings] = await Promise.all([
    getPortfolio(),
    getBudget(),
    getGoals(),
    getSettings(),
  ]);
  return NextResponse.json({ portfolio, budget, goals, settings });
}
