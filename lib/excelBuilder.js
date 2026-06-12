const ExcelJS = require('exceljs');

// Column indices (1-based)
const C = {
  DATE: 1,         // A
  DESC: 2,         // B
  FLAG: 3,         // C  — REVIEW flag
  VISA: 4,         // D  — running balance
  // E=5 empty
  PMT: 6,          // F  — Payments
  // G=7 empty
  TOTAL: 8,        // H  — EXPENSE TOTAL
  // I=9 empty
  PERSONAL: 10,    // J
  VEH_FUEL: 11,    // K
  VEH_REPAIR: 12,  // L
  VEH_LEASE: 13,   // M
  DUES_CPA: 14,    // N
  DUES_OTHER: 15,  // O
  ADV_GIFTS: 16,   // P
  ADV_CLIENT: 17,  // Q
  ADV_MEALS: 18,   // R
  STAFF_MEALS: 19, // S
  // T=20 empty
  TRAV_ACCOM: 21,  // U
  TRAV_MEALS: 22,  // V
  TRAV_GEN: 23,    // W
  OFF_SUPPLY: 24,  // X
  OFF_PHONE: 25,   // Y
  PROF_ACCT: 26,   // Z
  PROF_LEGAL: 27,  // AA
  BANK_INT: 28,    // AB
  BANK_FEE: 29,    // AC
  OTHER: 30,       // AD
  NOTES: 31,       // AE
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

const TOTAL_COLS = 31; // A through AE

function col(n) {
  // 1→A, 27→AA, 28→AB, 29→AC, 30→AD
  if (n <= 26) return String.fromCharCode(64 + n);
  return String.fromCharCode(64 + Math.floor((n - 1) / 26)) + String.fromCharCode(65 + ((n - 1) % 26));
}

function cellRef(colNum, rowNum) {
  return `${col(colNum)}${rowNum}`;
}

const NAVY        = 'FF1B3A6B';
const NAVY_LIGHT  = 'FF2D5A9E';
const YELLOW      = 'FFFFFF00';
const WHITE       = 'FFFFFFFF';
const HDR_BLUE    = 'FFD6E4F2';  // light blue for sub-headers
const STRIPE_ODD  = 'FFF5F8FC';  // very subtle blue-gray stripe
const REVIEW_BG   = 'FFFFF0F0';  // light pink for needs-review rows
const RED         = 'FFC0392B';  // red for flag text

const CURRENCY_FMT = '$#,##0.00;($#,##0.00);"-"';
const DATE_FMT     = 'yyyy-mm-dd';

function formatPeriodLabel(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' });
}

async function buildExcel(analysisResult) {
  const { transactions, period } = analysisResult;
  const openingBalance = period?.opening_balance || 0;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Bulbring AI';
  wb.created = new Date();

  const ws = wb.addWorksheet('Transactions', { views: [{ state: 'frozen', ySplit: 5 }] });

  // ── Column widths ──────────────────────────────────────────────────────────
  ws.getColumn(C.DATE).width     = 13;
  ws.getColumn(C.DESC).width     = 34;
  ws.getColumn(C.FLAG).width     = 8;    // narrow flag column
  ws.getColumn(C.VISA).width     = 13;
  ws.getColumn(5).width          = 1.2;  // spacer
  ws.getColumn(C.PMT).width      = 13;
  ws.getColumn(7).width          = 1.2;  // spacer
  ws.getColumn(C.TOTAL).width    = 13;
  ws.getColumn(9).width          = 1.2;  // spacer
  ws.getColumn(C.PERSONAL).width = 11;
  for (let c = C.VEH_FUEL; c <= C.OTHER; c++) ws.getColumn(c).width = 11;
  ws.getColumn(C.NOTES).width    = 28;

  // ── Row 1: Navy title banner ───────────────────────────────────────────────
  ws.mergeCells(`A1:${col(TOTAL_COLS)}1`);
  const bankName   = period?.bank || 'Visa';
  const startLabel = formatPeriodLabel(period?.start);
  const endLabel   = formatPeriodLabel(period?.end);
  const periodPart = startLabel && endLabel ? `${startLabel} — ${endLabel}` : (endLabel || '');
  const t1 = ws.getCell('A1');
  t1.value     = ['Bank Statement — CRA T2125 Reconciliation', bankName, periodPart].filter(Boolean).join('   ·   ');
  t1.font      = { bold: true, size: 12, color: { argb: WHITE } };
  t1.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  t1.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  ws.getRow(1).height = 24;

  // ── Row 2: Summary totals (formulas added after lastDataRow known) ─────────
  ws.getRow(2).height = 17;

  // ── Row 3: Group-section label bar ────────────────────────────────────────
  // FLAG column — blank in row 3 but styled to match
  const flagR3 = ws.getCell(`${col(C.FLAG)}3`);
  flagR3.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: HDR_BLUE } };
  flagR3.border = { bottom: { style: 'thin', color: { argb: NAVY } } };

  // Left anchor: balance/payment/total labels
  [[C.VISA, 'RUNNING BAL.'], [C.PMT, 'PAYMENTS'], [C.TOTAL, 'BUS. TOTAL']].forEach(([colNum, lbl]) => {
    const c = ws.getCell(`${col(colNum)}3`);
    c.value     = lbl;
    c.font      = { bold: true, size: 9, color: { argb: NAVY } };
    c.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: HDR_BLUE } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    c.border    = { bottom: { style: 'thin', color: { argb: NAVY } } };
  });

  // Right: group banners
  const grps3 = [
    { start: C.PERSONAL,    end: C.PERSONAL,    label: 'PERSONAL',          fill: 'FFF5E6D3' },
    { start: C.VEH_FUEL,    end: C.VEH_LEASE,   label: 'Vehicle Expenses',  fill: NAVY },
    { start: C.DUES_CPA,    end: C.DUES_OTHER,  label: 'Dues & Memberships',fill: NAVY },
    { start: C.ADV_GIFTS,   end: C.ADV_MEALS,   label: 'Advertising',       fill: NAVY },
    { start: C.STAFF_MEALS, end: C.STAFF_MEALS, label: 'Staff',             fill: NAVY },
    { start: C.TRAV_ACCOM,  end: C.TRAV_GEN,    label: 'Travel',            fill: NAVY },
    { start: C.OFF_SUPPLY,  end: C.OFF_PHONE,   label: 'Office',            fill: NAVY },
    { start: C.PROF_ACCT,   end: C.PROF_LEGAL,  label: 'Professional Fees', fill: NAVY },
    { start: C.BANK_INT,    end: C.BANK_FEE,    label: 'Bank Charges',      fill: NAVY },
  ];

  grps3.forEach(({ start, end, label, fill }) => {
    if (start !== end) ws.mergeCells(`${col(start)}3:${col(end)}3`);
    const c = ws.getCell(`${col(start)}3`);
    c.value     = label;
    c.font      = { bold: true, size: 9, color: { argb: fill === NAVY ? WHITE : NAVY } };
    c.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    c.border    = {
      left:   { style: 'thin', color: { argb: WHITE } },
      right:  { style: 'thin', color: { argb: WHITE } },
      bottom: { style: 'thin', color: { argb: fill === NAVY ? WHITE : NAVY } },
    };
  });
  ws.getRow(3).height = 16;

  // ── Row 4: Sub-column headers ──────────────────────────────────────────────
  const subHeaders = [
    [C.DATE,        'Date',               'left'],
    [C.DESC,        'Description',        'left'],
    [C.FLAG,        '',                   'center'],
    [C.VISA,        'Running Balance',    'right'],
    [C.PMT,         'Payments',           'right'],
    [C.TOTAL,       'Bus. Total',         'right'],
    [C.PERSONAL,    'Personal',           'right'],
    [C.VEH_FUEL,    'Fuel',               'right'],
    [C.VEH_REPAIR,  'Repairs',            'right'],
    [C.VEH_LEASE,   'Lease',              'right'],
    [C.DUES_CPA,    'CPA Dues',           'right'],
    [C.DUES_OTHER,  'Other Dues',         'right'],
    [C.ADV_GIFTS,   'Gifts',              'right'],
    [C.ADV_CLIENT,  'Client Ent.',        'right'],
    [C.ADV_MEALS,   'Meals & Promo',      'right'],
    [C.STAFF_MEALS, 'Staff Meals',        'right'],
    [C.TRAV_ACCOM,  'Accommodation',      'right'],
    [C.TRAV_MEALS,  'Travel Meals',       'right'],
    [C.TRAV_GEN,    'General Travel',     'right'],
    [C.OFF_SUPPLY,  'Supplies',           'right'],
    [C.OFF_PHONE,   'Phone & Internet',   'right'],
    [C.PROF_ACCT,   'Accounting',         'right'],
    [C.PROF_LEGAL,  'Legal',              'right'],
    [C.BANK_INT,    'Interest',           'right'],
    [C.BANK_FEE,    'Fees',               'right'],
    [C.OTHER,       'Other',              'right'],
    [C.NOTES,       'Notes',              'left'],
  ];

  subHeaders.forEach(([colNum, label, align]) => {
    const c = ws.getCell(`${col(colNum)}4`);
    c.value     = label;
    c.font      = { bold: true, size: 9, color: { argb: NAVY } };
    c.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: HDR_BLUE } };
    c.alignment = { horizontal: align, vertical: 'middle', wrapText: false };
    c.border    = {
      top:    { style: 'thin',   color: { argb: NAVY } },
      bottom: { style: 'medium', color: { argb: NAVY } },
    };
  });
  ws.getRow(4).height = 16;

  // ── Row 5: Opening balance ─────────────────────────────────────────────────
  ws.getCell('A5').value     = 'BEG BAL';
  ws.getCell('A5').font      = { bold: true, size: 10, color: { argb: NAVY } };
  ws.getCell('A5').alignment = { horizontal: 'left', vertical: 'middle' };

  ws.getCell('B5').value     = 'Enter opening credit card balance';
  ws.getCell('B5').font      = { italic: true, size: 10, color: { argb: 'FF888888' } };
  ws.getCell('B5').alignment = { horizontal: 'left', vertical: 'middle' };

  const begVisa = ws.getCell(cellRef(C.VISA, 5));
  begVisa.value     = openingBalance;
  begVisa.numFmt    = CURRENCY_FMT;
  begVisa.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: YELLOW } };
  begVisa.font      = { bold: true, size: 10, color: { argb: NAVY } };
  begVisa.alignment = { horizontal: 'right', vertical: 'middle' };
  ws.getRow(5).height = 15;

  // ── Rows 6+: Transaction data ──────────────────────────────────────────────
  const DATA_START = 6;
  let currentRow   = DATA_START;

  transactions.forEach((tx, idx) => {
    const r          = currentRow;
    const flagged    = !!tx.needs_review;
    const bgArgb     = flagged ? REVIEW_BG : (idx % 2 === 1 ? STRIPE_ODD : WHITE);
    const fill       = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgArgb } };

    const money = (colNum, val, extraFont = {}) => {
      const c = ws.getCell(cellRef(colNum, r));
      c.value     = val;
      c.numFmt    = CURRENCY_FMT;
      c.fill      = fill;
      c.font      = { size: 10, ...extraFont };
      c.alignment = { horizontal: 'right', vertical: 'middle' };
    };

    // Date
    const dc = ws.getCell(cellRef(C.DATE, r));
    if (tx.date) { dc.value = new Date(tx.date + 'T00:00:00'); dc.numFmt = DATE_FMT; }
    else           dc.value = tx.date || '';
    dc.fill      = fill;
    dc.font      = { size: 10 };
    dc.alignment = { horizontal: 'left', vertical: 'middle' };

    // Description
    const dc2 = ws.getCell(cellRef(C.DESC, r));
    dc2.value     = tx.description || '';
    dc2.fill      = fill;
    dc2.font      = { size: 10 };
    dc2.alignment = { horizontal: 'left', vertical: 'middle' };

    // FLAG cell — "REVIEW" in red when needs_review, blank otherwise
    const fc = ws.getCell(cellRef(C.FLAG, r));
    fc.fill      = fill;
    fc.alignment = { horizontal: 'center', vertical: 'middle' };
    if (flagged) {
      fc.value = 'REVIEW';
      fc.font  = { bold: true, size: 8, color: { argb: RED } };
    }

    // Amount → correct column
    if (tx.is_payment) {
      money(C.PMT, tx.amount, { bold: true, color: { argb: 'FF2E7D32' } });
    } else {
      const destCol = KEY_TO_COL[tx.column_key] || C.OTHER;
      money(destCol, tx.amount);
    }

    // Notes — plain categorization note only
    if (tx.notes) {
      const nc = ws.getCell(cellRef(C.NOTES, r));
      nc.value     = tx.notes;
      nc.fill      = fill;
      nc.font      = { size: 9, italic: true, color: { argb: 'FF555555' } };
      nc.alignment = { horizontal: 'left', vertical: 'middle' };
    }

    // Business expense total (excludes personal)
    const tc = ws.getCell(cellRef(C.TOTAL, r));
    tc.value     = { formula: `SUM(${col(C.VEH_FUEL)}${r}:${col(C.OTHER)}${r})` };
    tc.numFmt    = CURRENCY_FMT;
    tc.fill      = fill;
    tc.font      = { bold: true, size: 10, color: { argb: NAVY } };
    tc.alignment = { horizontal: 'right', vertical: 'middle' };

    // Running VISA balance (includes personal charges, subtracts payments)
    const vc = ws.getCell(cellRef(C.VISA, r));
    vc.value     = { formula: `${cellRef(C.VISA, r - 1)}+${cellRef(C.TOTAL, r)}+${cellRef(C.PERSONAL, r)}-${cellRef(C.PMT, r)}` };
    vc.numFmt    = CURRENCY_FMT;
    vc.fill      = fill;
    vc.font      = { size: 10 };
    vc.alignment = { horizontal: 'right', vertical: 'middle' };

    ws.getRow(r).height = 15;
    currentRow++;
  });

  const lastDataRow = currentRow - 1;

  // ── Row 2: Summary totals ──────────────────────────────────────────────────
  const s2fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0FA' } };
  const s2border = { top: { style: 'thin', color: { argb: NAVY } }, bottom: { style: 'thin', color: { argb: NAVY } } };

  ws.getCell('A2').value     = [bankName, periodPart].filter(Boolean).join('  ·  ');
  ws.getCell('A2').font      = { bold: true, size: 10, color: { argb: NAVY } };
  ws.getCell('A2').alignment = { horizontal: 'left', vertical: 'middle' };
  ws.getCell('A2').fill      = s2fill;

  const addSummaryCol = (colNum, extraFont = {}) => {
    const c = ws.getCell(cellRef(colNum, 2));
    c.value     = { formula: `SUM(${cellRef(colNum, DATA_START)}:${cellRef(colNum, lastDataRow)})` };
    c.numFmt    = CURRENCY_FMT;
    c.fill      = s2fill;
    c.font      = { bold: true, size: 10, ...extraFont };
    c.border    = s2border;
    c.alignment = { horizontal: 'right', vertical: 'middle' };
  };

  addSummaryCol(C.PMT,   { color: { argb: 'FF2E7D32' } });
  addSummaryCol(C.TOTAL, { color: { argb: NAVY } });
  for (let c = C.PERSONAL; c <= C.OTHER; c++) addSummaryCol(c);

  ws.getRow(2).height = 17;

  const buffer = await wb.xlsx.writeBuffer();
  return buffer;
}

module.exports = { buildExcel };
