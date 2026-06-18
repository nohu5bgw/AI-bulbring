"""
RBC Visa Excel export parser.
Handles RBC's direct .xlsx download format with dynamic column detection.
"""

import re
from pathlib import Path
from parser.pdf_parser import Transaction, StatementData, categorize, _parse_amount

try:
    import openpyxl
except ImportError:
    openpyxl = None


# RBC Excel column name variants
_COL_DATE = ["date", "transaction date", "trans date"]
_COL_DESC = ["description", "activity description", "details", "merchant"]
_COL_CAD = ["cad$", "cad", "amount (cad)", "amount", "debit", "credit"]
_COL_USD = ["usd$", "usd", "amount (usd)"]


def _match_col(header: str, candidates: list[str]) -> bool:
    h = header.strip().lower()
    return any(h == c or h.startswith(c) for c in candidates)


def parse_xlsx(file_path: str) -> StatementData:
    if openpyxl is None:
        raise ImportError("openpyxl is not installed. Run: pip install openpyxl")

    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")

    wb = openpyxl.load_workbook(file_path, data_only=True)
    ws = wb.active

    data = StatementData()
    rows = list(ws.iter_rows(values_only=True))

    if not rows:
        data.parse_warnings.append("Excel file appears to be empty.")
        return data

    # Find the header row (first row containing "date" or "description")
    header_row_idx = None
    col_map = {}

    for ri, row in enumerate(rows):
        headers = [str(c).strip() if c is not None else "" for c in row]
        if any(_match_col(h, _COL_DATE) for h in headers):
            header_row_idx = ri
            for ci, h in enumerate(headers):
                if not h:
                    continue
                if _match_col(h, _COL_DATE):
                    col_map["date"] = ci
                elif _match_col(h, _COL_DESC):
                    col_map["desc"] = ci
                elif _match_col(h, _COL_CAD):
                    col_map.setdefault("cad", ci)
                elif _match_col(h, _COL_USD):
                    col_map["usd"] = ci
            break

    if header_row_idx is None or "date" not in col_map:
        data.parse_warnings.append(
            "Could not find header row — ensure this is an RBC Excel export."
        )
        return data

    dates_seen = []
    for row in rows[header_row_idx + 1:]:
        if all(c is None for c in row):
            continue

        def cell(key):
            idx = col_map.get(key)
            return row[idx] if idx is not None and idx < len(row) else None

        raw_date = cell("date")
        raw_desc = cell("desc")
        raw_cad = cell("cad")

        if raw_date is None and raw_desc is None:
            continue

        # Detect summary rows (e.g. "Opening Balance", "Closing Balance")
        desc_str = str(raw_desc).strip() if raw_desc else ""
        if not desc_str or re.match(r'(opening|closing|previous|new)\s+balance', desc_str, re.I):
            # Try to extract balances
            if "previous" in desc_str.lower() or "opening" in desc_str.lower():
                amt = _parse_amount(str(raw_cad)) if raw_cad else None
                if amt is not None:
                    data.previous_balance = amt
            elif "new" in desc_str.lower() or "closing" in desc_str.lower():
                amt = _parse_amount(str(raw_cad)) if raw_cad else None
                if amt is not None:
                    data.new_balance = amt
            continue

        # Parse date
        if hasattr(raw_date, "strftime"):
            date_str = raw_date.strftime("%b %d").upper()
        else:
            date_str = str(raw_date).strip().upper()

        # Parse amount — RBC exports sometimes have debit/credit in separate columns
        amount = None
        if raw_cad is not None:
            amount = _parse_amount(str(raw_cad))

        if amount is None:
            continue

        dates_seen.append(date_str)

        t = Transaction(
            transaction_date=date_str,
            posting_date=date_str,
            description=desc_str,
            raw_description=desc_str,
            amount_cad=amount,
            cardholder=data.client_name or "Unknown",
        )
        t.category = categorize(desc_str)
        data.transactions.append(t)

    # Infer statement period from date range
    if dates_seen:
        data.statement_period = f"{dates_seen[0]} TO {dates_seen[-1]}"

    if not data.transactions:
        data.parse_warnings.append(
            "No transactions found — ensure this is an RBC Visa Excel export."
        )

    # Reconcile
    total_purchases = sum(t.amount_cad for t in data.transactions if t.amount_cad > 0)
    total_payments = sum(t.amount_cad for t in data.transactions if t.amount_cad < 0)
    data.purchases_debits = total_purchases
    data.payments_credits = total_payments

    return data
