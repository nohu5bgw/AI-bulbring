"use client";

import type { Budget } from "@/lib/types";
import { fmtMoney } from "@/lib/format";

export default function BudgetPanel({ budget }: { budget: Budget | null }) {
  if (!budget) return <div className="p-4 text-sm text-muted">Loading budget…</div>;

  const month = new Date().toISOString().slice(0, 7);
  const monthExpenses = budget.expenses.filter((e) => e.date.startsWith(month));
  const totals: Record<string, number> = {};
  for (const e of monthExpenses) totals[e.category] = (totals[e.category] || 0) + e.amount;
  const totalSpent = monthExpenses.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-b border-edge p-4">
        <div className="text-[10px] uppercase tracking-[0.2em] text-muted">Spent this month</div>
        <div className="mt-1 font-mono text-2xl tabular-nums text-ink">{fmtMoney(totalSpent)}</div>
      </div>

      <div className="space-y-3 p-4">
        {budget.categories.map((c) => {
          const spent = totals[c.name] || 0;
          const limit = c.monthlyLimit;
          const pct = limit ? Math.min((spent / limit) * 100, 100) : 0;
          const over = limit != null && spent > limit;
          return (
            <div key={c.name}>
              <div className="flex justify-between font-mono text-xs">
                <span className="text-ink">{c.name}</span>
                <span className={over ? "text-down" : "text-muted"}>
                  {fmtMoney(spent)}
                  {limit != null && ` / ${fmtMoney(limit)}`}
                </span>
              </div>
              <div className="mt-1 h-1 w-full bg-raised">
                {limit != null && (
                  <div
                    className={`h-1 ${over ? "bg-down" : pct > 80 ? "bg-warn" : "bg-accent"}`}
                    style={{ width: `${pct}%` }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-edge p-4">
        <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-muted">Recent entries</div>
        {monthExpenses.length === 0 && (
          <div className="font-mono text-xs text-muted">No expenses logged this month. Try: &quot;log expense: $45 groceries&quot;</div>
        )}
        <div className="space-y-1">
          {monthExpenses
            .slice()
            .reverse()
            .slice(0, 12)
            .map((e) => (
              <div key={e.id} className="flex justify-between font-mono text-xs">
                <span className="truncate text-muted">
                  {e.date.slice(5)} · {e.category}
                  {e.note ? ` · ${e.note}` : ""}
                </span>
                <span className="tabular-nums text-ink">{fmtMoney(e.amount)}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
