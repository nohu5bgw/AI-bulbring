"""
RBC Visa PDF statement parser.
Extracts transactions, header fields, and summary totals from RBC PDF exports.
"""

import re
from dataclasses import dataclass, field
from typing import Optional
from pathlib import Path

try:
    import pdfplumber
except ImportError:
    pdfplumber = None


MONTH_ABBREVS = {
    "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
    "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
}

CATEGORY_RULES = [
    (["PETRO", "ESSO", " GAS ", "FUEL", "SHELL", "ULTRAMAR", "PIONEER", "HUSKY"], "Fuel & Motor Vehicle"),
    (["RESTAURANT", "SUSHI", "MACCOOLS", "DINING", "CAFE", "TIM HORTON", "MCDONALDS",
      "SUBWAY", "PIZZA", "BURGER", "STARBUCKS", "HARVEYS", "WENDY", "A&W", "BOSTON PIZZA",
      "SWISS CHALET", "EAST SIDE MARIO", "KELSEY", "JACK ASTOR", "BAR ", "GRILL",
      "KITCHEN", "BISTRO", "EATERY", "FOOD"], "Meals & Entertainment"),
    (["HOTEL", "MARRIOTT", "HILTON", "AIRBNB", "INN ", "SUITES", "RESORT", "HYATT",
      "SHERATON", "WESTIN", "HOLIDAY INN", "BEST WESTERN", "COMFORT INN"], "Accommodation"),
    (["AIRLINE", "AIR CANADA", "WESTJET", "PORTER", "UNITED", "DELTA", "AMERICAN",
      "LUFTHANSA", "BRITISH", "EMIRATES", "SWOOP", "SUNWING", "FLAIR"], "Travel - Airfare"),
    (["UBER", "LYFT", "TAXI", "TRANSIT", "GO TRAIN", "VIA RAIL", "BUS ", "PARKING",
      "PRESTO", "FARE"], "Travel - Ground"),
    (["SILVER & BLACK", "TICKET", "EVENT ", "CINEMA", "THEATRE", "THEATER", "CONCERT",
      "SPORTS", "MAPLE LEAF", "RAPTORS", "BLUEJAYS", "SENS "], "Entertainment"),
    (["ELLIOTT WAVE", "TRADING", "INVEST", "BLOOMBERG", "REUTERS", "ADVISORY",
      "CONSULT", "ACCOUNTING", "LEGAL", "LAWYER", "NOTARY"], "Professional Services"),
    (["PAYMENT", "PAIEMENT", "MERCI", "REMBOURSEMENT"], "Payment / Credit"),
    (["RAMAKKO", "HARDWARE", "SUPPLY", "SOURCE FOR", "HOME DEPOT", "CANADIAN TIRE",
      "RONA", "LOWES", "STAPLES", "OFFICE DEPOT", "BEST BUY", "COSTCO"], "Supplies & Equipment"),
    (["AMAZON", "SHOPIFY", "EBAY", "ETSY", "WALMART", "CANADIAN TIRE"], "Retail"),
    (["MICROSOFT", "GOOGLE", "APPLE", "ADOBE", "DROPBOX", "SLACK", "ZOOM",
      "GODADDY", "CLOUDFLARE", "AWS ", "AZURE", "NETFLIX", "SPOTIFY"], "Software & Subscriptions"),
    (["INSURANCE", "INTACT", "AVIVA", "RSA ", "DESJARDINS"], "Insurance"),
    (["TELUS", "ROGERS", "BELL ", "SHAW", "COGECO", "VIDEOTRON", "KOODO",
      "FIDO ", "VIRGIN MOBILE", "FREEDOM MOBILE"], "Telecommunications"),
]


def categorize(description: str) -> str:
    upper = description.upper()
    for keywords, category in CATEGORY_RULES:
        if any(kw in upper for kw in keywords):
            return category
    return "Uncategorized"


@dataclass
class Transaction:
    transaction_date: str = ""
    posting_date: str = ""
    description: str = ""
    raw_description: str = ""
    amount_cad: float = 0.0
    foreign_currency: str = ""
    foreign_amount: float = 0.0
    exchange_rate: float = 0.0
    cardholder: str = ""
    category: str = "Uncategorized"

    def to_dict(self):
        return {
            "transaction_date": self.transaction_date,
            "posting_date": self.posting_date,
            "description": self.description,
            "amount_cad": self.amount_cad,
            "foreign_currency": self.foreign_currency,
            "foreign_amount": self.foreign_amount,
            "exchange_rate": self.exchange_rate,
            "cardholder": self.cardholder,
            "category": self.category,
        }


@dataclass
class StatementData:
    client_name: str = ""
    statement_period: str = ""
    card_numbers: list = field(default_factory=list)
    previous_balance: float = 0.0
    payments_credits: float = 0.0
    purchases_debits: float = 0.0
    new_balance: float = 0.0
    transactions: list = field(default_factory=list)
    parse_warnings: list = field(default_factory=list)


def _parse_amount(token: str) -> Optional[float]:
    """Convert '$1,723.25' or '-$3,291.32' to float."""
    token = token.strip()
    negative = token.startswith("-")
    token = token.lstrip("-").lstrip("$").replace(",", "")
    try:
        val = float(token)
        return -val if negative else val
    except ValueError:
        return None


def _is_transaction_line(line: str) -> bool:
    """Lines starting with a 3-letter month abbreviation followed by a space and digits."""
    parts = line.strip().split()
    if len(parts) < 3:
        return False
    return parts[0].upper() in MONTH_ABBREVS and len(parts[0]) == 3


def _is_reference_line(line: str) -> bool:
    """Reference lines are long numeric strings (17+ digits)."""
    stripped = line.strip()
    return bool(re.match(r'^\d{17,}$', stripped))


def _is_foreign_currency_line(line: str) -> bool:
    return "Foreign Currency" in line or "foreign currency" in line.lower()


def _is_cardholder_header(line: str) -> bool:
    """Detects lines like: VEDRAN DUKIC   4516 07** **** 5574"""
    return bool(re.search(r'\d{4}\s+\d{2}\*\*\s+\*{4}\s+\d{4}', line))


def _extract_cardholder_name(line: str) -> str:
    """Extract just the name from 'NAME  4516 07** **** 5574'."""
    return re.sub(r'\s+\d{4}\s+\d{2}\*\*\s+\*{4}\s+\d{4}.*', '', line).strip()


def _extract_card_number(line: str) -> str:
    m = re.search(r'(\d{4}\s+\d{2}\*\*\s+\*{4}\s+\d{4})', line)
    return m.group(1).replace(" ", "") if m else ""


def _parse_transaction_line(line: str) -> Optional[Transaction]:
    """
    Parse a line like:
    NOV 17  NOV 19  SILVER & BLACK PREM 725-7802078 NV      $112.35
    """
    line = line.strip()
    parts = line.split()
    if len(parts) < 4:
        return None

    # Extract transaction date (parts[0] = month, parts[1] = day)
    if parts[0].upper() not in MONTH_ABBREVS:
        return None

    trans_date = f"{parts[0].upper()} {parts[1]}"
    idx = 2

    # Extract posting date
    if idx < len(parts) and parts[idx].upper() in MONTH_ABBREVS:
        post_date = f"{parts[idx].upper()} {parts[idx+1]}"
        idx += 2
    else:
        post_date = trans_date

    # Last token should be the amount
    amount_token = parts[-1]
    amount = _parse_amount(amount_token)
    if amount is None:
        return None

    # Description is everything between posting date and amount
    description_parts = parts[idx:-1]
    raw_description = " ".join(description_parts)

    # Clean reference codes from inline description (e.g. "725-7802078 NV" at end)
    description = re.sub(r'\s+\d{3}-\d{7,}\s+\w{2}$', '', raw_description).strip()
    description = re.sub(r'\s+\d{3}-\d{7,}$', '', description).strip()

    t = Transaction(
        transaction_date=trans_date,
        posting_date=post_date,
        description=description,
        raw_description=raw_description,
        amount_cad=amount,
    )
    t.category = categorize(description)
    return t


def _extract_summary_amount(text: str, label: str) -> Optional[float]:
    """Extract a dollar amount following a label in the text."""
    pattern = re.escape(label) + r'[^\n$]*\$?([\-]?[\d,]+\.\d{2})'
    m = re.search(pattern, text, re.IGNORECASE)
    if m:
        return _parse_amount(m.group(1))
    return None


def parse_pdf(file_path: str) -> StatementData:
    if pdfplumber is None:
        raise ImportError("pdfplumber is not installed. Run: pip install pdfplumber")

    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")

    data = StatementData()

    with pdfplumber.open(file_path) as pdf:
        full_text = "\n".join(
            page.extract_text() or "" for page in pdf.pages
        )

    lines = full_text.splitlines()

    # --- Extract header fields ---
    # Client name often appears as first all-caps multi-word line or near "Primary Cardholder"
    for line in lines:
        line_stripped = line.strip()
        if re.match(r'^[A-Z][A-Z\s]{10,}(?:CORP|INC|LTD|LLC|PROFESSIONAL CORP)?$', line_stripped):
            if not any(skip in line_stripped for skip in
                       ["RBC", "VISA", "STATEMENT", "ACCOUNT", "BALANCE", "PAYMENT",
                        "ACTIVITY", "CARDHOLDER", "PREVIOUS", "INTEREST", "MINIMUM"]):
                data.client_name = line_stripped
                break

    # Statement period
    period_match = re.search(
        r'(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+\d{1,2}\s+TO\s+'
        r'(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+\d{1,2},?\s+\d{4}',
        full_text, re.IGNORECASE
    )
    if period_match:
        data.statement_period = period_match.group(0).strip()

    # Card numbers
    for m in re.finditer(r'\d{4}\s+\d{2}\*\*\s+\*{4}\s+\d{4}', full_text):
        card = m.group(0).replace(" ", "")
        if card not in data.card_numbers:
            data.card_numbers.append(card)

    # Summary balances from "Calculating Your Balance" block
    data.previous_balance = _extract_summary_amount(full_text, "Previous balance") or 0.0
    data.payments_credits = _extract_summary_amount(full_text, "Payments and credits") or 0.0
    data.purchases_debits = _extract_summary_amount(full_text, "Purchases and debits") or 0.0
    data.new_balance = _extract_summary_amount(full_text, "New balance") or 0.0

    # --- Parse transactions ---
    current_cardholder = data.client_name
    i = 0
    while i < len(lines):
        line = lines[i]

        # Detect cardholder section header
        if _is_cardholder_header(line):
            current_cardholder = _extract_cardholder_name(line)
            i += 1
            continue

        # Skip subtotal / section markers
        if "SUBTOTAL OF MONTHLY ACTIVITY" in line.upper():
            i += 1
            continue

        # Detect transaction start
        if _is_transaction_line(line):
            t = _parse_transaction_line(line)
            if t:
                t.cardholder = current_cardholder

                # Peek ahead for reference line and optional foreign currency line
                j = i + 1
                if j < len(lines) and _is_reference_line(lines[j].strip()):
                    j += 1  # skip reference number line

                if j < len(lines) and _is_foreign_currency_line(lines[j]):
                    fc_line = lines[j]
                    # Foreign Currency - USD 77.96 Exchange rate - 1.441123
                    fc_match = re.search(
                        r'Foreign Currency\s*-\s*([A-Z]{3})\s+([\d.]+)', fc_line, re.IGNORECASE
                    )
                    rate_match = re.search(r'Exchange rate\s*-\s*([\d.]+)', fc_line, re.IGNORECASE)
                    if fc_match:
                        t.foreign_currency = fc_match.group(1).upper()
                        t.foreign_amount = float(fc_match.group(2))
                    if rate_match:
                        t.exchange_rate = float(rate_match.group(1))
                    j += 1

                i = j
                data.transactions.append(t)
                continue

        i += 1

    # Reconciliation warning
    if data.purchases_debits != 0:
        parsed_purchases = sum(t.amount_cad for t in data.transactions if t.amount_cad > 0)
        diff = abs(parsed_purchases - data.purchases_debits)
        if diff > 0.05:
            data.parse_warnings.append(
                f"Amount mismatch: parsed purchases ${parsed_purchases:,.2f} vs "
                f"statement ${data.purchases_debits:,.2f} (diff ${diff:,.2f})"
            )

    if not data.transactions:
        data.parse_warnings.append(
            "No transactions found — ensure this is an RBC Visa PDF statement."
        )

    return data


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python pdf_parser.py <statement.pdf>")
        sys.exit(1)

    result = parse_pdf(sys.argv[1])
    print(f"Client:   {result.client_name}")
    print(f"Period:   {result.statement_period}")
    print(f"Cards:    {', '.join(result.card_numbers)}")
    print(f"Prev Bal: ${result.previous_balance:,.2f}")
    print(f"Payments: ${result.payments_credits:,.2f}")
    print(f"Purchases:${result.purchases_debits:,.2f}")
    print(f"New Bal:  ${result.new_balance:,.2f}")
    print(f"\n{'─'*80}")
    print(f"{'Date':<10} {'Post':<10} {'Cardholder':<30} {'Amount':>12}  Description")
    print(f"{'─'*80}")
    for t in result.transactions:
        print(f"{t.transaction_date:<10} {t.posting_date:<10} {t.cardholder[:28]:<30} "
              f"${t.amount_cad:>10,.2f}  {t.description}")
    print(f"\nTotal transactions: {len(result.transactions)}")
    if result.parse_warnings:
        print("\nWARNINGS:")
        for w in result.parse_warnings:
            print(f"  ⚠️  {w}")
