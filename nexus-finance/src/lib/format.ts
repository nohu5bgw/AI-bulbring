export const fmtMoney = (n: number, currency = "CAD") =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);

export const fmtPct = (n: number, signed = true) =>
  `${signed && n > 0 ? "+" : ""}${n.toFixed(2)}%`;

export const pnlColor = (n: number) => (n > 0 ? "text-up" : n < 0 ? "text-down" : "text-muted");
