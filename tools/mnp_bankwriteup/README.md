# MNP LLP — Bank Writeup Automation Tool

Internal tool for MNP accountants. Parses RBC Visa credit card statements (PDF or Excel)
and exports a fully formatted, MNP-branded bank writeup Excel file — no internet required.

---

## Installation (end users)

1. Download `MNP_BankWriteup` (Mac) or `MNP_BankWriteup.exe` (Windows) from the shared drive.
2. Double-click to launch — no Python installation required.

## Running from source (developers)

```bash
cd mnp_bankwriteup
pip install -r requirements.txt
python main.py
```

## Supported statement formats

| Format | Source |
|--------|--------|
| RBC Visa PDF statement | Download from RBC Online Banking → Statements |
| RBC Visa Excel export  | Download from RBC Online Banking → Account Activity → Export |

## How to use

1. Click **Browse PDF / XLSX** and select your RBC statement.
2. The app parses all transactions instantly and fills in:
   - Client name (editable if needed)
   - Statement period (read-only, from statement)
3. Review the transaction table. You can:
   - Edit any **Description** by clicking on it.
   - Change the **Category** using the dropdown.
   - Uncategorized items appear in orange — review these before export.
4. Click **Generate Writeup Excel** and choose a save location (defaults to Desktop).
5. Open the file — it contains two sheets:
   - **Bank Writeup** — full transaction detail with subtotals by cardholder
   - **Summary** — one-page overview by category

## Excel output columns

| Column | Description |
|--------|-------------|
| Trans Date | Date the transaction occurred |
| Post Date | Date it posted to the account |
| Cardholder | Primary or supplementary cardholder |
| Description | Merchant/transaction name |
| Category | CRA-style expense category |
| Foreign Curr. | Foreign currency code (e.g. USD), if applicable |
| Foreign Amt | Amount in foreign currency |
| Exch. Rate | Exchange rate used by RBC |
| Amount (CAD) | Final amount in Canadian dollars |

Payments appear in **green**. Uncategorized items appear in **orange** to flag for review.

## Warning messages

| Message | Action |
|---------|--------|
| ⚠ Amount mismatch | Parsed totals don't match statement totals — review manually |
| ⚠ No transactions found | Wrong file type or unsupported statement format |

## Building a distributable

```bash
python build.py
# Output: dist/MNP_BankWriteup (Mac) or dist/MNP_BankWriteup.exe (Windows)
```

## Phase 2 roadmap (not yet built)

- AI categorization via Claude API (replaces rule-based matching)
- Multi-bank support: TD, Scotia, BMO
- CaseWare integration via Power Automate
- Batch processing — multiple statements at once
- Audit trail log file

---

For issues, contact the tool maintainer or open a ticket in the internal helpdesk.
