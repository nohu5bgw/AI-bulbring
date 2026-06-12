const express   = require('express');
const jwt       = require('jsonwebtoken');
const multer    = require('multer');
const ExcelJS   = require('exceljs');
const Anthropic = require('@anthropic-ai/sdk');
const { buildTrialBalanceReport } = require('../lib/tbGenerator');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function requireAuth(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing auth token' });
  try { req.user = jwt.verify(h.slice(7), process.env.JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid or expired session' }); }
}

router.post('/generate', requireAuth, async (req, res) => {
  try {
    const buf = await buildTrialBalanceReport(req.body);
    const filename = `trial-balance-${new Date().toISOString().split('T')[0]}.xlsx`;

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buf.length,
    });
    res.send(buf);
  } catch (err) {
    console.error('TB error:', err);
    res.status(500).json({ error: 'Failed to generate trial balance. Please try again.' });
  }
});

router.post('/generate-from-file', requireAuth, upload.single('tbFile'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  if (!req.file.originalname.toLowerCase().endsWith('.xlsx')) {
    return res.status(400).json({ error: 'Only .xlsx files are accepted' });
  }
  // XLSX files are ZIP archives — verify PK magic bytes before parsing
  if (req.file.buffer[0] !== 0x50 || req.file.buffer[1] !== 0x4B) {
    return res.status(400).json({ error: 'Invalid file format — please upload an .xlsx file' });
  }

  try {
    // Extract spreadsheet content as text for Claude
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(req.file.buffer);
    const ws = wb.worksheets[0];

    const rows = [];
    ws.eachRow((row, rowNum) => {
      const cells = [];
      row.eachCell({ includeEmpty: false }, (cell) => {
        const v = cell.value;
        if (v === null || v === undefined) return;
        const display = (typeof v === 'object' && v !== null)
          ? (v.result != null ? v.result : JSON.stringify(v))
          : v;
        cells.push(`${cell.address}: ${display}`);
      });
      if (cells.length) rows.push(`Row ${rowNum}: ${cells.join(' | ')}`);
    });

    const tableText = rows.join('\n');

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: `You are an accounting assistant. Parse Excel cell data from a trial balance spreadsheet exported by a bank statement tool.

Extract:
1. Period start date → YYYY-MM-DD (look for text like "January 1, 2024" or "2024-01-01")
2. Period end date → YYYY-MM-DD
3. Business or bank name (if present, otherwise null)
4. Account balances: for each 4-digit account code (e.g. 2000, 6100, 6110, 6200 …) extract the balance as a positive number.
   - Whether the value is in a Debit or Credit column, always return a positive number
   - Skip rows labelled TOTAL or column header rows
   - Only include accounts with a non-zero balance

Return ONLY valid JSON (no markdown fences):
{"periodStart":"YYYY-MM-DD","periodEnd":"YYYY-MM-DD","businessName":"string or null","balances":{"6100":500.00,"2000":3200.00}}`,
      messages: [{ role: 'user', content: `Parse this trial balance data:\n\n${tableText}` }],
    });

    const raw = msg.content[0].text.trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '');
    const parsed = JSON.parse(raw);

    if (!parsed.balances || Object.keys(parsed.balances).length === 0) {
      return res.status(422).json({ error: 'No account balances found. Make sure you are uploading a Trial Balance Import (.xlsx) from the Bank Statement Tool.' });
    }

    const buf = await buildTrialBalanceReport({
      businessName: parsed.businessName || '',
      periodStart:  parsed.periodStart  || '',
      periodEnd:    parsed.periodEnd    || '',
      balances:     parsed.balances,
    });

    const filename = `trial-balance-${new Date().toISOString().split('T')[0]}.xlsx`;
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buf.length,
    });
    res.send(buf);

  } catch (err) {
    console.error('TB import error:', err);
    if (err instanceof SyntaxError) {
      return res.status(502).json({ error: 'AI could not read the file. Please try again.' });
    }
    res.status(500).json({ error: 'Failed to process file. Please try again.' });
  }
});

module.exports = router;
