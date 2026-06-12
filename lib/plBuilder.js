const ExcelJS = require('exceljs');

const NAVY    = 'FF1B3A6B';
const WHITE   = 'FFFFFFFF';
const BLUE_BG = 'FFEBF2FB';
const STRIPE  = 'FFF8F9FA';
const GREEN   = 'FF047857';
const RED_C   = 'FFC53030';
const MUTED   = 'FF718096';
const CURRENCY = '$#,##0.00;($#,##0.00);"-"';

const safe = v => (typeof v === 'string' && /^[=+\-@]/.test(v)) ? ' ' + v : (v ?? '');

function fmt(d) {
  if (!d) return '';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });
}

const EXPENSE_GROUPS = [
  {
    label: 'Vehicle Expenses',
    items: [
      { key: 'vehicle_fuel',    label: 'Fuel' },
      { key: 'vehicle_repairs', label: 'Repairs & Maintenance' },
      { key: 'vehicle_lease',   label: 'Lease / Loan Payments' },
    ],
  },
  {
    label: 'Dues & Memberships',
    items: [
      { key: 'dues_cpa',   label: 'CPA Dues' },
      { key: 'dues_other', label: 'Other Memberships' },
    ],
  },
  {
    label: 'Advertising & Promotion',
    items: [
      { key: 'advertising_gifts',  label: 'Client Gifts' },
      { key: 'advertising_client', label: 'Client Entertainment' },
      { key: 'advertising_meals',  label: 'Meals & Promotion' },
      { key: 'staff_meals',        label: 'Staff Meals' },
    ],
  },
  {
    label: 'Travel',
    items: [
      { key: 'travel_accommodation', label: 'Accommodation' },
      { key: 'travel_meals',         label: 'Travel Meals' },
      { key: 'travel_general',       label: 'General Travel' },
    ],
  },
  {
    label: 'Office Expenses',
    items: [
      { key: 'office_supplies', label: 'Supplies' },
      { key: 'office_phone',    label: 'Telephone & Internet' },
    ],
  },
  {
    label: 'Professional Fees',
    items: [
      { key: 'professional_accounting', label: 'Accounting' },
      { key: 'professional_legal',      label: 'Legal' },
    ],
  },
  {
    label: 'Bank Charges',
    items: [
      { key: 'bank_interest', label: 'Interest' },
      { key: 'bank_fees',     label: 'Fees' },
    ],
  },
  {
    label: 'Other Business Expenses',
    items: [
      { key: 'other', label: 'Miscellaneous' },
    ],
  },
];

function setCell(ws, r, col, val, opts = {}) {
  const c = ws.getCell(r, col);
  if (typeof val === 'string') val = safe(val);
  c.value = val;
  c.font = { size: opts.size || 10, bold: opts.bold || false, color: { argb: opts.color || 'FF1A202C' }, italic: opts.italic || false };
  c.alignment = { horizontal: opts.align || 'left', vertical: 'middle' };
  if (opts.fill) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.fill } };
  if (opts.numFmt) c.numFmt = opts.numFmt;
  if (opts.border) c.border = opts.border;
  return c;
}

async function buildPL(data) {
  const {
    businessName, periodStart, periodEnd,
    revenue = 0, otherIncome = 0,
    ...expenses
  } = data;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Bulbring AI';
  wb.created = new Date();

  const ws = wb.addWorksheet('Profit & Loss', { views: [{ state: 'frozen', ySplit: 4 }] });

  ws.getColumn(1).width = 4;
  ws.getColumn(2).width = 40;
  ws.getColumn(3).width = 20;
  ws.getColumn(4).width = 4;

  // Title
  ws.mergeCells('A1:D1');
  const t1 = ws.getCell('A1');
  t1.value = businessName ? `${safe(businessName)} — Profit & Loss` : 'Profit & Loss Statement';
  t1.font = { bold: true, size: 14, color: { argb: WHITE } };
  t1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  t1.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  ws.getRow(1).height = 28;

  ws.mergeCells('A2:D2');
  const t2 = ws.getCell('A2');
  const period = [fmt(periodStart), fmt(periodEnd)].filter(Boolean).join(' — ');
  t2.value = period || 'For the Period';
  t2.font = { size: 10, italic: true, color: { argb: 'FFCFE2F3' } };
  t2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  t2.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  ws.getRow(2).height = 16;

  ws.getRow(3).height = 8;

  let r = 4;

  const sectionHeader = (label) => {
    ws.getRow(r).height = 16;
    ws.mergeCells(`A${r}:D${r}`);
    const c = ws.getCell(r, 1);
    c.value = label.toUpperCase();
    c.font = { bold: true, size: 9, color: { argb: NAVY } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE_BG } };
    c.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    r++;
  };

  const dataRow = (label, amount, isSubtotal = false, stripe = false) => {
    ws.getRow(r).height = 15;
    const bg = isSubtotal ? BLUE_BG : (stripe ? STRIPE : WHITE);
    setCell(ws, r, 2, label, {
      bold: isSubtotal,
      color: isSubtotal ? NAVY : 'FF2D3748',
      fill: bg,
      indent: isSubtotal ? 0 : 1,
      size: isSubtotal ? 10 : 10,
      align: 'left',
    });
    if (ws.getCell(r, 2).alignment) ws.getCell(r, 2).alignment = { horizontal: 'left', vertical: 'middle', indent: isSubtotal ? 1 : 2 };
    const ac = ws.getCell(r, 3);
    ac.value = amount || null;
    ac.numFmt = CURRENCY;
    ac.font = { size: 10, bold: isSubtotal, color: { argb: isSubtotal ? NAVY : 'FF2D3748' } };
    ac.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
    ac.alignment = { horizontal: 'right', vertical: 'middle' };
    if (isSubtotal) {
      ac.border = { top: { style: 'thin', color: { argb: NAVY } } };
      ws.getCell(r, 2).border = { top: { style: 'thin', color: { argb: NAVY } } };
    }
    r++;
  };

  const spacer = () => { ws.getRow(r).height = 6; r++; };

  // ── Revenue ────────────────────────────────────────────────────────────────
  sectionHeader('Revenue');
  dataRow('Business Income', parseFloat(revenue) || 0, false, false);
  if (parseFloat(otherIncome) > 0) dataRow('Other Income', parseFloat(otherIncome), false, true);
  const totalRevenue = (parseFloat(revenue) || 0) + (parseFloat(otherIncome) || 0);
  dataRow('Total Revenue', totalRevenue, true);
  spacer();

  // ── Expenses ───────────────────────────────────────────────────────────────
  sectionHeader('Expenses');

  let totalExpenses = 0;
  let stripe = false;

  for (const group of EXPENSE_GROUPS) {
    const groupItems = group.items.filter(i => parseFloat(expenses[i.key]) > 0);
    if (groupItems.length === 0) continue;

    // Group label row
    ws.getRow(r).height = 13;
    ws.mergeCells(`A${r}:D${r}`);
    const gc = ws.getCell(r, 1);
    gc.value = group.label;
    gc.font = { bold: true, size: 9, color: { argb: MUTED } };
    gc.alignment = { horizontal: 'left', vertical: 'middle', indent: 2 };
    r++;

    let groupTotal = 0;
    for (const item of groupItems) {
      const amt = parseFloat(expenses[item.key]) || 0;
      groupTotal += amt;
      dataRow(item.label, amt, false, stripe);
      stripe = !stripe;
    }
    totalExpenses += groupTotal;
  }

  dataRow('Total Expenses', totalExpenses, true);
  spacer();

  // ── Net Income ─────────────────────────────────────────────────────────────
  const netIncome = totalRevenue - totalExpenses;
  ws.getRow(r).height = 22;
  ws.mergeCells(`A${r}:D${r}`);
  const niRow = ws.getCell(r, 1);
  niRow.value = null;
  // unmerge and set individually
  ws.unMergeCells(`A${r}:D${r}`);

  const nilLabel = ws.getCell(r, 2);
  nilLabel.value = netIncome >= 0 ? 'NET INCOME' : 'NET LOSS';
  nilLabel.font = { bold: true, size: 12, color: { argb: WHITE } };
  nilLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: netIncome >= 0 ? 'FF047857' : 'FFC53030' } };
  nilLabel.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };

  const nilAmt = ws.getCell(r, 3);
  nilAmt.value = Math.abs(netIncome);
  nilAmt.numFmt = CURRENCY;
  nilAmt.font = { bold: true, size: 12, color: { argb: WHITE } };
  nilAmt.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: netIncome >= 0 ? 'FF047857' : 'FFC53030' } };
  nilAmt.alignment = { horizontal: 'right', vertical: 'middle' };
  r++;

  spacer();

  // ── Margin note ────────────────────────────────────────────────────────────
  if (totalRevenue > 0) {
    const margin = ((netIncome / totalRevenue) * 100).toFixed(1);
    ws.mergeCells(`B${r}:C${r}`);
    ws.getRow(r).height = 14;
    const mn = ws.getCell(r, 2);
    mn.value = `Net margin: ${margin}%  ·  Generated by Bulbring AI`;
    mn.font = { size: 9, italic: true, color: { argb: MUTED } };
    mn.alignment = { horizontal: 'right' };
  }

  return await wb.xlsx.writeBuffer();
}

module.exports = { buildPL, EXPENSE_GROUPS };
