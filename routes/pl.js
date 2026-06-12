const express = require('express');
const jwt     = require('jsonwebtoken');
const { buildPL } = require('../lib/plBuilder');
const history   = require('../lib/historyManager');

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
    if (!data.revenue && data.revenue !== 0) {
      return res.status(400).json({ error: 'Revenue is required' });
    }

    const buf      = await buildPL(data);
    const dateStr  = new Date().toISOString().split('T')[0];
    const filename = `pl-${dateStr}.xlsx`;
    const desc     = `P&L${data.businessName ? ' — ' + data.businessName : ''}${data.periodStart ? ' (' + data.periodStart + ')' : ''}`;

    history.save('pl', 'P&L Statement', filename, desc, buf);

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buf.length,
    });
    res.send(buf);
  } catch (err) {
    console.error('P&L error:', err);
    res.status(500).json({ error: 'Failed to generate P&L. Please try again.' });
  }
});

module.exports = router;
