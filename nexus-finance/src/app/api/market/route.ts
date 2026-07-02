import { NextRequest, NextResponse } from "next/server";
import { getPortfolio, getSettings } from "@/lib/storage";
import { getQuotes, getUsdCad } from "@/lib/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/market — quotes for all holdings + indices + USD/CAD, or ?symbols=A,B for ad-hoc lookups. */
export async function GET(req: NextRequest) {
  try {
    const adhoc = req.nextUrl.searchParams.get("symbols");
    if (adhoc) {
      const quotes = await getQuotes(adhoc.split(",").map((s) => s.trim()));
      return NextResponse.json({ quotes });
    }

    const [portfolio, settings] = await Promise.all([getPortfolio(), getSettings()]);
    const symbols = [
      ...portfolio.holdings.map((h) => h.yahooSymbol).filter((s): s is string => !!s),
      ...settings.indices.map((i) => i.symbol),
    ];
    const [quotes, usdCad] = await Promise.all([getQuotes(symbols), getUsdCad()]);
    return NextResponse.json({ quotes, usdCad, indices: settings.indices });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Market data unavailable" },
      { status: 502 }
    );
  }
}
