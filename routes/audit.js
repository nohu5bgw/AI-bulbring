const express   = require('express');
const jwt       = require('jsonwebtoken');
const multer    = require('multer');
const Anthropic = require('@anthropic-ai/sdk');
const { extractTextFromPDF } = require('../lib/pdfParser');

const router = express.Router();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') return cb(null, true);
    cb(new Error('Only PDF files are accepted'));
  },
});

function requireAuth(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing auth token' });
  try { req.user = jwt.verify(h.slice(7), process.env.JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid or expired session' }); }
}

const AUDIT_PROMPT = `You are a Canadian CRA audit risk specialist. Analyze these bank/credit-card transactions and identify audit risk factors a CRA auditor would flag.

Return ONLY valid JSON (no markdown) matching this exact structure:
{
  "overall_risk": "Low" | "Medium" | "High",
  "risk_score": 0-100,
  "period": "e.g. Jan–Dec 2024",
  "total_transactions": 0,
  "total_expenses": 0.00,
  "summary": "One or two sentence plain-English overview of the risk profile",
  "flags": [
    {
      "severity": "high" | "medium" | "low",
      "category": "category name",
      "title": "short flag title",
      "description": "what CRA would flag and why",
      "amount": 0.00,
      "count": 0,
      "recommendation": "what to do to reduce this risk"
    }
  ],
  "positives": [
    "string — things that look clean and low-risk"
  ],
  "top_recommendations": [
    "string — top 3 most important actions to take before filing"
  ]
}

CRA AUDIT RISK FACTORS TO CHECK (flag everything that applies):

HIGH severity:
- Meals & entertainment total exceeds $5,000 (high scrutiny amount)
- Any single meal/entertainment charge over $500 (required explanation)
- Vehicle fuel + repairs exceeds 30% of total claimed expenses (CRA questions business-use %)
- Round-number amounts ($500, $1000, $2000 etc.) appearing repeatedly — suggests estimates not receipts
- Cash advances / ATM withdrawals claimed as business expenses
- Personal-looking charges (Netflix, Spotify, gym, clothing, pharmacy, grocery) in business expenses
- Home office claimed without clear indication of dedicated space
- Foreign currency transactions (FX charges attract scrutiny)
- Expenses that spike in December (year-end stuffing)

MEDIUM severity:
- Meals & entertainment between $2,000–$5,000
- Vehicle expenses total between $3,000–$8,000 without logbook indicators
- "Other" or miscellaneous expenses exceed 10% of total
- Subscription services mixed in without clear business purpose
- Multiple similar amounts on same day (possible duplicates)
- Expenses on weekends or statutory holidays for supposedly business purposes
- Staff meals over $2,000 (CRA scrutinizes 100%-deductible staff meals)
- Client gifts over $1,000 (must be under $500/recipient/year non-taxable)

LOW severity:
- Any expense category that is unusually high compared to typical businesses in this industry
- Advertising/promotion appears very high relative to revenue
- Professional fees seem disproportionate

For each flag, be specific about amounts and counts. If something looks clean, say so in positives.`;

// POST /api/audit/analyze
router.post('/analyze', requireAuth, upload.array('statements', 20), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No PDF files uploaded' });
  }

  try {
    const texts = [];
    for (const file of req.files) {
      const text = await extractTextFromPDF(file.buffer);
      if (!text || text.trim().length < 50) {
        return res.status(422).json({ error: `Could not extract text from "${file.originalname}". Use a text-based PDF, not a scanned image.` });
      }
      texts.push(text);
    }

    const combined = texts.join('\n\n--- NEXT STATEMENT ---\n\n');

    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: `${AUDIT_PROMPT}\n\nBANK STATEMENT DATA:\n\n${combined}`,
      }],
    });

    const raw = msg.content[0]?.text || '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');

    const report = JSON.parse(jsonMatch[0]);
    res.json(report);

  } catch (err) {
    console.error('Audit error:', err);
    if (err.message?.includes('JSON')) {
      return res.status(502).json({ error: 'Could not parse AI response. Please try again.' });
    }
    res.status(500).json({ error: 'Audit analysis failed. Please try again.' });
  }
});

module.exports = router;
