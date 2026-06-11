const ExcelJS = require('exceljs');

const NAVY    = 'FF1B3A6B';
const WHITE   = 'FFFFFFFF';
const BLUE_BG = 'FFEBF2FB';
const STRIPE  = 'FFF8F9FA';
const CURRENCY = '$#,##0.00;($#,##0.00);"-"';

const ACCOUNTS = [
  { code: '1000', name: 'Cash & Bank',                             section: 'Assets',      normal: 'debit' },
  { code: '1100', name: 'Accounts Receivable',                     section: 'Assets',      normal: 'debit' },
  { code: '1200', name: 'Prepaid Expenses',                        section: 'Assets',      normal: 'debit' },
  { code: '1900', name: 'Other Assets',                            section: 'Assets',      normal: 'debit' },
  { code: '2000', name: 'Visa / Credit Card',                      section: 'Liabilities', normal: 'credit' },
  { code: '2100', name: 'Accounts Payable',                        section: 'Liabilities', normal: 'credit' },
  { code: '2200', name: 'HST / GST Payable',                       section: 'Liabilities', normal: 'credit' },
  { code: '2300', name: 'Loans Payable',                           section: 'Liabilities', normal: 'credit' },
  { code: '2900', name: 'Other Liabilities',                       section: 'Liabilities', normal: 'credit' },
  { code: '3000', name: "Owner's Equity / Capital",                section: 'Equity',      normal: 'credit' },
  { code: '3100', name: 'Retained Earnings',                       section: 'Equity',      normal: 'credit' },
  { code: '3200', name: "Owner's Drawings",                        section: 'Equity',      normal: 'debit' },
  { code: '4000', name: 'Business Income',                         section: 'Revenue',     normal: 'credit' },
  { code: '4100', name: 'Other Income',                            section: 'Revenue',     normal: 'credit' },
  { code: '6100', name: 'Vehicle Expenses — Fuel',                 section: 'Expenses',    normal: 'debit' },
  { code: '6110', name: 'Vehicle Expenses — Repairs & Maintenance',section: 'Expenses',    normal: 'debit' },
  { code: '6120', name: 'Vehicle Expenses — Lease',                section: 'Expenses',    normal: 'debit' },
  { code: '6200', name: 'Dues & Memberships — CPA',                section: 'Expenses',    normal: 'debit' },
  { code: '6210', name: 'Dues & Memberships — Other',              section: 'Expenses',    normal: 'debit' },
  { code: '6300', name: 'Advertising — Client Gifts',              section: 'Expenses',    normal: 'debit' },
  { code: '6310', name: 'Advertising — Client Entertainment',      section: 'Expenses',    normal: 'debit' },
  { code: '6320', name: 'Advertising — Meals & Promotion',         section: 'Expenses',    normal: 'debit' },
  { code: '6400', name: 'Staff Meals',                             section: 'Expenses',    normal: 'debit' },
  { code: '6500', name: 'Travel — Accommodation',                  section: 'Expenses',    normal: 'debit' },
  { code: '6510', name: 'Travel — Meals',                          section: 'Expenses',    normal: 'debit' },
  { code: '6520', name: 'Travel — General',                        section: 'Expenses',    normal: 'debit' },
  { code: '6600', name: 'Office Expenses — Supplies',              section: 'Expenses',    normal: 'debit' },
  { code: '6610', name: 'Office Expenses — Telephone & Internet',  section: 'Expenses',    normal: 'debit' },
  { code: '6700', name: 'Professional Fees — Accounting',          section: 'Expenses',    normal: 'debit' },
  { code: '6710', name: 'Professional Fees — Legal',               section: 'Expenses',    normal: 'debit' },
  { code: '6800', name: 'Bank Charges — Interest',                 section: 'Expenses',    normal: 'debit' },
  { code: '6810', name: 'Bank Charges — Fees',                     section: 'Expenses',    normal: 'debit' },
  { code: '6900', name: 'Other Business Expenses',                 section: 'Expenses',    normal: 'debit' },
];

function formatDate(d) {
  if (!d) return '';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });
}

function dataRow(ws, r, code, name, debit, credit, stripe) {
  const bg = stripe ? STRIPE : WHITE;
  ws.getRow(r).height = 15;

  const setC = (col, val, extra = {}) => {
    const c = ws.getCell(r, col);
    c.value = val;
    c.font = { size: 10, ...extra.font };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
    c.alignment = extra.align || { horizontal: 'left', vertical: 'middle' };
    if (extra.numFmt) c.numFmt = extra.numFmt;
  };

  setC(1, code, { font: { size: 9, color: { argb: 'FF718096' } }, align: { horizontal: 'center', vertical: 'middle' } });
  setC(2, name);
  setC(3, debit  || null, { numFmt: CURRENCY, align: { horizontal: 'right', vertical: 'middle' } });
  setC(4, credit || null, { numFmt: CURRENCY, align: { horizontal: 'right', vertical: 'middle' } });
  setC(5, (debit || 0) - (credit || 0) || null, { numFmt: CURRENCY, align: { horizontal: 'right', vertical: 'middle' } });
}

async function buildTrialBalanceReport(data) {
  const { businessName, periodStart, periodEnd, balances = {} } = data;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Bulbring AI';
  wb.created = new Date();

  const ws = wb.addWorksheet('Trial Balance', { views: [{ state: 'frozen', ySplit: 5 }] });

  ws.getColumn(1).width = 12;
  ws.getColumn(2).width = 46;
  ws.getColumn(3).width = 17;
  ws.getColumn(4).width = 17;
  ws.getColumn(5).width = 17;

  // Title
  ws.mergeCells('A1:E1');
  const t1 = ws.getCell('A1');
  t1.value = businessName ? `${businessName} — Trial Balance` : 'Trial Balance';
  t1.font = { bold: true, size: 14, color: { argb: WHITE } };
  t1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  t1.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  ws.getRow(1).height = 26;

  ws.mergeCells('A2:E2');
  const t2 = ws.getCell('A2');
  const period = [formatDate(periodStart), formatDate(periodEnd)].filter(Boolean).join(' — ');
  t2.value = period || 'Period';
  t2.font = { size: 10, italic: true, color: { argb: 'FFCFE2F3' } };
  t2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  t2.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  ws.getRow(2).height = 16;

  ws.getRow(3).height = 8;

  // Headers
  ['Account', 'Account Name', 'Debit', 'Credit', 'Balance'].forEach((h, i) => {
    const c = ws.getCell(4, i + 1);
    c.value = h;
    c.font = { bold: true, size: 10, color: { argb: NAVY } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE_BG } };
    c.alignment = { horizontal: i >= 2 ? 'right' : 'left', vertical: 'middle' };
    c.border = { bottom: { style: 'medium', color: { argb: NAVY } } };
  });
  ws.getRow(4).height = 18;

  let r = 5;
  let stripe = false;
  let totalDebit = 0;
  let totalCredit = 0;
  let currentSection = null;

  for (const acc of ACCOUNTS) {
    const raw = parseFloat(balances[acc.code]) || 0;
    if (raw === 0) continue;

    // Section header
    if (acc.section !== currentSection) {
      currentSection = acc.section;
      ws.getRow(r).height = 14;
      ws.mergeCells(`A${r}:E${r}`);
      const sc = ws.getCell(r, 1);
      sc.value = currentSection.toUpperCase();
      sc.font = { bold: true, size: 9, color: { argb: NAVY } };
      sc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE_BG } };
      sc.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
      r++;
      stripe = false;
    }

    // Positive amount → normal side, negative → opposite side
    const isNormalDebit = acc.normal === 'debit';
    const debit  = raw > 0 ? (isNormalDebit ? raw : 0) : (!isNormalDebit ? Math.abs(raw) : 0);
    const credit = raw > 0 ? (!isNormalDebit ? raw : 0) : (isNormalDebit ? Math.abs(raw) : 0);

    dataRow(ws, r, acc.code, acc.name, debit || null, credit || null, stripe);
    totalDebit  += debit;
    totalCredit += credit;
    r++;
    stripe = !stripe;
  }

  // Totals
  r++;
  ws.getRow(r).height = 20;
  [[1, ''], [2, 'TOTAL'], [3, totalDebit], [4, totalCredit], [5, totalDebit - totalCredit]].forEach(([col, val]) => {
    const c = ws.getCell(r, col);
    c.value = val || null;
    c.font = { bold: true, size: 10 };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE_BG } };
    c.border = { top: { style: 'medium', color: { argb: NAVY } } };
    if (col >= 3) { c.numFmt = CURRENCY; c.alignment = { horizontal: 'right', vertical: 'middle' }; }
    else { c.alignment = { horizontal: col === 2 ? 'left' : 'center', vertical: 'middle', indent: col === 2 ? 1 : 0 }; }
  });

  // Balance check note
  r += 2;
  ws.mergeCells(`A${r}:E${r}`);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01;
  const checkCell = ws.getCell(r, 1);
  checkCell.value = balanced ? '✓ Trial balance is balanced.' : `⚠ Out of balance by $${Math.abs(totalDebit - totalCredit).toFixed(2)}`;
  checkCell.font = { size: 10, italic: true, color: { argb: balanced ? 'FF047857' : 'FFC53030' } };
  checkCell.alignment = { horizontal: 'right' };

  return await wb.xlsx.writeBuffer();
}

module.exports = { buildTrialBalanceReport, ACCOUNTS };
