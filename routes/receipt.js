const express   = require('express');
const jwt       = require('jsonwebtoken');
const multer    = require('multer');
const Anthropic = require('@anthropic-ai/sdk');
const ExcelJS   = require('exceljs');
const history   = require('../lib/historyManager');

const router = express.Router();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SUPPORTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (SUPPORTED_TYPES.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Only JPEG, PNG, WebP, or GIF images are accepted'));
  },
});

function requireAuth(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing auth token' });
  try { req.user = jwt.verify(h.slice(7), process.env.JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid or expired session' }); }
}

const SCAN_PROMPT = `You are a Canadian tax receipt parser. Extract ALL information from this receipt image.

Return ONLY valid JSON matching this exact structure (no markdown, no explanation):
{
  "merchant": "string — business name",
  "address": "string or null",
  "date": "YYYY-MM-DD or null",
  "time": "HH:MM or null",
  "items": [
    { "name": "string", "quantity": 1, "unit_price": 0.00, "total": 0.00 }
  ],
  "subtotal": 0.00,
  "tax": 0.00,
  "tip": null,
  "total": 0.00,
  "payment_method": "string or null",
  "receipt_number": "string or null",
  "category": "one of the keys below",
  "category_reason": "one sentence why",
  "needs_review": false,
  "notes": "string or null"
}

CATEGORY KEYS — pick exactly one:
  vehicle_fuel | vehicle_repairs | vehicle_lease
  dues_cpa | dues_other
  advertising_gifts | advertising_client | advertising_meals | staff_meals
  travel_accommodation | travel_meals | travel_general
  office_supplies | office_phone
  professional_accounting | professional_legal
  bank_interest | bank_fees
  personal | other

CATEGORY RULES (use your judgment):
- Gas station → vehicle_fuel
- Coffee/food under $25, one or two people → advertising_meals
- Coffee/food $25–$150, likely client meeting → advertising_client
- Coffee/food $30+ that is clearly a team/staff order → staff_meals
- Restaurant $150+, clearly client dinner → advertising_client
- Hotel/Airbnb → travel_accommodation
- Grocery store under $60 → advertising_meals; over $80 → staff_meals
- Pharmacy, clothing, gym (personal) → personal
- Any Amazon/Costco order that looks personal → personal
- Set needs_review: true only if you genuinely cannot identify the merchant or purpose`;

const CATEGORY_LABELS = {
  vehicle_fuel: 'Vehicle — Fuel',
  vehicle_repairs: 'Vehicle — Repairs',
  vehicle_lease: 'Vehicle — Lease',
  dues_cpa: 'Dues — CPA',
  dues_other: 'Dues — Other',
  advertising_gifts: 'Advertising — Client Gifts',
  advertising_client: 'Advertising — Client Entertainment',
  advertising_meals: 'Advertising — Meals',
  staff_meals: 'Staff Meals',
  travel_accommodation: 'Travel — Accommodation',
  travel_meals: 'Travel — Meals',
  travel_general: 'Travel — General',
  office_supplies: 'Office — Supplies',
  office_phone: 'Office — Phone & Internet',
  professional_accounting: 'Professional — Accounting',
  professional_legal: 'Professional — Legal',
  bank_interest: 'Bank — Interest',
  bank_fees: 'Bank — Fees',
  personal: 'Personal (Non-Deductible)',
  other: 'Other Business Expense',
};

async function buildReceiptExcel(parsed) {
  const NAVY  = 'FF1B3A6B';
  const WHITE = 'FFFFFFFF';
  const BG    = 'FFEBF2FB';
  const STRIPE = 'FFF8F9FA';
  const CURRENCY = '$#,##0.00;($#,##0.00);"-"';
  const safe = v => (typeof v === 'string' && /^[=+\-@]/.test(v)) ? ' ' + v : (v ?? '');

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Bulbring AI';
  const ws = wb.addWorksheet('Receipt');

  ws.getColumn(1).width = 4;
  ws.getColumn(2).width = 36;
  ws.getColumn(3).width = 12;
  ws.getColumn(4).width = 14;
  ws.getColumn(5).width = 14;
  ws.getColumn(6).width = 4;

  ws.mergeCells('A1:F1');
  const t1 = ws.getCell('A1');
  t1.value = safe(parsed.merchant || 'Receipt');
  t1.font = { bold: true, size: 14, color: { argb: WHITE } };
  t1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  t1.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  ws.getRow(1).height = 28;

  ws.mergeCells('A2:F2');
  const t2 = ws.getCell('A2');
  const meta = [parsed.date, parsed.address, parsed.receipt_number ? `#${parsed.receipt_number}` : null].filter(Boolean).join('  ·  ');
  t2.value = meta || 'Scanned Receipt';
  t2.font = { size: 10, italic: true, color: { argb: 'FFCFE2F3' } };
  t2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
  t2.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  ws.getRow(2).height = 16;

  ws.getRow(3).height = 8;

  // Header
  const HDR = 4;
  [['', 1], ['Description', 2], ['Qty', 3], ['Unit Price', 4], ['Amount', 5]].forEach(([label, col]) => {
    const c = ws.getCell(HDR, col);
    c.value = label;
    c.font = { bold: true, size: 10, color: { argb: NAVY } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BG } };
    c.border = { bottom: { style: 'medium', color: { argb: NAVY } } };
    c.alignment = { horizontal: col >= 3 ? 'right' : 'left', vertical: 'middle' };
  });
  ws.getRow(HDR).height = 18;

  let r = 5;
  const items = parsed.items || [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const bg = i % 2 === 0 ? STRIPE : WHITE;
    ws.getRow(r).height = 15;

    const dc = ws.getCell(r, 2);
    dc.value = safe(item.name || '');
    dc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
    dc.font = { size: 10 };

    const qc = ws.getCell(r, 3);
    qc.value = item.quantity || 1;
    qc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
    qc.alignment = { horizontal: 'right' };
    qc.font = { size: 10 };

    const pc = ws.getCell(r, 4);
    pc.value = item.unit_price || 0;
    pc.numFmt = CURRENCY;
    pc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
    pc.alignment = { horizontal: 'right' };
    pc.font = { size: 10 };

    const ac = ws.getCell(r, 5);
    ac.value = item.total || 0;
    ac.numFmt = CURRENCY;
    ac.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
    ac.alignment = { horizontal: 'right' };
    ac.font = { size: 10 };

    r++;
  }

  r++;
  const totals = [
    ['Subtotal', parsed.subtotal],
    ['Tax', parsed.tax],
    ...(parsed.tip ? [['Tip', parsed.tip]] : []),
    ['TOTAL', parsed.total],
  ];
  for (let i = 0; i < totals.length; i++) {
    const [label, val] = totals[i];
    const isTotal = label === 'TOTAL';
    ws.getRow(r).height = isTotal ? 20 : 15;
    const lc = ws.getCell(r, 4);
    lc.value = label;
    lc.font = { bold: isTotal, size: 10, color: { argb: isTotal ? NAVY : 'FF4A5568' } };
    lc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isTotal ? BG : WHITE } };
    lc.alignment = { horizontal: 'right', vertical: 'middle' };
    if (isTotal) lc.border = { top: { style: 'medium', color: { argb: NAVY } } };

    const vc = ws.getCell(r, 5);
    vc.value = val || 0;
    vc.numFmt = CURRENCY;
    vc.font = { bold: isTotal, size: 10, color: { argb: isTotal ? NAVY : 'FF4A5568' } };
    vc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isTotal ? BG : WHITE } };
    vc.alignment = { horizontal: 'right', vertical: 'middle' };
    if (isTotal) vc.border = { top: { style: 'medium', color: { argb: NAVY } } };
    r++;
  }

  r += 2;
  ws.getRow(r).height = 16;
  ws.mergeCells(`B${r}:E${r}`);
  const catRow = ws.getCell(r, 2);
  catRow.value = `CRA Category: ${CATEGORY_LABELS[parsed.category] || parsed.category || 'Other'}${parsed.needs_review ? '  ⚠ REVIEW' : ''}`;
  catRow.font = { size: 10, bold: true, color: { argb: parsed.needs_review ? 'FFC53030' : NAVY } };
  catRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BG } };
  catRow.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };

  if (parsed.category_reason) {
    r++;
    ws.getRow(r).height = 14;
    ws.mergeCells(`B${r}:E${r}`);
    const reasonRow = ws.getCell(r, 2);
    reasonRow.value = safe(parsed.category_reason);
    reasonRow.font = { size: 9, italic: true, color: { argb: 'FF718096' } };
    reasonRow.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  }

  if (parsed.payment_method) {
    r++;
    ws.getRow(r).height = 14;
    ws.mergeCells(`B${r}:E${r}`);
    const pmRow = ws.getCell(r, 2);
    pmRow.value = `Payment: ${safe(parsed.payment_method)}`;
    pmRow.font = { size: 9, color: { argb: '718096' } };
    pmRow.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  }

  r += 2;
  ws.mergeCells(`B${r}:E${r}`);
  const footer = ws.getCell(r, 2);
  footer.value = 'Scanned by Bulbring AI Receipt Scanner';
  footer.font = { size: 9, italic: true, color: { argb: 'FF718096' } };
  footer.alignment = { horizontal: 'right' };

  return await wb.xlsx.writeBuffer();
}

// POST /api/receipt/scan
router.post('/scan', requireAuth, upload.single('receipt'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

  try {
    const b64       = req.file.buffer.toString('base64');
    const mediaType = req.file.mimetype;

    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
          { type: 'text', text: SCAN_PROMPT },
        ],
      }],
    });

    const raw = msg.content[0]?.text || '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');

    const parsed = JSON.parse(jsonMatch[0]);

    // Build Excel
    const excelBuf = await buildReceiptExcel(parsed);
    const merchant  = (parsed.merchant || 'receipt').toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30);
    const dateStr   = parsed.date || new Date().toISOString().split('T')[0];
    const filename  = `receipt-${merchant}-${dateStr}.xlsx`;

    history.save('receipt', 'Receipt Scan', filename, `${parsed.merchant || 'Receipt'} — $${parsed.total?.toFixed(2) || '?'} — ${CATEGORY_LABELS[parsed.category] || parsed.category || 'Other'}`, excelBuf);

    res.json({
      parsed,
      categoryLabel: CATEGORY_LABELS[parsed.category] || parsed.category,
      excelFilename: filename,
    });
  } catch (err) {
    console.error('Receipt scan error:', err);
    if (err.message?.includes('JSON')) {
      return res.status(502).json({ error: 'Could not parse receipt. Try a clearer photo.' });
    }
    res.status(500).json({ error: 'Receipt scan failed. Please try again.' });
  }
});

// POST /api/receipt/download — re-download the last scanned receipt Excel
router.post('/download', requireAuth, upload.single('receipt'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

  try {
    const b64       = req.file.buffer.toString('base64');
    const mediaType = req.file.mimetype;

    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } },
          { type: 'text', text: SCAN_PROMPT },
        ],
      }],
    });

    const raw = msg.content[0]?.text || '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');

    const parsed    = JSON.parse(jsonMatch[0]);
    const excelBuf  = await buildReceiptExcel(parsed);
    const merchant  = (parsed.merchant || 'receipt').toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 30);
    const dateStr   = parsed.date || new Date().toISOString().split('T')[0];
    const filename  = `receipt-${merchant}-${dateStr}.xlsx`;

    history.save('receipt', 'Receipt Scan', filename, `${parsed.merchant || 'Receipt'} — $${parsed.total?.toFixed(2) || '?'}`, excelBuf);

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': excelBuf.length,
    });
    res.send(excelBuf);
  } catch (err) {
    console.error('Receipt download error:', err);
    res.status(500).json({ error: 'Receipt download failed.' });
  }
});

module.exports = router;
