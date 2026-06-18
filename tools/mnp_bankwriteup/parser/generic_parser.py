"""
Generic bank statement parser — works with any bank's PDF or XLSX export.

Strategy:
  PDF  → extract text with pdfplumber, then apply flexible regex heuristics to
          find transaction lines (date + description + amount).
  XLSX → scan for a header row, map columns by name/type heuristics, extract rows.

The output is always a list of Transaction objects + StatementData metadata.
"""

import re
import os
from dataclasses import dataclass, field
from typing import Optional
from pathlib import Path
from datetime import datetime

try:
    import pdfplumber
except ImportError:
    pdfplumber = None

try:
    import openpyxl
except ImportError:
    openpyxl = None


# ── Category rules (bank-agnostic) ───────────────────────────────────────────

CATEGORY_RULES = [
    (["PETRO", "ESSO", " GAS ", "FUEL", "SHELL", "ULTRAMAR", "PIONEER", "HUSKY",
      "CHEVRON", "SUNOCO", "MOBIL", "BP ", "TEXACO", "CITGO", "CIRCLE K",
      "COUCHE-TARD", "ALIMENTATION"], "Fuel & Motor Vehicle"),
    (["RESTAURANT", "SUSHI", "DINING", "CAFE", "COFFEE", "TIM HORTON", "MCDONALDS",
      "SUBWAY", "PIZZA", "BURGER", "STARBUCKS", "HARVEYS", "WENDY", "A&W",
      "BOSTON PIZZA", "SWISS CHALET", "EAST SIDE MARIO", "JACK ASTOR", "BAR ",
      "GRILL", "KITCHEN", "BISTRO", "EATERY", "FOOD", "MACCOOLS", "BOULANGERIE",
      "PATISSERIE", "RESTO", "BRASSERIE", "TAPROOM", "BREWPUB", "PUB ",
      "WING", "NOODLE", "RAMEN", "POKE", "TACO", "BURRITO", "DINER", "DELI",
      "BAKERY", "BAGEL", "DONUT", "PASTRY", "ICE CREAM", "GELATO", "SMOOTHIE",
      "JUICE BAR", "CREPERIE", "CHURRASCO"], "Meals & Entertainment"),
    (["HOTEL", "MARRIOTT", "HILTON", "AIRBNB", "INN ", "SUITES", "RESORT",
      "HYATT", "SHERATON", "WESTIN", "HOLIDAY INN", "BEST WESTERN",
      "COMFORT INN", "DAYS INN", "SUPER 8", "FAIRMONT", "FOUR SEASONS",
      "INTERCONTINENTAL", "NOVOTEL", "IBIS ", "MOTEL", "BED AND BREAKFAST",
      "VRBO", "EXPEDIA", "HOTELS.COM", "BOOKING.COM", "TRAVELODGE"], "Accommodation"),
    (["AIRLINE", "AIR CANADA", "WESTJET", "PORTER", "UNITED AIRLINE", "DELTA",
      "AMERICAN AIRLINE", "LUFTHANSA", "BRITISH AIRWAYS", "EMIRATES", "SWOOP",
      "SUNWING", "FLAIR", "RYANAIR", "EASYJET", "AIR TRANSAT", "SUNCLASS",
      "AEROMEXICO", "KLMAIRLINES", "AIRFRANCE", "TURKISH AIRLINES",
      "FLIGHTCENTRE", "CHEAPOAIR", "KIWI.COM", "GOOGLE FLIGHTS"], "Travel - Airfare"),
    (["UBER", "LYFT", "TAXI", "TRANSIT", "GO TRAIN", "VIA RAIL", "BUS ",
      "PARKING", "PRESTO", "OCTROI", "OCTRANSPO", "TTC ", "STM ", "AUTOBUS",
      "METRO ", "SUBWAY ", "TRAIN ", "FERRY", "ZIPCAR", "CAR2GO", "ENTERPRISE",
      "BUDGET CAR", "HERTZ", "AVIS ", "NATIONAL CAR", "ALAMO", "DOLLAR CAR",
      "EV CHARGING", "CHARGEPOINT", "TESLA SUPERCHARGER"], "Travel - Ground"),
    (["SILVER & BLACK", "TICKET", "EVENT ", "CINEMA", "THEATRE", "THEATER",
      "CONCERT", "SPORTS", "MAPLE LEAF", "RAPTORS", "BLUEJAYS", "SENATORS",
      "CANADIENS", "FLAMES", "OILERS", "CANUCKS", "JETS ", "LEAFS",
      "GOLF", "BOWLING", "PAINTBALL", "ESCAPE ROOM", "LASER TAG", "ARCADE",
      "SPA ", "MASSAGE", "WELLNESS", "GYM ", "FITNESS", "YOGA", "PILATES",
      "CROSSFIT", "GOODLIFE", "ANYTIME FITNESS", "CURVES ", "PLANET FITNESS",
      "NETFLIX", "DISNEY+", "AMAZON PRIME", "CRAVE", "APPLE TV", "HULU",
      "SPOTIFY", "APPLE MUSIC", "TIDAL ", "DEEZER", "YOUTUBE PREMIUM"], "Entertainment"),
    (["CONSULT", "ACCOUNTING", "LEGAL", "LAWYER", "NOTARY", "ADVISORY",
      "ELLIOTT WAVE", "TRADING", "INVEST", "BLOOMBERG", "REUTERS",
      "COACH ", "MENTOR", "TRAINING", "WORKSHOP", "SEMINAR", "CONFERENCE",
      "FREELANCE", "CONTRACTOR", "STAFFING", "RECRUITMENT", "HEADHUNTER",
      "FIVERR", "UPWORK", "TOPTAL", "99DESIGNS"], "Professional Services"),
    (["PAYMENT", "PAIEMENT", "MERCI", "REMBOURSEMENT", "CREDIT APPLIED",
      "AUTOPAY", "AUTO PAY", "ONLINE PAYMENT", "INTERNET PAYMENT",
      "BALANCE TRANSFER", "TRANSFER FROM", "RETURNED PAYMENT"], "Payment / Credit"),
    (["RAMAKKO", "HARDWARE", "HOME DEPOT", "CANADIAN TIRE", "RONA ", "LOWES",
      "HOME HARDWARE", "PRINCESS AUTO", "TOOL", "SUPPLY", "SOURCE FOR",
      "FASTENAL", "GRAINGER", "ULINE ", "STAPLES", "OFFICE DEPOT",
      "BEST BUY", "COSTCO", "IKEA ", "WAYFAIR", "STRUCTUBE", "ARTICLE ",
      "LEON\'S", "THE BRICK", "SLEEP COUNTRY", "RESTORATION HARDWARE"], "Supplies & Equipment"),
    (["AMAZON", "EBAY ", "ETSY ", "WALMART", "TARGET ", "ZARA ", "H&M ",
      "UNIQLO", "GAP ", "OLD NAVY", "BANANA REPUBLIC", "LULULEMON",
      "ROOTS ", "SPORTCHEK", "RUNNING ROOM", "FOOT LOCKER", "CHAMPS",
      "WINNERS", "HOMESENSE", "MARSHALLS", "THE BAY", "SEARS", "JD SPORTS",
      "INDIGO", "CHAPTERS", "BOOKSTORE", "PHARMACY", "SHOPPERS", "REXALL",
      "JEAN COUTU", "PHARMAPRIX", "LONDON DRUGS", "METRO GROCERY", "LOBLAWS",
      "SOBEYS", "SAFEWAY", "FOODLAND", "FRESHCO", "FARM BOY", "WHOLE FOODS",
      "TRADER JOE"], "Retail"),
    (["MICROSOFT", "GOOGLE ", "APPLE.COM", "ADOBE ", "DROPBOX", "SLACK ",
      "ZOOM ", "GODADDY", "CLOUDFLARE", "AWS ", "AZURE", "SALESFORCE",
      "HUBSPOT", "MAILCHIMP", "SHOPIFY", "SQUARESPACE", "WIX ", "NOTION ",
      "MONDAY.COM", "ASANA ", "JIRA ", "GITHUB ", "GITLAB ", "ATLASSIAN",
      "CANVA ", "FIGMA ", "WEBFLOW", "STRIPE ", "PAYPAL ", "SQUARE "], "Software & Subscriptions"),
    (["INSURANCE", "INTACT", "AVIVA", "RSA ", "DESJARDINS", "CO-OPERATORS",
      "ECONOMICAL", "BELAIR", "PEMBRIDGE", "WAWANESA", "ALLSTATE",
      "STATE FARM", "MANULIFE", "SUNLIFE", "GREAT-WEST", "EMPIRE LIFE",
      "BLUE CROSS", "GREEN SHIELD"], "Insurance"),
    (["TELUS", "ROGERS", "BELL ", "SHAW ", "COGECO", "VIDEOTRON", "KOODO",
      "FIDO ", "VIRGIN MOBILE", "FREEDOM MOBILE", "PUBLIC MOBILE", "LUCKY",
      "CHATR", "FIZZ ", "DISTRIBUTEL", "TEKSAVVY", "VMEDIA", "OXIO "], "Telecommunications"),
    (["TUITION", "UNIVERSITY", "COLLEGE", "SCHOOL", "EDUCATION",
      "UDEMY", "COURSERA", "LINKEDIN LEARNING", "SKILLSHARE", "PLURALSIGHT",
      "TEXTBOOK", "PEARSON", "MCGRAW", "CENGAGE"], "Education & Training"),
    (["GOVERNMENT", "CANADA REVENUE", "CRA ", "SERVICE CANADA", "MINISTRY",
      "MUNICIPAL", "LICENCE", "LICENSE FEE", "PERMIT", "REGISTRATION",
      "LAND TRANSFER", "PROPERTY TAX"], "Government & Fees"),
]


def categorize(description: str) -> str:
    upper = description.upper()
    for keywords, category in CATEGORY_RULES:
        if any(kw in upper for kw in keywords):
            return category
    return "Uncategorized"


# ── Data model ────────────────────────────────────────────────────────────────

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
    source_file: str = ""      # filename this came from

    def to_dict(self):
        return {k: v for k, v in self.__dict__.items()}


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
    source_file: str = ""


# ── Amount helpers ────────────────────────────────────────────────────────────

_AMOUNT_RE = re.compile(
    r'^([+\-]?)\s*\$?\s*([\d]{1,3}(?:[,\s]?\d{3})*(?:\.\d{1,2})?)\s*(CR|DB|DR)?$',
    re.IGNORECASE,
)


def _parse_amount(token: str) -> Optional[float]:
    token = str(token).strip().replace('\xa0', '').replace(' ', '')
    if not token or token in ('-', '+', '$'):
        return None
    neg = token.startswith('-') or token.upper().endswith('CR')
    token = token.lstrip('+-').lstrip('$').rstrip('CRcr').rstrip('DBdb').rstrip('DRdr')
    token = token.replace(',', '')
    try:
        val = float(token)
        return -val if neg else val
    except ValueError:
        return None


# ── Date helpers ──────────────────────────────────────────────────────────────

MONTH_ABBREVS = {
    "JAN": 1, "FEB": 2, "MAR": 3, "APR": 4, "MAY": 5, "JUN": 6,
    "JUL": 7, "AUG": 8, "SEP": 9, "OCT": 10, "NOV": 11, "DEC": 12,
}

_DATE_PATTERNS = [
    # MMM DD or MMM D (e.g. "NOV 17", "DEC 4")
    re.compile(r'^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(\d{1,2})$', re.I),
    # MM/DD/YYYY or MM/DD/YY
    re.compile(r'^(\d{1,2})/(\d{1,2})/(\d{2,4})$'),
    # YYYY-MM-DD
    re.compile(r'^(\d{4})-(\d{1,2})-(\d{1,2})$'),
    # DD-MM-YYYY or DD-MON-YYYY
    re.compile(r'^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$'),
    # DD-MMM-YYYY or DD MMM YYYY
    re.compile(r'^(\d{1,2})[-\s](JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[-\s](\d{2,4})$', re.I),
    # Month DD, YYYY (written out, first 3 chars match)
    re.compile(r'^(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s*(\d{4})?$', re.I),
]

_MONTH_NAMES = {
    "january": 1, "february": 2, "march": 3, "april": 4,
    "may": 5, "june": 6, "july": 7, "august": 8,
    "september": 9, "october": 10, "november": 11, "december": 12,
}


def _normalize_date(raw: str) -> Optional[str]:
    """Return a normalised date string like 'NOV 17' or 'MM/DD/YYYY', or None."""
    raw = str(raw).strip()
    if not raw:
        return None

    # Already "MMM DD" form
    m = _DATE_PATTERNS[0].match(raw.upper())
    if m:
        return raw.upper()

    # MM/DD/YYYY
    m = _DATE_PATTERNS[1].match(raw)
    if m:
        month, day, year = m.groups()
        mo = int(month)
        month_abbr = [k for k, v in MONTH_ABBREVS.items() if v == mo]
        if month_abbr:
            return f"{month_abbr[0]} {int(day):02d}"
        return raw

    # YYYY-MM-DD (ISO)
    m = _DATE_PATTERNS[2].match(raw)
    if m:
        year, month, day = m.groups()
        mo = int(month)
        month_abbr = [k for k, v in MONTH_ABBREVS.items() if v == mo]
        if month_abbr:
            return f"{month_abbr[0]} {int(day):02d}"
        return raw

    # Full month name
    m = _DATE_PATTERNS[5].match(raw)
    if m:
        month_name, day = m.group(1).lower(), m.group(2)
        mo = _MONTH_NAMES.get(month_name)
        if mo:
            abbr = [k for k, v in MONTH_ABBREVS.items() if v == mo][0]
            return f"{abbr} {int(day):02d}"

    # datetime object
    if hasattr(raw, 'strftime'):
        return raw.strftime("%b %d").upper()

    return raw  # Return as-is if we can't parse


def _starts_with_date(line: str) -> Optional[str]:
    """If line starts with a recognisable date token, return it; else None."""
    parts = line.strip().split()
    if not parts:
        return None

    # "MMM DD" style (2 tokens)
    if len(parts) >= 2 and parts[0].upper() in MONTH_ABBREVS:
        if re.match(r'^\d{1,2}$', parts[1]):
            return f"{parts[0].upper()} {parts[1]}"

    # Numeric date as first token: MM/DD/YYYY, YYYY-MM-DD, DD-MM-YYYY
    if re.match(r'^\d{1,4}[/\-]\d{1,2}([/\-]\d{2,4})?$', parts[0]):
        return parts[0]

    return None


# ── PDF parser ────────────────────────────────────────────────────────────────

_REFERENCE_RE = re.compile(r'^\d{15,}$')
_FOREIGN_RE   = re.compile(
    r'foreign\s+currency\s*[-–]?\s*([A-Z]{3})\s+([\d.]+).*?exchange\s+rate\s*[-–]?\s*([\d.]+)',
    re.IGNORECASE
)
_AMOUNT_TAIL  = re.compile(r'(-?\$?[\d,]+\.\d{2})\s*$')


def _parse_pdf_transaction(line: str) -> Optional[Transaction]:
    """
    Parse a transaction line. The amount is always the last whitespace-delimited
    token that looks like a dollar amount.
    """
    line = line.strip()
    date_token = _starts_with_date(line)
    if not date_token:
        return None

    # Amount is the last token that matches a money pattern
    m = _AMOUNT_TAIL.search(line)
    if not m:
        return None
    amount = _parse_amount(m.group(1))
    if amount is None:
        return None

    # Remove date and amount from line to get description
    remainder = line[len(date_token):].strip()
    remainder = remainder[:m.start()].strip()

    # Check for a secondary date token (posting date) at the start of remainder
    parts = remainder.split()
    posting_date = date_token
    if len(parts) >= 2 and parts[0].upper() in MONTH_ABBREVS and re.match(r'^\d{1,2}$', parts[1]):
        posting_date = f"{parts[0].upper()} {parts[1]}"
        remainder = " ".join(parts[2:])

    # Strip inline reference codes (e.g. "725-7802078 NV" at end)
    description = re.sub(r'\s+\d{3,4}-\d{6,}\s+\w{2,3}$', '', remainder).strip()
    description = re.sub(r'\s+\d{3,4}-\d{6,}$', '', description).strip()

    t = Transaction(
        transaction_date=date_token,
        posting_date=posting_date,
        description=description,
        raw_description=remainder,
        amount_cad=amount,
    )
    t.category = categorize(description)
    return t


def parse_pdf(file_path: str, label: str = "") -> StatementData:
    if pdfplumber is None:
        raise ImportError("pdfplumber not installed — run: pip install pdfplumber")

    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")

    data = StatementData(source_file=label or path.name)

    with pdfplumber.open(file_path) as pdf:
        full_text = "\n".join(page.extract_text() or "" for page in pdf.pages)

    lines = full_text.splitlines()

    # ── Heuristic header extraction ──────────────────────────────────────────

    # Client name: first all-caps line that looks like a company/person name
    for line in lines[:40]:
        s = line.strip()
        if (re.match(r'^[A-Z][A-Z\s\.&\-\']{8,}$', s) and
                not any(skip in s for skip in [
                    "STATEMENT", "ACCOUNT", "BALANCE", "PAYMENT", "ACTIVITY",
                    "CARDHOLDER", "PREVIOUS", "INTEREST", "MINIMUM", "PAGE",
                    "VISA", "MASTERCARD", "AMEX", "DEBIT", "CREDIT", "BANK",
                    "FINANCIAL", "SERVICES", "ROYAL", "TORONTO", "SCOTIABANK",
                    "NATIONAL", "CANADIAN", "IMPERIAL",
                ])):
            data.client_name = s
            break

    # Statement period — any "MMM DD TO MMM DD" or "MMM DD – MMM DD, YYYY"
    period_m = re.search(
        r'(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+\d{1,2}'
        r'[\s,]+(?:TO|THROUGH|[-–])\s*'
        r'(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+\d{1,2},?\s*\d{0,4}',
        full_text, re.IGNORECASE
    )
    if period_m:
        data.statement_period = period_m.group(0).strip()

    # Card numbers (masked or partial)
    for m in re.finditer(r'\d{4}[\s\-]?\d{2,4}\*+[\s\-]?\*+[\s\-]?\d{4}', full_text):
        card = re.sub(r'[\s\-]', '', m.group(0))
        if card not in data.card_numbers:
            data.card_numbers.append(card)

    # Balance fields — generic label matching
    _balance_map = [
        (["previous balance", "opening balance", "balance forward"], "previous_balance"),
        (["payments and credits", "payments & credits", "total payments", "credits"], "payments_credits"),
        (["purchases and debits", "purchases & debits", "total purchases", "debits"], "purchases_debits"),
        (["new balance", "closing balance", "balance owing", "amount owing"], "new_balance"),
    ]
    for labels, attr in _balance_map:
        for lbl in labels:
            m = re.search(
                re.escape(lbl) + r'[^\n$\d]*\$?\s*([\-]?[\d,]+\.\d{2})',
                full_text, re.IGNORECASE
            )
            if m:
                val = _parse_amount(m.group(1))
                if val is not None:
                    setattr(data, attr, val)
                break

    # ── Transaction parsing ───────────────────────────────────────────────────

    current_cardholder = data.client_name or "Primary Cardholder"
    i = 0

    # Detect cardholder section markers: a line that contains a masked card number
    _cardholder_re = re.compile(r'\d{4}[\s\-]?\d{2}\*+[\s\-]?\*+[\s\-]?\d{4}')

    while i < len(lines):
        line = lines[i]

        # Cardholder header
        if _cardholder_re.search(line):
            name = _cardholder_re.sub('', line).strip().rstrip('-').strip()
            if name:
                current_cardholder = name
            i += 1
            continue

        # Skip section markers
        if any(skip in line.upper() for skip in [
            "SUBTOTAL", "TOTAL ACTIVITY", "OPENING BALANCE", "CLOSING BALANCE",
            "MONTHLY ACTIVITY", "FORWARD BALANCE",
        ]):
            i += 1
            continue

        t = _parse_pdf_transaction(line)
        if t:
            t.cardholder = current_cardholder
            t.source_file = data.source_file

            # Peek for reference line + optional FX line
            j = i + 1
            if j < len(lines) and _REFERENCE_RE.match(lines[j].strip()):
                j += 1
            if j < len(lines):
                fx_m = _FOREIGN_RE.search(lines[j])
                if fx_m:
                    t.foreign_currency = fx_m.group(1).upper()
                    t.foreign_amount   = float(fx_m.group(2))
                    t.exchange_rate    = float(fx_m.group(3))
                    j += 1

            i = j
            data.transactions.append(t)
            continue

        i += 1

    # ── Reconciliation warning ────────────────────────────────────────────────
    if data.purchases_debits:
        parsed = sum(t.amount_cad for t in data.transactions if t.amount_cad > 0)
        diff = abs(parsed - data.purchases_debits)
        if diff > 1.00:
            data.parse_warnings.append(
                f"Amount mismatch: parsed ${parsed:,.2f} vs statement ${data.purchases_debits:,.2f}"
            )

    if not data.transactions:
        data.parse_warnings.append(
            "No transactions found — verify this is a supported bank statement PDF."
        )

    return data


# ── XLSX parser ───────────────────────────────────────────────────────────────

_COL_DATE  = ["date", "transaction date", "trans date", "trans. date", "posting date",
              "post date", "value date", "effective date"]
_COL_DESC  = ["description", "activity description", "details", "merchant",
              "transaction description", "narration", "particulars", "memo"]
_COL_AMT   = ["amount", "cad$", "cad", "debit/credit", "net amount", "transaction amount",
              "amount (cad)", "amount cad", "amount ($)"]
_COL_DEBIT = ["debit", "withdrawals", "withdrawal", "charges"]
_COL_CREDIT= ["credit", "deposits", "deposit", "payments"]


def _col_match(header: str, candidates: list) -> bool:
    h = str(header).strip().lower()
    return any(h == c or h.startswith(c) for c in candidates)


def parse_xlsx(file_path: str, label: str = "") -> StatementData:
    if openpyxl is None:
        raise ImportError("openpyxl not installed — run: pip install openpyxl")

    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")

    data = StatementData(source_file=label or path.name)
    wb = openpyxl.load_workbook(file_path, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))

    if not rows:
        data.parse_warnings.append("Excel file is empty.")
        return data

    # Find header row
    header_idx = None
    col_map = {}

    for ri, row in enumerate(rows[:30]):  # header must be in first 30 rows
        headers = [str(c).strip() if c is not None else "" for c in row]
        if any(_col_match(h, _COL_DATE) for h in headers):
            header_idx = ri
            for ci, h in enumerate(headers):
                if not h:
                    continue
                if _col_match(h, _COL_DATE) and "date" not in col_map:
                    col_map["date"] = ci
                elif _col_match(h, _COL_DESC) and "desc" not in col_map:
                    col_map["desc"] = ci
                elif _col_match(h, _COL_AMT) and "amt" not in col_map:
                    col_map["amt"] = ci
                elif _col_match(h, _COL_DEBIT) and "debit" not in col_map:
                    col_map["debit"] = ci
                elif _col_match(h, _COL_CREDIT) and "credit" not in col_map:
                    col_map["credit"] = ci
            break

    if header_idx is None:
        # Fallback: try to auto-detect by sniffing cell types
        data.parse_warnings.append(
            "Could not find a standard header row — attempting column auto-detection."
        )
        return _parse_xlsx_no_header(rows, data)

    if "date" not in col_map:
        data.parse_warnings.append("Could not find a date column.")
        return data

    # Collect statement period from date range
    first_date = last_date = None

    for row in rows[header_idx + 1:]:
        if all(c is None for c in row):
            continue

        def cell(key):
            idx = col_map.get(key)
            return row[idx] if idx is not None and idx < len(row) else None

        raw_date = cell("date")
        raw_desc = cell("desc")

        if raw_date is None:
            continue

        desc_str = str(raw_desc).strip() if raw_desc is not None else ""

        # Skip obvious summary rows
        if re.match(r'(opening|closing|previous|new|total|balance|subtotal)',
                    desc_str, re.I):
            continue

        # Parse date
        if hasattr(raw_date, 'strftime'):
            date_str = raw_date.strftime("%b %d").upper()
        else:
            date_str = _normalize_date(str(raw_date)) or str(raw_date)

        # Amount: try single column first, then debit/credit split
        amount = None
        if "amt" in col_map:
            amount = _parse_amount(str(cell("amt") or ""))
        if amount is None:
            debit  = _parse_amount(str(cell("debit")  or "")) if "debit"  in col_map else None
            credit = _parse_amount(str(cell("credit") or "")) if "credit" in col_map else None
            if debit is not None and debit != 0:
                amount = debit   # debit = positive charge
            elif credit is not None and credit != 0:
                amount = -abs(credit)  # credit = negative (payment)

        if amount is None:
            continue

        if not first_date:
            first_date = date_str
        last_date = date_str

        t = Transaction(
            transaction_date=date_str,
            posting_date=date_str,
            description=desc_str,
            raw_description=desc_str,
            amount_cad=amount,
            cardholder=data.client_name or "Primary Cardholder",
            source_file=data.source_file,
        )
        t.category = categorize(desc_str)
        data.transactions.append(t)

    if first_date and last_date:
        data.statement_period = f"{first_date} TO {last_date}"

    if not data.transactions:
        data.parse_warnings.append(
            "No transactions found — verify this is a supported bank statement Excel file."
        )

    data.purchases_debits = sum(t.amount_cad for t in data.transactions if t.amount_cad > 0)
    data.payments_credits = sum(t.amount_cad for t in data.transactions if t.amount_cad < 0)
    return data


def _parse_xlsx_no_header(rows: list, data: StatementData) -> StatementData:
    """
    Last-resort XLSX parser: scan each row for a date-like + amount-like pattern.
    """
    for row in rows:
        cells = [c for c in row if c is not None]
        if len(cells) < 2:
            continue

        date_val = None
        desc_val = ""
        amount_val = None

        for c in cells:
            s = str(c).strip()
            if date_val is None and _normalize_date(s) != s:
                date_val = _normalize_date(s)
            elif amount_val is None and _parse_amount(s) is not None:
                amount_val = _parse_amount(s)
            elif isinstance(c, str) and len(c) > 4:
                desc_val = c

        if date_val and amount_val is not None and desc_val:
            t = Transaction(
                transaction_date=date_val,
                posting_date=date_val,
                description=desc_val,
                raw_description=desc_val,
                amount_cad=amount_val,
                cardholder=data.client_name or "Primary Cardholder",
                source_file=data.source_file,
            )
            t.category = categorize(desc_val)
            data.transactions.append(t)

    return data


# ── Unified entry point ───────────────────────────────────────────────────────

def parse_file(file_path: str, label: str = "") -> StatementData:
    """Parse any supported statement file (PDF or XLSX/XLS)."""
    ext = Path(file_path).suffix.lower()
    if ext == ".pdf":
        return parse_pdf(file_path, label)
    elif ext in (".xlsx", ".xls"):
        return parse_xlsx(file_path, label)
    else:
        raise ValueError(f"Unsupported file type: {ext} — use PDF or XLSX")


# ── CLI test ──────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python generic_parser.py <statement.pdf|.xlsx>")
        sys.exit(1)
    result = parse_file(sys.argv[1])
    print(f"Client:     {result.client_name}")
    print(f"Period:     {result.statement_period}")
    print(f"Source:     {result.source_file}")
    print(f"Prev Bal:  ${result.previous_balance:,.2f}")
    print(f"New Bal:   ${result.new_balance:,.2f}")
    print(f"\n{'─'*90}")
    print(f"{'Date':<12} {'Cardholder':<25} {'Amount':>12}  {'Category':<24} Description")
    print(f"{'─'*90}")
    for t in result.transactions:
        print(f"{t.transaction_date:<12} {t.cardholder[:23]:<25} "
              f"${t.amount_cad:>10,.2f}  {t.category:<24} {t.description[:40]}")
    print(f"\nTotal: {len(result.transactions)} transactions")
    for w in result.parse_warnings:
        print(f"  ⚠  {w}")
