"use client";

import type { Portfolio, Quote } from "@/lib/types";
import { fmtMoney, fmtPct, pnlColor } from "@/lib/format";

interface Props {
  portfolio: Portfolio | null;
  quotes: Record<string, Quote>;
  usdCad: number;
  indices: { symbol: string; label: string }[];
}

export default function PortfolioDashboard({ portfolio, quotes, usdCad, indices }: Props) {
  if (!portfolio) return <div className="p-4 text-sm text-muted">Loading portfolio…</div>;

  let totalCad = 0;
  let totalBookCad = 0;
  let dayChangeCad = 0;

  const rows = portfolio.holdings.map((h) => {
    const q = h.yahooSymbol ? quotes[h.yahooSymbol] : undefined;
    const price = q?.price ?? null;
    const fx = h.currency === "USD" ? usdCad : 1;
    const marketValue = price != null ? h.shares * price : h.bookValue; // book fallback for unlisted
    const mvCad = marketValue * fx;
    const bookCad = h.bookValue * fx;
    const pnl = marketValue - h.bookValue;
    const dayPct = q?.changePct ?? 0;
    const dayCad = price != null ? mvCad * (dayPct / 100 / (1 + dayPct / 100)) : 0;

    totalCad += mvCad;
    totalBookCad += bookCad;
    dayChangeCad += dayCad;

    return { h, price, marketValue, mvCad, pnl, dayPct, live: price != null };
  });

  rows.sort((a, b) => b.mvCad - a.mvCad);
  const totalPnl = totalCad - totalBookCad;
  const dayPctTotal = totalCad !== 0 ? (dayChangeCad / (totalCad - dayChangeCad)) * 100 : 0;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-b border-edge p-4">
        <div className="text-[10px] uppercase tracking-[0.2em] text-muted">
          TFSA · Wealthsimple · {portfolio.account.number}
        </div>
        <div className="mt-1 font-mono text-2xl tabular-nums text-ink">{fmtMoney(totalCad)}</div>
        <div className="mt-1 flex gap-4 font-mono text-xs tabular-nums">
          <span className={pnlColor(dayChangeCad)}>
            day {fmtMoney(dayChangeCad)} ({fmtPct(dayPctTotal)})
          </span>
          <span className={pnlColor(totalPnl)}>
            total {fmtMoney(totalPnl)} ({fmtPct(totalBookCad ? (totalPnl / totalBookCad) * 100 : 0)})
          </span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-px border-b border-edge bg-edge">
        {indices.map((ix) => {
          const q = quotes[ix.symbol];
          return (
            <div key={ix.symbol} className="bg-panel p-2">
              <div className="text-[10px] uppercase tracking-wider text-muted">{ix.label}</div>
              <div className="font-mono text-xs tabular-nums text-ink">
                {q ? q.price.toLocaleString("en-CA", { maximumFractionDigits: 0 }) : "—"}
              </div>
              <div className={`font-mono text-[10px] tabular-nums ${q ? pnlColor(q.changePct) : "text-muted"}`}>
                {q ? fmtPct(q.changePct) : ""}
              </div>
            </div>
          );
        })}
      </div>

      <table className="w-full font-mono text-xs">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wider text-muted">
            <th className="px-3 py-2 font-normal">Ticker</th>
            <th className="px-2 py-2 text-right font-normal">Value CAD</th>
            <th className="px-2 py-2 text-right font-normal">Day</th>
            <th className="px-3 py-2 text-right font-normal">P&L</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ h, mvCad, pnl, dayPct, live }) => (
            <tr key={h.ticker} className="border-t border-edge/60 hover:bg-raised">
              <td className="px-3 py-1.5">
                <span className="text-ink">{h.ticker}</span>
                {!live && <span className="ml-1 text-[9px] text-warn" title="No live quote — book value">BV</span>}
                <span className="ml-1 text-[9px] text-muted">{h.currency}</span>
              </td>
              <td className="px-2 py-1.5 text-right tabular-nums text-ink">
                {mvCad.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
              <td className={`px-2 py-1.5 text-right tabular-nums ${live ? pnlColor(dayPct) : "text-muted"}`}>
                {live ? fmtPct(dayPct) : "—"}
              </td>
              <td className={`px-3 py-1.5 text-right tabular-nums ${pnlColor(pnl)}`}>
                {live ? (pnl >= 0 ? "+" : "") + pnl.toFixed(2) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="p-3 text-[10px] text-muted">
        USD/CAD {usdCad.toFixed(4)} · quotes cached 5 min · BV = valued at book (no public quote)
      </div>
    </div>
  );
}
