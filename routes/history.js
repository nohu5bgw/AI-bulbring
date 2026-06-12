const express = require('express');
const jwt     = require('jsonwebtoken');
const history = require('../lib/historyManager');

const router = express.Router();

function requireAuth(req, res, next) {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing auth token' });
  try { req.user = jwt.verify(h.slice(7), process.env.JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid or expired session' }); }
}

// GET /api/history — list all saved files (newest first)
router.get('/', requireAuth, (req, res) => {
  res.json(history.list());
});

// GET /api/history/:id — download a file
router.get('/:id', requireAuth, (req, res) => {
  const entry = history.get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'File not found' });

  res.set({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="${entry.filename}"`,
    'Content-Length': entry.buffer.length,
  });
  res.send(entry.buffer);
});

module.exports = router;
