const express = require('express');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const { extractTextFromPDF } = require('../lib/pdfParser');
const { analyzeBankStatement } = require('../lib/craAgent');
const { buildExcel } = require('../lib/excelBuilder');
const { buildTrialBalance } = require('../lib/trialBalanceBuilder');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') return cb(null, true);
    cb(new Error('Only PDF files are accepted'));
  },
});

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing auth token' });
  }
  try {
    req.user = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired session' });
  }
}

// POST /api/agent/process
// Accepts one or more PDF bank statements, returns a single merged Excel file
router.post('/process', requireAuth, upload.array('statements', 20), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No PDF files uploaded' });
  }

  try {
    const results = [];

    for (const file of req.files) {
      const pdfText = await extractTextFromPDF(file.buffer);

      if (!pdfText || pdfText.trim().length < 50) {
        return res.status(422).json({
          error: `Could not extract text from "${file.originalname}". Make sure it is a text-based PDF, not a scanned image.`,
        });
      }

      const analysis = await analyzeBankStatement(pdfText);
      results.push(analysis);
    }

    // Merge all transactions and sort by date
    const allTransactions = results.flatMap(r => r.transactions);
    allTransactions.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    const starts  = results.map(r => r.period?.start).filter(Boolean).sort();
    const ends    = results.map(r => r.period?.end).filter(Boolean).sort();
    const banks   = [...new Set(results.map(r => r.period?.bank).filter(Boolean))];

    const mergedAnalysis = {
      transactions: allTransactions,
      period: {
        start:           starts[0] || null,
        end:             ends[ends.length - 1] || null,
        bank:            banks.join(' / ') || 'Visa',
        opening_balance: results[0]?.period?.opening_balance || 0,
      },
    };

    const isTB = req.body.outputType === 'tb_import';
    const excelBuffer = isTB
      ? await buildTrialBalance(mergedAnalysis)
      : await buildExcel(mergedAnalysis);
    const filename = isTB
      ? `trial-balance-${new Date().toISOString().split('T')[0]}.xlsx`
      : `cra-analysis-${new Date().toISOString().split('T')[0]}.xlsx`;

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': excelBuffer.length,
    });

    res.send(excelBuffer);
  } catch (err) {
    console.error('Agent error:', err);

    if (err.message?.includes('JSON')) {
      return res.status(502).json({ error: 'AI response could not be parsed. Please try again.' });
    }

    res.status(500).json({ error: 'Processing failed. Please try again.' });
  }
});

module.exports = router;
