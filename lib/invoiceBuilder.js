const ExcelJS = require('exceljs');

const NAVY    = 'FF1B3A6B';
const WHITE   = 'FFFFFFFF';
const BLUE_BG = 'FFEBF2FB';
const STRIPE  = 'FFF8F9FA';
const MUTED   = 'FF718096';
const CURRENCY = '$#,##0.00;($#,##0.00);"-"';

function cell(ws, row, col, value, opts = {}) {
  const c = ws.getCell(row, col);
  c.value = value;
  c.font = { size: opts.size || 10, bold: opts.bold || false, color: { argb: opts.color || 'FF1A202C' }, italic: opts.italic || false };
  c.alignment = { horizontal: opts.align || 'left', vertical: 'middle', wrapText: opts.wrap || false };
  if (opts.fill) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.fill } };
  if (opts.numFmt) c.numFmt = opts.numFmt;
  if (opts.border) c.border = opts.border;
  return c;
}

async function buildInvoice(data) {
  const {
    businessName, businessAddress, businessCity, businessHST, businessEmail, businessPhone,
    clientName, clientAddress, clientCity, clientEmail,
    invoiceNumber, invoiceDate, dueDate, paymentTerms,
    lineItems = [],
    taxRate,
    notes,
  } = data;

  const taxRateNum = parseFloat(taxRate) || 0;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Bulbring AI';
  wb.created = new Date();

  const ws = wb.addWorksheet('Invoice');

  ws.getColumn(1).width = 3;
  ws.getColumn(2).width = 38;
  ws.getColumn(3).width = 10;
  ws.getColumn(4).width = 16;
  ws.getColumn(5).width = 16;
  ws.getColumn(6).width = 3;

  // ── Header ───────────────────────────────────────────────────────────────
  ws.mergeCells('A1:F1');
  const h1 = ws.getCell('A1');
  h1.value = businessName || 'Invoice';
  h1.font = { bold: true, size: 16, color: { argb: WHITE } };
  h1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  h1.alignment = { horizontal: 'left', vertical: 'middle', indent: 2 };
  ws.getRow(1).height = 32;

  ws.mergeCells('A2:F2');
  const h2 = ws.getCell('A2');
  h2.value = 'INVOICE';
  h2.font = { size: 9, bold: true, color: { argb: 'FFAABCD4' } };
  h2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  h2.alignment = { horizontal: 'left', vertical: 'middle', indent: 2 };
  ws.getRow(2).height = 14;

  ws.getRow(3).height = 14;

  // ── From / Invoice meta ───────────────────────────────────────────────────
  cell(ws, 4, 2, 'FROM', { size: 8, color: MUTED, bold: true });
  cell(ws, 5, 2, businessName || '', { bold: true, size: 11 });
  if (businessAddress) cell(ws, 6, 2, businessAddress, { color: 'FF4A5568' });
  if (businessCity)    cell(ws, 7, 2, businessCity,    { color: 'FF4A5568' });
  if (businessHST)     cell(ws, 8, 2, `HST# ${businessHST}`, { color: 'FF4A5568' });
  if (businessEmail)   cell(ws, 9, 2, businessEmail,   { color: 'FF4A5568' });
  if (businessPhone)   cell(ws, 10, 2, businessPhone,  { color: 'FF4A5568' });

  const metaStart = 4;
  const meta = [
    ['INVOICE #', invoiceNumber],
    ['DATE',      invoiceDate],
    ['DUE DATE',  dueDate],
    ...(paymentTerms ? [['TERMS', paymentTerms]] : []),
  ];
  meta.forEach(([label, val], i) => {
    cell(ws, metaStart + i, 4, label, { size: 8, color: MUTED, bold: true, align: 'right' });
    cell(ws, metaStart + i, 5, val || '',  { align: 'right' });
  });

  ws.getRow(12).height = 10;

  // ── Bill To ───────────────────────────────────────────────────────────────
  cell(ws, 13, 2, 'BILL TO', { size: 8, color: MUTED, bold: true });
  cell(ws, 14, 2, clientName    || '', { bold: true, size: 11 });
  if (clientAddress) cell(ws, 15, 2, clientAddress, { color: 'FF4A5568' });
  if (clientCity)    cell(ws, 16, 2, clientCity,    { color: 'FF4A5568' });
  if (clientEmail)   cell(ws, 17, 2, clientEmail,   { color: 'FF4A5568' });

  ws.getRow(19).height = 12;

  // ── Line item headers ─────────────────────────────────────────────────────
  const HDR_ROW = 20;
  ws.mergeCells(`B${HDR_ROW}:C${HDR_ROW}`);
  const dh = ws.getCell(HDR_ROW, 2);
  dh.value = 'Description';
  dh.font = { bold: true, size: 10, color: { argb: NAVY } };
  dh.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE_BG } };
  dh.alignment = { horizontal: 'left', vertical: 'middle' };
  dh.border = { bottom: { style: 'medium', color: { argb: NAVY } } };

  [['Qty', 3], ['Unit Price', 4], ['Amount', 5]].forEach(([label, col]) => {
    const c = ws.getCell(HDR_ROW, col);
    c.value = label;
    c.font = { bold: true, size: 10, color: { argb: NAVY } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE_BG } };
    c.alignment = { horizontal: 'right', vertical: 'middle' };
    c.border = { bottom: { style: 'medium', color: { argb: NAVY } } };
  });
  ws.getRow(HDR_ROW).height = 18;

  // ── Line items ────────────────────────────────────────────────────────────
  let r = HDR_ROW + 1;
  const itemStart = r;

  for (let i = 0; i < lineItems.length; i++) {
    const item = lineItems[i];
    const bg = i % 2 === 0 ? STRIPE : WHITE;
    ws.getRow(r).height = 16;

    const dc = ws.getCell(r, 2);
    ws.mergeCells(`B${r}:C${r}`);
    dc.value = item.description || '';
    dc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
    dc.font = { size: 10 };

    const qc = ws.getCell(r, 3);
    qc.value = parseFloat(item.qty) || 1;
    qc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
    qc.alignment = { horizontal: 'right' };
    qc.font = { size: 10 };

    const pc = ws.getCell(r, 4);
    pc.value = parseFloat(item.unitPrice) || 0;
    pc.numFmt = CURRENCY;
    pc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
    pc.alignment = { horizontal: 'right' };
    pc.font = { size: 10 };

    const ac = ws.getCell(r, 5);
    ac.value = { formula: `C${r}*D${r}` };
    ac.numFmt = CURRENCY;
    ac.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
    ac.alignment = { horizontal: 'right' };
    ac.font = { size: 10 };

    r++;
  }

  const itemEnd = r - 1;
  r++; // spacer
  ws.getRow(r).height = 8;
  r++;

  // ── Subtotal / Tax / Total ────────────────────────────────────────────────
  const subtotalRow = r;
  cell(ws, r, 4, 'Subtotal', { align: 'right', color: 'FF4A5568' });
  const subCell = ws.getCell(r, 5);
  subCell.value = { formula: `SUM(E${itemStart}:E${itemEnd})` };
  subCell.numFmt = CURRENCY;
  subCell.alignment = { horizontal: 'right' };
  subCell.font = { size: 10 };
  ws.getRow(r).height = 16;
  r++;

  let taxRow = null;
  if (taxRateNum > 0) {
    taxRow = r;
    const taxLabel = taxRateNum === 0.05 ? 'GST (5%)' : taxRateNum === 0.13 ? 'HST (13%)' : taxRateNum === 0.15 ? 'HST (15%)' : `Tax (${(taxRateNum * 100).toFixed(1)}%)`;
    cell(ws, r, 4, taxLabel, { align: 'right', color: 'FF4A5568' });
    const taxCell = ws.getCell(r, 5);
    taxCell.value = { formula: `E${subtotalRow}*${taxRateNum}` };
    taxCell.numFmt = CURRENCY;
    taxCell.alignment = { horizontal: 'right' };
    taxCell.font = { size: 10 };
    ws.getRow(r).height = 16;
    r++;
  }

  // Total
  ws.getRow(r).height = 22;
  const tlCell = ws.getCell(r, 4);
  tlCell.value = 'TOTAL DUE';
  tlCell.font = { bold: true, size: 11, color: { argb: NAVY } };
  tlCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE_BG } };
  tlCell.alignment = { horizontal: 'right', vertical: 'middle' };
  tlCell.border = { top: { style: 'medium', color: { argb: NAVY } } };

  const totalCell = ws.getCell(r, 5);
  totalCell.value = taxRow
    ? { formula: `E${subtotalRow}+E${taxRow}` }
    : { formula: `E${subtotalRow}` };
  totalCell.numFmt = CURRENCY;
  totalCell.font = { bold: true, size: 11, color: { argb: NAVY } };
  totalCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE_BG } };
  totalCell.alignment = { horizontal: 'right', vertical: 'middle' };
  totalCell.border = { top: { style: 'medium', color: { argb: NAVY } } };
  r++;

  // ── Notes ─────────────────────────────────────────────────────────────────
  if (notes && notes.trim()) {
    r++;
    ws.getRow(r).height = 8;
    r++;
    cell(ws, r, 2, 'Notes', { size: 8, color: MUTED, bold: true });
    r++;
    ws.mergeCells(`B${r}:E${r}`);
    const nc = ws.getCell(r, 2);
    nc.value = notes;
    nc.font = { size: 10, italic: true, color: { argb: 'FF4A5568' } };
    nc.alignment = { wrapText: true, vertical: 'top' };
    ws.getRow(r).height = 40;
  }

  return await wb.xlsx.writeBuffer();
}

module.exports = { buildInvoice };
