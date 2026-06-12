const express = require('express');
const jwt     = require('jsonwebtoken');
const { buildHST } = require('../lib/hstBuilder');
const history     = require('../lib/historyManager');

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
    const buf      = await buildHST(data);
    const dateStr  = new Date().toISOString().split('T')[0];
    const filename = `hst-return-${dateStr}.xlsx`;
    const desc     = `HST Return${data.businessName ? ' — ' + data.businessName : ''}${data.periodStart ? ' (' + data.periodStart + ')' : ''}`;

    history.save('hst', 'HST Return', filename, desc, buf);

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buf.length,
    });
    res.send(buf);
  } catch (err) {
    console.error('HST error:', err);
    res.status(500).json({ error: 'Failed to generate HST summary. Please try again.' });
  }
});

module.exports = router;
