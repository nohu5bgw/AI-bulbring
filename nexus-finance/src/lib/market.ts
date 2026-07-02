import YahooFinance from "yahoo-finance2";
import type { Quote } from "./types";

const yahooFinance = new YahooFinance();

const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  quote: Quote;
  fetchedAt: number;
}

// Module-level cache survives across requests within a server process.
const cache = new Map<string, CacheEntry>();

function toQuote(q: any): Quote {
  return {
    symbol: q.symbol,
    price: q.regularMarketPrice ?? 0,
    previousClose: q.regularMarketPreviousClose ?? q.regularMarketPrice ?? 0,
    changePct: q.regularMarketChangePercent ?? 0,
    currency: q.currency ?? "USD",
    name: q.shortName ?? q.longName,
    marketCap: q.marketCap,
    fiftyTwoWeekLow: q.fiftyTwoWeekLow,
    fiftyTwoWeekHigh: q.fiftyTwoWeekHigh,
    trailingPE: q.trailingPE,
  };
}

/** Fetch quotes for the given Yahoo symbols, using a 5-minute cache. */
export async function getQuotes(symbols: string[]): Promise<Record<string, Quote>> {
  const now = Date.now();
  const result: Record<string, Quote> = {};
  const stale: string[] = [];

  for (const s of symbols) {
    const hit = cache.get(s);
    if (hit && now - hit.fetchedAt < CACHE_TTL_MS) {
      result[s] = hit.quote;
    } else {
      stale.push(s);
    }
  }

  if (stale.length > 0) {
    try {
      const fetched = await yahooFinance.quote(stale);
      const list = Array.isArray(fetched) ? fetched : [fetched];
      for (const q of list) {
        if (!q?.symbol) continue;
        const quote = toQuote(q);
        cache.set(q.symbol, { quote, fetchedAt: now });
        result[q.symbol] = quote;
      }
    } catch {
      // Batch failed (rate limit / network) — fall back to per-symbol so one
      // bad ticker doesn't sink the rest.
      for (const s of stale) {
        try {
          const q = await yahooFinance.quote(s);
          if (q?.symbol) {
            const quote = toQuote(q);
            cache.set(s, { quote, fetchedAt: now });
            result[s] = quote;
          }
        } catch {
          const hit = cache.get(s);
          if (hit) result[s] = hit.quote; // serve stale over nothing
        }
      }
    }
  }

  return result;
}

/** USD -> CAD conversion rate (cached like any quote). */
export async function getUsdCad(): Promise<number> {
  const quotes = await getQuotes(["USDCAD=X"]);
  return quotes["USDCAD=X"]?.price ?? 1.37; // sane fallback if FX fetch fails
}
