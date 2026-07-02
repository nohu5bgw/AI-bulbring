"use client";

import { useCallback, useEffect, useState } from "react";
import Chat from "@/components/Chat";
import PortfolioDashboard from "@/components/PortfolioDashboard";
import BudgetPanel from "@/components/BudgetPanel";
import GoalTracker from "@/components/GoalTracker";
import type { Portfolio, Budget, Goals, Quote } from "@/lib/types";

type Tab = "portfolio" | "budget" | "goals";

export default function Home() {
  const [tab, setTab] = useState<Tab>("portfolio");
  const [panelOpen, setPanelOpen] = useState(true);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [goals, setGoals] = useState<Goals | null>(null);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [usdCad, setUsdCad] = useState(1.37);
  const [indices, setIndices] = useState<{ symbol: string; label: string }[]>([]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/data");
      const data = await res.json();
      setPortfolio(data.portfolio);
      setBudget(data.budget);
      setGoals(data.goals);
    } catch {}
    try {
      const res = await fetch("/api/market");
      const data = await res.json();
      if (data.quotes) setQuotes(data.quotes);
      if (data.usdCad) setUsdCad(data.usdCad);
      if (data.indices) setIndices(data.indices);
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5 * 60 * 1000); // match the 5-min market cache
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <main className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-edge bg-panel px-4 py-2">
        <div className="flex items-center gap-3">
          <span className="inline-block h-2 w-2 bg-accent" />
          <h1 className="font-mono text-sm font-semibold tracking-[0.3em] text-ink">NEXUS</h1>
          <span className="hidden font-mono text-[10px] uppercase tracking-wider text-muted sm:block">
            personal finance agent
          </span>
        </div>
        <div className="flex items-center gap-1 font-mono text-[11px]">
          {(["portfolio", "budget", "goals"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                setPanelOpen(true);
              }}
              className={`border px-2.5 py-1 uppercase tracking-wider transition-colors ${
                tab === t && panelOpen
                  ? "border-accent text-accent"
                  : "border-edge text-muted hover:text-ink"
              }`}
            >
              {t}
            </button>
          ))}
          <button
            onClick={() => setPanelOpen((o) => !o)}
            className="ml-2 border border-edge px-2.5 py-1 text-muted hover:text-ink"
            title="Toggle panel"
          >
            {panelOpen ? "⟩" : "⟨"}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <section className="min-w-0 flex-1">
          <Chat onDataChanged={refresh} />
        </section>
        {panelOpen && (
          <aside className="hidden w-[380px] shrink-0 border-l border-edge bg-panel md:block">
            {tab === "portfolio" && (
              <PortfolioDashboard portfolio={portfolio} quotes={quotes} usdCad={usdCad} indices={indices} />
            )}
            {tab === "budget" && <BudgetPanel budget={budget} />}
            {tab === "goals" && <GoalTracker goals={goals} />}
          </aside>
        )}
      </div>
    </main>
  );
}
