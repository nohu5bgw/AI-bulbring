const express = require('express');
const jwt     = require('jsonwebtoken');
const { buildTrialBalanceReport } = require('../lib/tbGenerator');

const router = express.Router();

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

module.exports = router;
