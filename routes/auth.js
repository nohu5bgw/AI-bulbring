const express   = require('express');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts — try again in 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});

// POST /api/auth/login
router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const validUser = username === process.env.APP_USERNAME;
  const validPass = validUser
    ? await bcrypt.compare(password, process.env.APP_PASSWORD_HASH)
    : false;

  // Same message for both — don't reveal which one was wrong
  if (!validUser || !validPass) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const token = jwt.sign({ username }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.json({ token });
});

module.exports = router;
