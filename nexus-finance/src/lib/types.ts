export interface Holding {
  ticker: string;
  name: string;
  shares: number;
  bookValue: number; // total cost basis in the holding's currency
  currency: "CAD" | "USD";
  yahooSymbol: string | null; // null = no public quote (private/unlisted)
  category: string;
}

export interface Portfolio {
  account: { type: string; provider: string; number: string };
  holdings: Holding[];
}

export interface BudgetCategory {
  name: string;
  monthlyLimit: number | null;
}

export interface Expense {
  id: string;
  date: string; // ISO date
  amount: number;
  category: string;
  note: string;
}

export interface Budget {
  categories: BudgetCategory[];
  expenses: Expense[];
}

export interface Goal {
  id: string;
  name: string;
  target: number;
  current: number;
  deadline: string; // ISO date
  note?: string;
}

export interface Goals {
  goals: Goal[];
}

export interface Settings {
  defaultCurrency: string;
  moveAlertThresholdPct: number;
  marketCacheTtlMs: number;
  indices: { symbol: string; label: string }[];
}

export interface Quote {
  symbol: string;
  price: number;
  previousClose: number;
  changePct: number; // day change %
  currency: string;
  name?: string;
  marketCap?: number;
  fiftyTwoWeekLow?: number;
  fiftyTwoWeekHigh?: number;
  trailingPE?: number;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
