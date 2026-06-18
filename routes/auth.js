const express   = require('express');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

const router = express.Router();

// In-memory flag: step 1 passed, awaiting PIN
let pendingPin = null; // { expiry, attempts }

// ── Rate limiters ─────────────────────────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts — try again in 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});

const pinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many PIN attempts — please sign in again' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── POST /api/auth/login — Step 1: verify username + password ─────────────────
router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const validUser = username === process.env.APP_USERNAME;
  const validPass = validUser
    ? await bcrypt.compare(password, process.env.APP_PASSWORD_HASH)
    : false;

  if (!validUser || !validPass) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  // Open a 5-minute PIN window (max 5 guesses)
  pendingPin = { expiry: Date.now() + 5 * 60 * 1000, attempts: 0 };
  res.json({ pending: true });
});

// ── POST /api/auth/verify — Step 2: check PIN, issue JWT ─────────────────────
router.post('/verify', pinLimiter, (req, res) => {
  const { code } = req.body;

  if (!code) return res.status(400).json({ error: 'PIN required' });

  if (!pendingPin || Date.now() > pendingPin.expiry) {
    pendingPin = null;
    return res.status(401).json({ error: 'Session expired — please sign in again' });
  }

  pendingPin.attempts += 1;
  if (pendingPin.attempts > 5) {
    pendingPin = null;
    return res.status(429).json({ error: 'Too many attempts — please sign in again' });
  }

  if (code.trim() !== process.env.APP_PIN) {
    const left = 5 - pendingPin.attempts;
    return res.status(401).json({ error: `Incorrect PIN — ${left} attempt${left === 1 ? '' : 's'} remaining` });
  }

  pendingPin = null;
  const token = jwt.sign({ username: process.env.APP_USERNAME }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.json({ token });
});

// ── POST /api/auth/pin — Single-step PIN login ───────────────────────────────
router.post('/pin', pinLimiter, (req, res) => {
  const { code } = req.body;

  if (!code) return res.status(400).json({ error: 'PIN required' });
  if (!process.env.APP_PIN) return res.status(500).json({ error: 'PIN not configured' });

  if (code.trim() !== process.env.APP_PIN) {
    return res.status(401).json({ error: 'Incorrect PIN' });
  }

  const token = jwt.sign({ username: process.env.APP_USERNAME }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.json({ token });
});

module.exports = router;
