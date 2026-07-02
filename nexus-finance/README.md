# NEXUS — Personal Finance Agent

A JARVIS-style personal finance agent. Full-screen chat with a command input, backed by Claude with tool use: portfolio analysis, budget tracking, market briefings, and savings goals. Bloomberg-terminal-meets-luxury-fintech dark UI.

## Stack

- **Next.js 14** (App Router) + React + Tailwind CSS
- **Anthropic Claude API** (`claude-sonnet-4-6`, streaming, tool use) via `@anthropic-ai/sdk`
- **yahoo-finance2** for live quotes (5-minute cache, CAD-listed tickers via `.TO`)
- **Local JSON storage** in `src/data/` (portfolio, budget, goals, settings)

## Setup

```bash
cd nexus-finance
npm install
cp .env.example .env.local   # add your ANTHROPIC_API_KEY
npm run dev
```

Open http://localhost:3000.

## Things to say

| Command | What happens |
|---|---|
| `morning briefing` / `good morning` | Portfolio value + day change, top movers, ±3% alerts, goal progress, market one-liner |
| `how's my portfolio?` | Full breakdown with live prices, weights, P&L |
| `how's NVDA doing?` | Single-stock deep dive |
| `I bought 5 more shares of NVDA at $142` | Updates holdings (tool call) |
| `remove MVIS` | Deletes a position |
| `log expense: $45 groceries` | Adds a budget entry |
| `set food budget to $600` | Sets a category limit |
| `budget status` | Spend vs. limits |
| `add $500 to Toronto fund` | Goal contribution |
| `new goal: New laptop $2000 by 2026-12-01` | Creates a goal |
| `what's happening in the market?` | S&P 500 / NASDAQ / TSX summary |
| `analyze RKLB` / `compare XUS vs VFV` | Ad-hoc research via live quotes |
| `clear` | Wipes the chat session |

**Keyboard:** `⌘K` / `Ctrl+K` focuses the input; `↑`/`↓` cycles command history. Chat persists in `localStorage`.

## Architecture notes

- `/api/chat` streams NDJSON events (`text` deltas, `tool` activity, `done`). The route runs a manual tool-use loop: Claude gets full portfolio/budget/goal context plus live quotes injected per request, and mutates data through typed tools (`update_holding`, `log_expense`, `set_budget_limit`, `update_goal`, `get_quotes`).
- `/api/market` serves cached quotes for the dashboard; `/api/data` serves the JSON stores for the side panels. Panels auto-refresh after any tool call.
- Holdings without a public quote (SPCX, LIME) carry `yahooSymbol: null` and are valued at book (marked `BV` in the dashboard).
- **Stretch-goal seams:** the NDJSON event stream is transport-agnostic (voice I/O can subscribe to the same events); tool execution is centralized in `src/lib/anthropic.ts#executeTool` (a webhook/orchestrator can call it directly); data access is isolated in `src/lib/storage.ts` (swap JSON for a DB or shared agent bus without touching routes).
