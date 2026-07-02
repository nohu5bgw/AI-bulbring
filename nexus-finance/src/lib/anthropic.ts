import Anthropic from "@anthropic-ai/sdk";
import { getPortfolio, savePortfolio, getBudget, saveBudget, getGoals, saveGoals, getSettings } from "./storage";
import { getQuotes, getUsdCad } from "./market";
import type { Expense, Goal, Holding } from "./types";

export const MODEL = process.env.NEXUS_MODEL || "claude-sonnet-4-6";

export function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set. Add it to .env.local.");
  }
  return new Anthropic();
}

export const SYSTEM_PROMPT = `You are NEXUS, a personal finance AI agent. You are concise, sharp, and slightly formal with occasional dry wit. You address the user as "sir" sparingly — not every message. You have access to their portfolio holdings, budget data, and savings goals. When analyzing finances, be direct and actionable — no fluff, no hedging, no filler. If you notice something concerning (overspending, concentration risk, big market moves beyond the alert threshold), flag it proactively. Format financial data cleanly: use markdown tables for multi-row data and align numbers. Use CAD as the default currency since the user is Canadian, but show USD values for US-listed securities (the USD/CAD rate is provided). Holdings with no live quote (private/unlisted like SPCX, LIME) are valued at book value — say so when it matters.

Behaviors:
- "morning briefing" / "wake up" / "good morning" → portfolio value + daily change ($ and %), top movers, holdings up/down more than the alert threshold, savings goal progress, and a one-line market summary from the index data.
- Portfolio math: market value = shares x live price; P&L = market value - book value. Convert USD positions to CAD for totals.
- Use tools to mutate data (add/remove/update holdings, log expenses, set budget limits, contribute to or create goals). Confirm what changed after a tool call, tersely.
- Use the get_quotes tool only for tickers NOT already in the provided market data (e.g. "Analyze VFV" or comparisons with new symbols). Canadian TSX tickers need the ".TO" suffix for quotes.
- Dates: interpret relative dates against the current date given in context.`;

export const TOOLS: Anthropic.Tool[] = [
  {
    name: "get_quotes",
    description:
      "Fetch live market quotes for tickers not already present in the provided context (new symbols the user asks about, comparisons, research). Use Yahoo Finance symbols: US tickers as-is (e.g. NVDA), TSX tickers with .TO suffix (e.g. VFV.TO), indices like ^GSPC.",
    input_schema: {
      type: "object",
      properties: {
        symbols: { type: "array", items: { type: "string" }, description: "Yahoo Finance symbols to fetch" },
      },
      required: ["symbols"],
    },
  },
  {
    name: "update_holding",
    description:
      "Add, remove, or modify a portfolio holding. For 'buy', pass shares bought and price paid per share — shares and book value are added to any existing position. For 'sell', shares are subtracted and book value reduced proportionally. 'remove' deletes the position entirely. 'add_new' creates a brand-new position.",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["buy", "sell", "remove", "add_new"] },
        ticker: { type: "string", description: "Ticker symbol, e.g. NVDA" },
        shares: { type: "number", description: "Number of shares (required for buy/sell/add_new)" },
        price: { type: "number", description: "Price per share paid/received (required for buy/add_new)" },
        name: { type: "string", description: "Company/fund name (for add_new)" },
        currency: { type: "string", enum: ["CAD", "USD"], description: "Currency (for add_new)" },
        category: { type: "string", description: "Category label (for add_new), e.g. 'US Stock'" },
        yahooSymbol: { type: "string", description: "Yahoo symbol if quotable (for add_new); TSX needs .TO" },
      },
      required: ["action", "ticker"],
    },
  },
  {
    name: "log_expense",
    description: "Log a budget expense entry.",
    input_schema: {
      type: "object",
      properties: {
        amount: { type: "number" },
        category: {
          type: "string",
          enum: ["Rent", "Food", "Transport", "Entertainment", "Subscriptions", "Savings", "Other"],
        },
        note: { type: "string", description: "Short description, e.g. 'groceries'" },
        date: { type: "string", description: "ISO date (YYYY-MM-DD); defaults to today" },
      },
      required: ["amount", "category"],
    },
  },
  {
    name: "set_budget_limit",
    description: "Set (or clear) the monthly budget limit for a category.",
    input_schema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          enum: ["Rent", "Food", "Transport", "Entertainment", "Subscriptions", "Savings", "Other"],
        },
        monthlyLimit: { type: ["number", "null"], description: "Monthly limit in CAD, or null to clear" },
      },
      required: ["category", "monthlyLimit"],
    },
  },
  {
    name: "update_goal",
    description:
      "Contribute to, withdraw from, create, or delete a savings goal. 'contribute' adds to current (negative amount withdraws).",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["contribute", "create", "delete"] },
        name: { type: "string", description: "Goal name (matched case-insensitively for contribute/delete)" },
        amount: { type: "number", description: "Contribution amount (for contribute)" },
        target: { type: "number", description: "Target amount (for create)" },
        deadline: { type: "string", description: "ISO date deadline (for create)" },
      },
      required: ["action", "name"],
    },
  },
];

/** Execute a tool call from the agent and return a string result for the model. */
export async function executeTool(name: string, input: any): Promise<string> {
  try {
    switch (name) {
      case "get_quotes": {
        const quotes = await getQuotes(input.symbols as string[]);
        if (Object.keys(quotes).length === 0) return "No quotes found for the requested symbols.";
        return JSON.stringify(quotes);
      }

      case "update_holding": {
        const portfolio = await getPortfolio();
        const ticker = String(input.ticker).toUpperCase();
        const idx = portfolio.holdings.findIndex((h) => h.ticker === ticker);

        if (input.action === "remove") {
          if (idx === -1) return `No holding found for ${ticker}.`;
          portfolio.holdings.splice(idx, 1);
          await savePortfolio(portfolio);
          return `Removed ${ticker} from the portfolio.`;
        }

        if (input.action === "add_new") {
          if (idx !== -1) return `${ticker} already exists — use action 'buy' to add shares.`;
          const holding: Holding = {
            ticker,
            name: input.name || ticker,
            shares: input.shares,
            bookValue: Number((input.shares * input.price).toFixed(2)),
            currency: input.currency === "CAD" ? "CAD" : "USD",
            yahooSymbol: input.yahooSymbol ?? null,
            category: input.category || "US Stock",
          };
          portfolio.holdings.push(holding);
          await savePortfolio(portfolio);
          return `Added new position: ${holding.shares} shares of ${ticker} at ${input.price} ${holding.currency} (book value ${holding.bookValue}).`;
        }

        if (idx === -1) return `No holding found for ${ticker}. Use action 'add_new' to create it.`;
        const h = portfolio.holdings[idx];

        if (input.action === "buy") {
          h.shares = Number((h.shares + input.shares).toFixed(6));
          h.bookValue = Number((h.bookValue + input.shares * input.price).toFixed(2));
          await savePortfolio(portfolio);
          return `Bought ${input.shares} ${ticker} at ${input.price} ${h.currency}. New position: ${h.shares} shares, book value ${h.bookValue} ${h.currency}.`;
        }

        if (input.action === "sell") {
          if (input.shares >= h.shares) {
            portfolio.holdings.splice(idx, 1);
            await savePortfolio(portfolio);
            return `Sold entire ${ticker} position (${h.shares} shares). Position closed.`;
          }
          const fraction = input.shares / h.shares;
          h.bookValue = Number((h.bookValue * (1 - fraction)).toFixed(2));
          h.shares = Number((h.shares - input.shares).toFixed(6));
          await savePortfolio(portfolio);
          return `Sold ${input.shares} ${ticker}. Remaining: ${h.shares} shares, book value ${h.bookValue} ${h.currency}.`;
        }

        return `Unknown action '${input.action}'.`;
      }

      case "log_expense": {
        const budget = await getBudget();
        const expense: Expense = {
          id: `exp-${Date.now()}`,
          date: input.date || new Date().toISOString().slice(0, 10),
          amount: input.amount,
          category: input.category,
          note: input.note || "",
        };
        budget.expenses.push(expense);
        await saveBudget(budget);
        const month = expense.date.slice(0, 7);
        const monthTotal = budget.expenses
          .filter((e) => e.date.startsWith(month) && e.category === expense.category)
          .reduce((s, e) => s + e.amount, 0);
        return `Logged $${expense.amount} ${expense.category} (${expense.note || "no note"}) on ${expense.date}. ${expense.category} total this month: $${monthTotal.toFixed(2)}.`;
      }

      case "set_budget_limit": {
        const budget = await getBudget();
        const cat = budget.categories.find((c) => c.name === input.category);
        if (!cat) return `Unknown category '${input.category}'.`;
        cat.monthlyLimit = input.monthlyLimit;
        await saveBudget(budget);
        return input.monthlyLimit == null
          ? `Cleared the monthly limit for ${input.category}.`
          : `Set ${input.category} monthly limit to $${input.monthlyLimit}.`;
      }

      case "update_goal": {
        const goals = await getGoals();
        const nameLc = String(input.name).toLowerCase();
        const match = goals.goals.find(
          (g) => g.name.toLowerCase().includes(nameLc) || nameLc.includes(g.name.toLowerCase())
        );

        if (input.action === "create") {
          if (match) return `A goal named '${match.name}' already exists.`;
          const goal: Goal = {
            id: input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
            name: input.name,
            target: input.target,
            current: 0,
            deadline: input.deadline || "",
          };
          goals.goals.push(goal);
          await saveGoals(goals);
          return `Created goal '${goal.name}': $${goal.target}${goal.deadline ? ` by ${goal.deadline}` : ""}.`;
        }

        if (!match) return `No goal matching '${input.name}'. Current goals: ${goals.goals.map((g) => g.name).join(", ")}.`;

        if (input.action === "delete") {
          goals.goals = goals.goals.filter((g) => g.id !== match.id);
          await saveGoals(goals);
          return `Deleted goal '${match.name}'.`;
        }

        if (input.action === "contribute") {
          match.current = Number(Math.max(0, match.current + input.amount).toFixed(2));
          await saveGoals(goals);
          const pct = ((match.current / match.target) * 100).toFixed(1);
          return `'${match.name}' is now at $${match.current} of $${match.target} (${pct}%).`;
        }

        return `Unknown action '${input.action}'.`;
      }

      default:
        return `Unknown tool: ${name}`;
    }
  } catch (err) {
    return `Tool error: ${err instanceof Error ? err.message : String(err)}`;
  }
}

/** Build the full data + market context injected into every request. */
export async function buildContext(): Promise<string> {
  const [portfolio, budget, goals, settings] = await Promise.all([
    getPortfolio(),
    getBudget(),
    getGoals(),
    getSettings(),
  ]);

  const symbols = [
    ...portfolio.holdings.map((h) => h.yahooSymbol).filter((s): s is string => !!s),
    ...settings.indices.map((i) => i.symbol),
  ];

  let quotes: Record<string, unknown> = {};
  let usdCad = 1.37;
  try {
    [quotes, usdCad] = await Promise.all([getQuotes(symbols), getUsdCad()]);
  } catch {
    // Market data is best-effort; the agent still gets holdings/budget/goals.
  }

  // Only this month's expenses go into context; totals cover the rest.
  const month = new Date().toISOString().slice(0, 7);
  const monthExpenses = budget.expenses.filter((e) => e.date.startsWith(month));
  const totalsByCategory: Record<string, number> = {};
  for (const e of monthExpenses) {
    totalsByCategory[e.category] = (totalsByCategory[e.category] || 0) + e.amount;
  }

  return [
    `Current date: ${new Date().toISOString().slice(0, 10)}`,
    `USD/CAD rate: ${usdCad}`,
    `Alert threshold: ±${settings.moveAlertThresholdPct}% daily move`,
    ``,
    `PORTFOLIO (account ${portfolio.account.number}, ${portfolio.account.type} at ${portfolio.account.provider}):`,
    JSON.stringify(portfolio.holdings),
    ``,
    `LIVE MARKET DATA (5-min cache; keys are Yahoo symbols):`,
    JSON.stringify(quotes),
    ``,
    `BUDGET — categories and limits:`,
    JSON.stringify(budget.categories),
    `This month's (${month}) expenses:`,
    JSON.stringify(monthExpenses),
    `This month's totals by category:`,
    JSON.stringify(totalsByCategory),
    ``,
    `SAVINGS GOALS:`,
    JSON.stringify(goals.goals),
  ].join("\n");
}
