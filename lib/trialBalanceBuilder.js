const ExcelJS = require('exceljs');

const NAVY     = 'FF1B3A6B';
const WHITE    = 'FFFFFFFF';
const BLUE_BG  = 'FFEBF2FB';
const STRIPE   = 'FFF8F9FA';
const CURRENCY = '$#,##0.00;($#,##0.00);"-"';

const ACCOUNTS = [
  { code: '6100', name: 'Vehicle Expenses — Fuel',                  key: 'vehicle_fuel' },
  { code: '6110', name: 'Vehicle Expenses — Repairs & Maintenance',  key: 'vehicle_repairs' },
  { code: '6120', name: 'Vehicle Expenses — Lease',                  key: 'vehicle_lease' },
  { code: '6200', name: 'Dues & Memberships — CPA',                  key: 'dues_cpa' },
  { code: '6210', name: 'Dues & Memberships — Other',                key: 'dues_other' },
  { code: '6300', name: 'Advertising — Client Gifts',                key: 'advertising_gifts' },
  { code: '6310', name: 'Advertising — Client Entertainment',        key: 'advertising_client' },
  { code: '6320', name: 'Advertising — Meals & Promotion',           key: 'advertising_meals' },
  { code: '6400', name: 'Staff Meals',                               key: 'staff_meals' },
  { code: '6500', name: 'Travel — Accommodation',                    key: 'travel_accommodation' },
  { code: '6510', name: 'Travel — Meals',                            key: 'travel_meals' },
  { code: '6520', name: 'Travel — General',                          key: 'travel_general' },
  { code: '6600', name: 'Office Expenses — Supplies',                key: 'office_supplies' },
  { code: '6610', name: 'Office Expenses — Telephone & Internet',    key: 'office_telephone' },
  { code: '6700', name: 'Professional Fees — Accounting',            key: 'professional_accounting' },
  { code: '6710', name: 'Professional Fees — Legal',                 key: 'professional_legal' },
  { code: '6800', name: 'Bank Charges — Interest',                   key: 'bank_interest' },
  { code: '6810', name: 'Bank Charges — Fees',                       key: 'bank_fee' },
  { code: '6900', name: 'Other Business Expenses',                   key: 'other' },
];

function formatPeriod(period) {
  const fmt = d => {
    if (!d) return '';
    return new Date(d + 'T00:00:00').toLocaleDateString('en-CA', {
      year: 'numeric', month: 'long', day: 'numeric',
    });
  };
  if (period?.start && period?.end) return `${fmt(period.start)} — ${fmt(period.end)}`;
  return fmt(period?.end || period?.start) || '';
}

function dataRow(ws, row, code, name, debit, credit, stripe) {
  ws.getRow(row).height = 15;
  const bg = stripe ? STRIPE : WHITE;

  const set = (col, val, extra = {}) => {
    const c = ws.getCell(row, col);
    c.value = val;
    c.font = { size: 10, ...extra.font };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
    c.alignment = extra.align || { horizontal: 'left', vertical: 'middle' };
    if (extra.numFmt) c.numFmt = extra.numFmt;
  };

  set(1, code,   { font: { size: 10, color: { argb: 'FF718096' } }, align: { horizontal: 'center', vertical: 'middle' } });
  set(2, name);
  set(3, debit  || null, { numFmt: CURRENCY, align: { horizontal: 'right', vertical: 'middle' } });
  set(4, credit || null, { numFmt: CURRENCY, align: { horizontal: 'right', vertical: 'middle' } });

  const bal = (debit || 0) - (credit || 0);
  set(5, bal || null, { numFmt: CURRENCY, align: { horizontal: 'right', vertical: 'middle' } });
}

async function buildTrialBalance(analysisResult) {
  const { transactions, period } = analysisResult;

  const totals = {};
  let totalPayments = 0;

  for (const tx of transactions) {
    if (tx.is_payment) {
      totalPayments += tx.amount || 0;
    } else {
      const k = tx.column_key || 'other';
      totals[k] = (totals[k] || 0) + (tx.amount || 0);
    }
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Bulbring AI';
  wb.created = new Date();

  const ws = wb.addWorksheet('Trial Balance', { views: [{ state: 'frozen', ySplit: 5 }] });

  ws.getColumn(1).width = 14;
  ws.getColumn(2).width = 46;
  ws.getColumn(3).width = 17;
  ws.getColumn(4).width = 17;
  ws.getColumn(5).width = 17;

  // Row 1 — title banner
  ws.mergeCells('A1:E1');
  const title = ws.getCell('A1');
  title.value = 'TRIAL BALANCE';
  title.font = { bold: true, size: 14, color: { argb: WHITE } };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  title.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  ws.getRow(1).height = 26;

  // Row 2 — period / bank
  ws.mergeCells('A2:E2');
  const sub = ws.getCell('A2');
  const periodStr = formatPeriod(period);
  sub.value = [period?.bank || 'Visa', periodStr].filter(Boolean).join('  ·  ');
  sub.font = { size: 10, italic: true, color: { argb: 'FFCFE2F3' } };
  sub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  sub.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  ws.getRow(2).height = 16;

  // Row 3 — spacer
  ws.getRow(3).height = 8;

  // Row 4 — column headers
  const HEADERS = ['Account', 'Account Name', 'Debit', 'Credit', 'Balance'];
  HEADERS.forEach((h, i) => {
    const c = ws.getCell(4, i + 1);
    c.value = h;
    c.font = { bold: true, size: 10, color: { argb: NAVY } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE_BG } };
    c.alignment = { horizontal: i >= 2 ? 'right' : 'left', vertical: 'middle' };
    c.border = { bottom: { style: 'medium', color: { argb: NAVY } } };
  });
  ws.getRow(4).height = 18;

  // Data rows
  let r = 5;
  let stripe = false;

  if (totalPayments > 0) {
    dataRow(ws, r++, '2000', 'Visa — Payments Received', 0, totalPayments, stripe);
    stripe = !stripe;
  }

  let totalDebit = 0;
  for (const acc of ACCOUNTS) {
    const amt = totals[acc.key] || 0;
    if (amt > 0) {
      dataRow(ws, r++, acc.code, acc.name, amt, 0, stripe);
      totalDebit += amt;
      stripe = !stripe;
    }
  }

  // Totals row
  ws.getRow(r).height = 18;
  [[1, ''], [2, 'TOTAL'], [3, totalDebit], [4, totalPayments], [5, totalDebit - totalPayments]].forEach(([col, val]) => {
    const c = ws.getCell(r, col);
    c.value = val || null;
    c.font = { bold: true, size: 10 };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE_BG } };
    c.border = { top: { style: 'medium', color: { argb: NAVY } } };
    if (col >= 3) {
      c.numFmt = CURRENCY;
      c.alignment = { horizontal: 'right', vertical: 'middle' };
    } else {
      c.alignment = { horizontal: col === 2 ? 'left' : 'center', vertical: 'middle', indent: col === 2 ? 1 : 0 };
    }
  });

  const buffer = await wb.xlsx.writeBuffer();
  return buffer;
}

module.exports = { buildTrialBalance };
