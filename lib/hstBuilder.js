const ExcelJS = require('exceljs');

const NAVY    = 'FF1B3A6B';
const WHITE   = 'FFFFFFFF';
const BLUE_BG = 'FFEBF2FB';
const STRIPE  = 'FFF8F9FA';
const MUTED   = 'FF718096';
const GREEN   = 'FF047857';
const RED_C   = 'FFC53030';
const CURRENCY = '$#,##0.00;($#,##0.00);"-"';
const PCT_FMT  = '0.00%';

const safe = v => (typeof v === 'string' && /^[=+\-@]/.test(v)) ? ' ' + v : (v ?? '');

function fmt(d) {
  if (!d) return '';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' });
}

function setC(ws, r, col, val, opts = {}) {
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

async function buildHST(data) {
  const {
    businessName, hstNumber, periodStart, periodEnd,
    hstRate       = 0.13,
    revenue       = 0,
    zeroRatedRev  = 0,
    exemptRev     = 0,
    itcExpenses   = 0,
    itcCapital    = 0,
    useQuickMethod = false,
    quickMethodRate = 0.088,
  } = data;

  const rev   = parseFloat(revenue)      || 0;
  const zrRev = parseFloat(zeroRatedRev) || 0;
  const exRev = parseFloat(exemptRev)    || 0;
  const rate  = parseFloat(hstRate)      || 0.13;

  const taxableRevenue  = rev - zrRev - exRev;
  const hstCollected    = taxableRevenue * rate;
  const itcTotal        = (parseFloat(itcExpenses) || 0) + (parseFloat(itcCapital) || 0);
  const hstOnITC        = itcTotal * rate;

  let netHST;
  let quickMethodRemittance = null;

  if (useQuickMethod) {
    const qRate = parseFloat(quickMethodRate) || 0.088;
    quickMethodRemittance = (taxableRevenue + hstCollected) * qRate;
    netHST = quickMethodRemittance;
  } else {
    netHST = hstCollected - hstOnITC;
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Bulbring AI';
  wb.created = new Date();

  const ws = wb.addWorksheet('HST Return Summary', { views: [{ state: 'frozen', ySplit: 4 }] });
  ws.getColumn(1).width = 4;
  ws.getColumn(2).width = 42;
  ws.getColumn(3).width = 20;
  ws.getColumn(4).width = 4;

  // Title
  ws.mergeCells('A1:D1');
  const t1 = ws.getCell('A1');
  t1.value = businessName ? `${safe(businessName)} — HST/GST Return Summary` : 'HST/GST Return Summary';
  t1.font = { bold: true, size: 14, color: { argb: WHITE } };
  t1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  t1.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  ws.getRow(1).height = 28;

  ws.mergeCells('A2:D2');
  const t2 = ws.getCell('A2');
  const period = [fmt(periodStart), fmt(periodEnd)].filter(Boolean).join(' — ');
  t2.value = (period || 'Reporting Period') + (hstNumber ? `  ·  HST# ${hstNumber}` : '');
  t2.font = { size: 10, italic: true, color: { argb: 'FFCFE2F3' } };
  t2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  t2.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  ws.getRow(2).height = 16;

  ws.getRow(3).height = 8;

  let r = 4;

  const section = (label) => {
    ws.getRow(r).height = 16;
    ws.mergeCells(`A${r}:D${r}`);
    const c = ws.getCell(r, 1);
    c.value = label.toUpperCase();
    c.font = { bold: true, size: 9, color: { argb: NAVY } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE_BG } };
    c.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    r++;
  };

  const row = (label, val, isCurrency = true, isSubtotal = false, stripe = false) => {
    ws.getRow(r).height = 15;
    const bg = isSubtotal ? BLUE_BG : (stripe ? STRIPE : WHITE);
    const lc = ws.getCell(r, 2);
    lc.value = typeof label === 'string' ? safe(label) : label;
    lc.font = { size: 10, bold: isSubtotal, color: { argb: isSubtotal ? NAVY : 'FF2D3748' } };
    lc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
    lc.alignment = { horizontal: 'left', vertical: 'middle', indent: isSubtotal ? 1 : 2 };
    if (isSubtotal) lc.border = { top: { style: 'thin', color: { argb: NAVY } } };

    const vc = ws.getCell(r, 3);
    vc.value = val == null ? null : (typeof val === 'number' ? val || null : val);
    vc.numFmt = isCurrency ? CURRENCY : '#,##0.00%';
    vc.font = { size: 10, bold: isSubtotal, color: { argb: isSubtotal ? NAVY : 'FF2D3748' } };
    vc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
    vc.alignment = { horizontal: 'right', vertical: 'middle' };
    if (isSubtotal) vc.border = { top: { style: 'thin', color: { argb: NAVY } } };
    r++;
  };

  const spacer = () => { ws.getRow(r).height = 6; r++; };

  // Revenue
  section('Revenue');
  row('Total Business Revenue', rev, true, false, false);
  if (zrRev > 0) row('Zero-Rated Revenue (not taxable)', zrRev, true, false, true);
  if (exRev > 0) row('Exempt Revenue (not taxable)', exRev, true, false, false);
  row('Taxable Revenue', taxableRevenue, true, true);
  spacer();

  // HST Collected
  section('HST / GST Collected (Line 105)');
  const rateLabel = rate === 0.05 ? 'GST Rate (5%)' : rate === 0.13 ? 'HST Rate — Ontario (13%)' : rate === 0.15 ? 'HST Rate — Atlantic (15%)' : `Tax Rate (${(rate * 100).toFixed(1)}%)`;
  row(rateLabel, rate, false, false, false);
  row('HST Collected on Taxable Revenue', hstCollected, true, true);
  spacer();

  if (!useQuickMethod) {
    // Input Tax Credits
    section('Input Tax Credits — ITC (Line 106)');
    if (parseFloat(itcExpenses) > 0) row('HST Paid on Operating Expenses', (parseFloat(itcExpenses) || 0) * rate, true, false, false);
    if (parseFloat(itcCapital)  > 0) row('HST Paid on Capital Purchases',  (parseFloat(itcCapital)  || 0) * rate, true, false, true);
    row('Total ITCs', hstOnITC, true, true);
    spacer();
  } else {
    // Quick Method
    section('Quick Method Calculation');
    row('Total Including HST', taxableRevenue + hstCollected, true, false, false);
    row(`Quick Method Rate (${(parseFloat(quickMethodRate) * 100).toFixed(1)}%)`, parseFloat(quickMethodRate), false, false, true);
    row('Remittance Amount', quickMethodRemittance, true, true);
    spacer();
  }

  // Net Due
  ws.getRow(r).height = 24;
  const owing = netHST >= 0;
  const nlLabel = ws.getCell(r, 2);
  nlLabel.value = owing ? 'NET HST OWING (Line 109)' : 'HST REFUND OWING TO YOU';
  nlLabel.font = { bold: true, size: 12, color: { argb: WHITE } };
  nlLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: owing ? RED_C : GREEN } };
  nlLabel.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };

  const nlAmt = ws.getCell(r, 3);
  nlAmt.value = Math.abs(netHST);
  nlAmt.numFmt = CURRENCY;
  nlAmt.font = { bold: true, size: 12, color: { argb: WHITE } };
  nlAmt.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: owing ? RED_C : GREEN } };
  nlAmt.alignment = { horizontal: 'right', vertical: 'middle' };
  r++;

  spacer(); spacer();

  // CRA line reference table
  section('CRA Line Reference');
  const cLines = [
    ['Line 101', 'Total Revenue', rev],
    ['Line 103', 'Adjustments (zero-rated + exempt)', -(zrRev + exRev) || null],
    ['Line 105', 'Tax Collected / Collectible', hstCollected],
    useQuickMethod
      ? ['Line 109', 'Net Tax (Quick Method)', netHST]
      : ['Line 106', 'Input Tax Credits', hstOnITC],
    ['Line 109', 'Net Tax (Remit / Refund)', netHST],
  ];
  let stripe = false;
  for (const [line, lbl, amt] of cLines) {
    if (amt == null) { stripe = !stripe; continue; }
    ws.getRow(r).height = 15;
    const bg = stripe ? STRIPE : WHITE;
    setC(ws, r, 2, `${line}  —  ${lbl}`, { size: 9, color: MUTED, fill: bg });
    const ac = ws.getCell(r, 3);
    ac.value = amt || null;
    ac.numFmt = CURRENCY;
    ac.font = { size: 9, color: { argb: MUTED } };
    ac.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
    ac.alignment = { horizontal: 'right', vertical: 'middle' };
    r++; stripe = !stripe;
  }

  spacer();
  ws.mergeCells(`B${r}:C${r}`);
  const note = ws.getCell(r, 2);
  note.value = 'This is a working summary only. File your actual return at My Business Account (CRA).  ·  Generated by Bulbring AI';
  note.font = { size: 9, italic: true, color: { argb: MUTED } };
  note.alignment = { horizontal: 'right' };

  return await wb.xlsx.writeBuffer();
}

module.exports = { buildHST };
