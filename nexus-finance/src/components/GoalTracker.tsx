"use client";

import type { Goals } from "@/lib/types";
import { fmtMoney } from "@/lib/format";

export default function GoalTracker({ goals }: { goals: Goals | null }) {
  if (!goals) return <div className="p-4 text-sm text-muted">Loading goals…</div>;

  const totalTarget = goals.goals.reduce((s, g) => s + g.target, 0);
  const totalCurrent = goals.goals.reduce((s, g) => s + g.current, 0);

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-b border-edge p-4">
        <div className="text-[10px] uppercase tracking-[0.2em] text-muted">Total saved</div>
        <div className="mt-1 font-mono text-2xl tabular-nums text-ink">
          {fmtMoney(totalCurrent)}
          <span className="ml-2 text-sm text-muted">of {fmtMoney(totalTarget)}</span>
        </div>
      </div>

      <div className="space-y-5 p-4">
        {goals.goals.map((g) => {
          const pct = g.target > 0 ? Math.min((g.current / g.target) * 100, 100) : 0;
          const daysLeft = g.deadline
            ? Math.ceil((new Date(g.deadline).getTime() - Date.now()) / 86_400_000)
            : null;
          return (
            <div key={g.id}>
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-ink">{g.name}</span>
                <span className="font-mono text-xs tabular-nums text-muted">
                  {fmtMoney(g.current)} / {fmtMoney(g.target)}
                </span>
              </div>
              <div className="mt-1.5 h-2 w-full bg-raised">
                <div className="h-2 bg-accent" style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-1 flex justify-between font-mono text-[10px] text-muted">
                <span>{pct.toFixed(1)}%</span>
                {daysLeft != null && (
                  <span className={daysLeft < 60 && pct < 80 ? "text-warn" : ""}>
                    {g.deadline} · {daysLeft}d left
                  </span>
                )}
              </div>
            </div>
          );
        })}
        {goals.goals.length === 0 && (
          <div className="font-mono text-xs text-muted">
            No goals. Try: &quot;new goal: Emergency fund $5000 by 2027-01-01&quot;
          </div>
        )}
      </div>
    </div>
  );
}
