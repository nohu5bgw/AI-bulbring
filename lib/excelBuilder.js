const ExcelJS = require('exceljs');

// Column indices (1-based, matching the template exactly)
const C = {
  DATE: 1,         // A
  DESC: 2,         // B
  VISA: 3,         // C  — running balance
  // D=4 empty
  PMT: 5,          // E  — Payments
  // F=6 empty
  TOTAL: 7,        // G  — EXPENSE TOTAL(S)
  // H=8 empty
  PERSONAL: 9,     // I
  VEH_FUEL: 10,    // J
  VEH_REPAIR: 11,  // K
  VEH_LEASE: 12,   // L
  DUES_CPA: 13,    // M
  DUES_OTHER: 14,  // N
  ADV_GIFTS: 15,   // O
  ADV_CLIENT: 16,  // P
  ADV_MEALS: 17,   // Q
  STAFF_MEALS: 18, // R
  // S=19 empty
  TRAV_ACCOM: 20,  // T
  TRAV_MEALS: 21,  // U
  TRAV_GEN: 22,    // V
  OFF_SUPPLY: 23,  // W
  OFF_PHONE: 24,   // X
  PROF_ACCT: 25,   // Y
  PROF_LEGAL: 26,  // Z
  BANK_INT: 27,    // AA
  BANK_FEE: 28,    // AB
  OTHER: 29,       // AC
  NOTES: 30,       // AD
};

// Maps Claude's column_key → column number
const KEY_TO_COL = {
  personal:                C.PERSONAL,
  vehicle_fuel:            C.VEH_FUEL,
  vehicle_repairs:         C.VEH_REPAIR,
  vehicle_lease:           C.VEH_LEASE,
  dues_cpa:                C.DUES_CPA,
  dues_other:              C.DUES_OTHER,
  advertising_gifts:       C.ADV_GIFTS,
  advertising_client:      C.ADV_CLIENT,
  advertising_meals:       C.ADV_MEALS,
  staff_meals:             C.STAFF_MEALS,
  travel_accommodation:    C.TRAV_ACCOM,
  travel_meals:            C.TRAV_MEALS,
  travel_general:          C.TRAV_GEN,
  office_supplies:         C.OFF_SUPPLY,
  office_telephone:        C.OFF_PHONE,
  professional_accounting: C.PROF_ACCT,
  professional_legal:      C.PROF_LEGAL,
  bank_interest:           C.BANK_INT,
  bank_fee:                C.BANK_FEE,
  other:                   C.OTHER,
};

const TOTAL_COLS = 30; // A through AD

function col(n) {
  // 1→A, 27→AA, 28→AB, 29→AC, 30→AD
  if (n <= 26) return String.fromCharCode(64 + n);
  return String.fromCharCode(64 + Math.floor((n - 1) / 26)) + String.fromCharCode(65 + ((n - 1) % 26));
}

function cellRef(colNum, rowNum) {
  return `${col(colNum)}${rowNum}`;
}

const NAVY   = 'FF1B3A6B';
const YELLOW = 'FFFFFF00';
const WHITE  = 'FFFFFFFF';
const LIGHT_GREY = 'FFF2F2F2';

const CURRENCY_FMT = '$#,##0.00;($#,##0.00);"-"';
const DATE_FMT = 'yyyy-mm-dd';

function styleHeader(cell, opts = {}) {
  cell.font = { bold: opts.bold !== false, color: { argb: opts.fontColor || 'FF000000' }, size: opts.size || 10 };
  if (opts.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.fill } };
  cell.alignment = { horizontal: opts.align || 'center', vertical: 'middle', wrapText: true };
  if (opts.border) {
    cell.border = {
      top: { style: 'thin' }, left: { style: 'thin' },
      bottom: { style: 'thin' }, right: { style: 'thin' },
    };
  }
}

function formatEndDate(dateStr) {
  if (!dateStr) return 'DECEMBER 31, 2024';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase();
}

async function buildExcel(analysisResult) {
  const { transactions, period } = analysisResult;
  const openingBalance = period?.opening_balance || 0;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'CRA Agent';
  wb.created = new Date();

  const ws = wb.addWorksheet('Sheet1', { views: [{ state: 'frozen', ySplit: 5 }] });

  // ── Column widths ──────────────────────────────────────────────────────────
  ws.getColumn(C.DATE).width    = 13;
  ws.getColumn(C.DESC).width    = 30;
  ws.getColumn(C.VISA).width    = 13;
  ws.getColumn(4).width         = 2;   // D empty
  ws.getColumn(C.PMT).width     = 13;
  ws.getColumn(6).width         = 2;   // F empty
  ws.getColumn(C.TOTAL).width   = 13;
  ws.getColumn(8).width         = 2;   // H empty
  ws.getColumn(C.PERSONAL).width = 10;
  for (let c = C.VEH_FUEL; c <= C.OTHER; c++) ws.getColumn(c).width = 10;
  ws.getColumn(C.NOTES).width   = 25;

  // ── Row 1: Title ───────────────────────────────────────────────────────────
  ws.mergeCells(`A1:${col(TOTAL_COLS)}1`);
  const titleCell = ws.getCell('A1');
  titleCell.value = 'Bank Reconciliation Worksheet';
  styleHeader(titleCell, { bold: true, align: 'left', size: 12 });
  ws.getRow(1).height = 18;

  // ── Row 2: Summary totals (filled by formulas referencing data rows) ───────
  // We'll fill this after we know lastDataRow
  ws.getRow(2).height = 16;

  // ── Row 3: Date + BUSINESS EXPENSES label ─────────────────────────────────
  const dateCell = ws.getCell('A3');
  dateCell.value = formatEndDate(period?.end);
  styleHeader(dateCell, { bold: true, fill: YELLOW, align: 'left' });

  ws.mergeCells(`J3:${col(C.OTHER)}3`);
  const bizCell = ws.getCell('J3');
  bizCell.value = 'BUSINESS EXPENSES';
  styleHeader(bizCell, { bold: true, align: 'center' });
  ws.getRow(3).height = 16;

  // ── Row 4: Category group headers (merged) ─────────────────────────────────
  const row4Headers = [
    { start: C.VISA,       end: C.VISA,       label: 'CREDIT BAL', align: 'center' },
    { start: C.PMT,        end: C.PMT,        label: 'VISA',        align: 'center' },
    { start: C.TOTAL,      end: C.TOTAL,      label: 'EXPENSE',     align: 'center' },
    { start: C.PERSONAL,   end: C.PERSONAL,   label: 'PERSONAL',    bold: true },
    { start: C.VEH_FUEL,   end: C.VEH_LEASE,  label: 'Vehicle Expenses' },
    { start: C.DUES_CPA,   end: C.DUES_OTHER, label: 'Dues & Memberships' },
    { start: C.ADV_GIFTS,  end: C.ADV_MEALS,  label: 'Advertising' },
    { start: C.STAFF_MEALS,end: 19,           label: 'Staff' },
    { start: C.TRAV_ACCOM, end: C.TRAV_GEN,   label: 'Travel' },
    { start: C.OFF_SUPPLY, end: C.OFF_PHONE,  label: 'Office' },
    { start: C.PROF_ACCT,  end: C.PROF_LEGAL, label: 'Professional' },
    { start: C.BANK_INT,   end: C.BANK_FEE,   label: 'Bank Charges' },
  ];

  row4Headers.forEach(({ start, end, label, bold, align }) => {
    if (start !== end) {
      ws.mergeCells(`${col(start)}4:${col(end)}4`);
    }
    const cell = ws.getCell(`${col(start)}4`);
    cell.value = label;
    styleHeader(cell, { bold: bold !== false, align: align || 'center', border: true });
  });
  ws.getRow(4).height = 16;

  // ── Row 5: Sub-column headers ──────────────────────────────────────────────
  const row5 = [
    [C.DATE,        'Date'],
    [C.DESC,        'Description'],
    [C.VISA,        'VISA'],
    [C.PMT,         'Payments'],
    [C.TOTAL,       'TOTAL(S)'],
    [C.VEH_FUEL,    'Fuel'],
    [C.VEH_REPAIR,  'Repairs'],
    [C.VEH_LEASE,   'Lease'],
    [C.DUES_CPA,    'CPA'],
    [C.ADV_GIFTS,   'Gifts'],
    [C.ADV_CLIENT,  'Client'],
    [C.ADV_MEALS,   'Meals'],
    [C.STAFF_MEALS, 'Meals'],
    [C.TRAV_ACCOM,  'Accomodations'],
    [C.TRAV_MEALS,  'Meals'],
    [C.TRAV_GEN,    'General'],
    [C.OFF_SUPPLY,  'Supplies'],
    [C.OFF_PHONE,   'Telephone'],
    [C.PROF_ACCT,   'Accounting'],
    [C.PROF_LEGAL,  'Legal'],
    [C.BANK_INT,    'Interest'],
    [C.BANK_FEE,    'Fee'],
    [C.OTHER,       'Other'],
    [C.NOTES,       'Description'],
  ];

  row5.forEach(([colNum, label]) => {
    const cell = ws.getCell(`${col(colNum)}5`);
    cell.value = label;
    styleHeader(cell, { align: colNum <= 2 ? 'left' : 'center', border: true });
  });
  ws.getRow(5).height = 16;

  // ── Row 6: BEG BAL ─────────────────────────────────────────────────────────
  const begRow = ws.getRow(6);
  const begDateCell = ws.getCell('A6');
  begDateCell.value = 'BEG BAL';
  begDateCell.font = { bold: false };

  const begDescCell = ws.getCell('B6');
  begDescCell.value = 'Please record Credit Card balance ';

  const begVisaCell = ws.getCell('C6');
  begVisaCell.value = openingBalance;
  begVisaCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: YELLOW } };
  begVisaCell.numFmt = CURRENCY_FMT;
  begRow.height = 15;

  // ── Rows 7+: Transaction data ──────────────────────────────────────────────
  const DATA_START = 7;
  let currentRow = DATA_START;

  transactions.forEach((tx) => {
    const r = currentRow;
    const row = ws.getRow(r);

    // Date
    const dateCell = ws.getCell(cellRef(C.DATE, r));
    if (tx.date) {
      dateCell.value = new Date(tx.date + 'T00:00:00');
      dateCell.numFmt = DATE_FMT;
    } else {
      dateCell.value = tx.date || '';
    }

    // Description
    ws.getCell(cellRef(C.DESC, r)).value = tx.description || '';

    // Payments column (col E) — only for payment rows
    if (tx.is_payment) {
      ws.getCell(cellRef(C.PMT, r)).value = tx.amount;
      ws.getCell(cellRef(C.PMT, r)).numFmt = CURRENCY_FMT;
    } else {
      // Expense: put amount in the correct category column
      const destCol = KEY_TO_COL[tx.column_key];
      if (destCol) {
        ws.getCell(cellRef(destCol, r)).value = tx.amount;
        ws.getCell(cellRef(destCol, r)).numFmt = CURRENCY_FMT;
      } else {
        // Unknown key fallback → Other
        ws.getCell(cellRef(C.OTHER, r)).value = tx.amount;
        ws.getCell(cellRef(C.OTHER, r)).numFmt = CURRENCY_FMT;
      }
    }

    // Notes
    if (tx.notes) {
      ws.getCell(cellRef(C.NOTES, r)).value = tx.notes;
    }

    // EXPENSE TOTAL formula: sum of J through AC (business expense columns, not personal, not payments)
    const totalCell = ws.getCell(cellRef(C.TOTAL, r));
    totalCell.value = { formula: `SUM(${col(C.VEH_FUEL)}${r}:${col(C.OTHER)}${r})` };
    totalCell.numFmt = CURRENCY_FMT;

    // VISA running balance formula: prev_balance + expense_total + personal - payments
    const visaCell = ws.getCell(cellRef(C.VISA, r));
    visaCell.value = {
      formula: `${cellRef(C.VISA, r - 1)}+${cellRef(C.TOTAL, r)}+${cellRef(C.PERSONAL, r)}-${cellRef(C.PMT, r)}`,
    };
    visaCell.numFmt = CURRENCY_FMT;

    row.height = 15;
    currentRow++;
  });

  const lastDataRow = currentRow - 1;

  // ── Row 2: Summary totals ──────────────────────────────────────────────────
  const summaryRow = ws.getRow(2);
  const summaryA = ws.getCell('A2');
  summaryA.value = period?.bank || 'Visa';
  summaryA.font = { bold: true };

  // Total payments
  const pmtSummary = ws.getCell(cellRef(C.PMT, 2));
  pmtSummary.value = { formula: `SUM(${cellRef(C.PMT, DATA_START)}:${cellRef(C.PMT, lastDataRow)})` };
  pmtSummary.numFmt = CURRENCY_FMT;
  pmtSummary.font = { bold: true };

  // Totals for every expense column (I through AC)
  for (let c = C.PERSONAL; c <= C.OTHER; c++) {
    const cell = ws.getCell(cellRef(c, 2));
    cell.value = { formula: `SUM(${cellRef(c, DATA_START)}:${cellRef(c, lastDataRow)})` };
    cell.numFmt = CURRENCY_FMT;
  }
  summaryRow.height = 16;

  // ── Write buffer ───────────────────────────────────────────────────────────
  const buffer = await wb.xlsx.writeBuffer();
  return buffer;
}

module.exports = { buildExcel };
