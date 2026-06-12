const express   = require('express');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

const router = express.Router();

// ── In-memory pending 2FA state (single-user app) ────────────────────────────
// { code, expiry, attempts }
let pending2FA = null;

function getTwilioClient() {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return null;
  return require('twilio')(sid, token);
}

// ── Rate limiters ─────────────────────────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts — try again in 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Brute-force guard on the verify step (6-digit code has 1M combinations)
const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many code attempts — please sign in again' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── POST /api/auth/login — Step 1: verify password, send SMS code ─────────────
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

  const twilio = getTwilioClient();

  // If Twilio is not configured, skip 2FA and issue token directly
  if (!twilio || !process.env.TWILIO_FROM_NUMBER || !process.env.OWNER_PHONE) {
    const token = jwt.sign({ username }, process.env.JWT_SECRET, { expiresIn: '7d' });
    return res.json({ token });
  }

  // Generate a 6-digit code, valid for 5 minutes, max 5 guesses
  const code = String(Math.floor(100000 + Math.random() * 900000));
  pending2FA = { code, expiry: Date.now() + 5 * 60 * 1000, attempts: 0 };

  try {
    await twilio.messages.create({
      body: `Your Bulbring AI sign-in code: ${code}  (expires in 5 minutes)`,
      from: process.env.TWILIO_FROM_NUMBER,
      to:   process.env.OWNER_PHONE,
    });
  } catch (err) {
    console.error('Twilio SMS error:', err.message);
    pending2FA = null;
    return res.status(502).json({ error: 'Could not send verification code — check Twilio configuration' });
  }

  res.json({ pending: true });
});

// ── POST /api/auth/verify — Step 2: check code, issue JWT ────────────────────
router.post('/verify', verifyLimiter, async (req, res) => {
  const { code } = req.body;

  if (!code) return res.status(400).json({ error: 'Verification code required' });

  if (!pending2FA || Date.now() > pending2FA.expiry) {
    pending2FA = null;
    return res.status(401).json({ error: 'Code expired — please sign in again' });
  }

  pending2FA.attempts += 1;
  if (pending2FA.attempts > 5) {
    pending2FA = null;
    return res.status(429).json({ error: 'Too many attempts — please sign in again' });
  }

  if (code.trim() !== pending2FA.code) {
    const left = 5 - pending2FA.attempts;
    return res.status(401).json({ error: `Invalid code — ${left} attempt${left === 1 ? '' : 's'} remaining` });
  }

  pending2FA = null; // consume — one-time use
  const token = jwt.sign({ username: process.env.APP_USERNAME }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.json({ token });
});

module.exports = router;
