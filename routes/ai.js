const express   = require('express');
const jwt       = require('jsonwebtoken');
const Anthropic = require('@anthropic-ai/sdk');

const router = express.Router();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are a knowledgeable Canadian accounting and tax assistant built into Bulbring AI. You help small business owners, self-employed individuals, and accountants with:

- CRA tax rules and deadlines (T2125, T1, T2, HST/GST, payroll)
- Business expense categorization under CRA guidelines
- HST/GST registration, filing, and input tax credits
- T2125 Part 2 (business income and expenses for self-employed)
- Deductibility rules (meals 50%, vehicle logbook, home office, etc.)
- Trial balance and bookkeeping concepts
- Invoice requirements under CRA rules
- Year-end planning and common deductions
- Payroll basics (T4, CPP, EI)
- CRA deadlines and penalties
- Reasonable salary for owner-managers
- SR&ED credits, BDC, and other business programs

Keep answers concise and practical. When relevant, mention specific CRA line numbers, form names, or publication references. Always note when something requires a CPA's judgment or when rules vary by province. Never give definitive tax advice on complex personal situations — recommend consulting a licensed CPA for those.

If the user asks something unrelated to accounting, taxes, or business finance, politely redirect them.`;

function requireAuth(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing auth token' });
  try { req.user = jwt.verify(h.slice(7), process.env.JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid or expired session' }); }
}

// POST /api/ai/chat
// Body: { messages: [{ role: 'user'|'assistant', content: string }] }
router.post('/chat', requireAuth, async (req, res) => {
  const { messages } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array required' });
  }

  // Validate message shape
  const valid = messages.every(m =>
    (m.role === 'user' || m.role === 'assistant') &&
    typeof m.content === 'string' &&
    m.content.length > 0 &&
    m.content.length < 8000
  );
  if (!valid) return res.status(400).json({ error: 'Invalid message format' });
  if (messages.length > 40) return res.status(400).json({ error: 'Too many messages in history' });

  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages,
    });

    res.json({ reply: msg.content[0]?.text || '' });
  } catch (err) {
    console.error('AI chat error:', err);
    res.status(500).json({ error: 'AI response failed. Please try again.' });
  }
});

module.exports = router;
