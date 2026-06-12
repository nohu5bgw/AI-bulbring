require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express    = require('express');
const helmet     = require('helmet');
const cors       = require('cors');
const path       = require('path');
const rateLimit  = require('express-rate-limit');

const agentRouter   = require('./routes/agent');
const authRouter    = require('./routes/auth');
const invoiceRouter = require('./routes/invoice');
const tbRouter      = require('./routes/tb');
const historyRouter = require('./routes/history');
const plRouter      = require('./routes/pl');
const hstRouter     = require('./routes/hst');
const receiptRouter = require('./routes/receipt');
const aiRouter      = require('./routes/ai');
const auditRouter   = require('./routes/audit');

const app  = express();
const PORT = process.env.PORT || 3001;

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net'],
      styleSrc:   ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'"],
      imgSrc:     ["'self'", 'data:'],
    },
  },
}));

// CORS — only allow a configured origin; default to same-origin (no CORS headers)
const configuredOrigin = process.env.ALLOWED_ORIGIN;
const corsOrigin = configuredOrigin && configuredOrigin !== '*' ? configuredOrigin : false;
app.use(cors({
  origin: corsOrigin,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Cap JSON bodies — prevents memory exhaustion from huge payloads
app.use(express.json({ limit: '512kb' }));

// ── Rate limiters ─────────────────────────────────────────────────────────────
// General guard on all API routes (blocks scanning/enumeration)
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 min
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please slow down' },
});

// Tighter limit on the AI/file-generation routes (each call costs money)
const expensiveLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,  // 1 hour
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Hourly limit reached — try again later' },
});

app.use('/api/', generalLimiter);
app.use('/api/agent',                  expensiveLimiter);
app.use('/api/tb/generate-from-file',  expensiveLimiter);
app.use('/api/invoice/generate',       expensiveLimiter);
app.use('/api/tb/generate',            expensiveLimiter);
app.use('/api/receipt/scan',           expensiveLimiter);
app.use('/api/pl/generate',            expensiveLimiter);
app.use('/api/hst/generate',           expensiveLimiter);
app.use('/api/ai/chat',                expensiveLimiter);
app.use('/api/audit/analyze',         expensiveLimiter);

// API routes
app.use('/api/auth',    authRouter);
app.use('/api/agent',  agentRouter);
app.use('/api/invoice', invoiceRouter);
app.use('/api/tb',      tbRouter);
app.use('/api/history', historyRouter);
app.use('/api/pl',      plRouter);
app.use('/api/hst',     hstRouter);
app.use('/api/receipt', receiptRouter);
app.use('/api/ai',      aiRouter);
app.use('/api/audit',  auditRouter);

// Serve frontend
app.use(express.static(path.join(__dirname, 'public')));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Running on http://localhost:${PORT}`);
});
