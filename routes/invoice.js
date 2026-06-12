const express = require('express');
const jwt     = require('jsonwebtoken');
const { buildInvoice } = require('../lib/invoiceBuilder');

const router = express.Router();

function requireAuth(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing auth token' });
  try { req.user = jwt.verify(h.slice(7), process.env.JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid or expired session' }); }
}

router.post('/generate', requireAuth, async (req, res) => {
  try {
    const data = req.body;
    if (!data.lineItems?.length) return res.status(400).json({ error: 'At least one line item is required' });

    const buf = await buildInvoice(data);
    // Strip everything except alphanumerics and hyphens before embedding in a header
    const safeNum = (data.invoiceNumber || '').replace(/[^a-zA-Z0-9\-_]/g, '').slice(0, 40);
    const filename = `invoice${safeNum ? `-${safeNum}` : ''}-${new Date().toISOString().split('T')[0]}.xlsx`;

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buf.length,
    });
    res.send(buf);
  } catch (err) {
    console.error('Invoice error:', err);
    res.status(500).json({ error: 'Failed to generate invoice. Please try again.' });
  }
});

module.exports = router;
