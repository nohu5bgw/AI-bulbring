require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express   = require('express');
const helmet    = require('helmet');
const cors      = require('cors');
const path      = require('path');

const agentRouter   = require('./routes/agent');
const authRouter    = require('./routes/auth');
const invoiceRouter = require('./routes/invoice');
const tbRouter      = require('./routes/tb');

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

// Restrict CORS to same origin in production
const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
app.use(cors({ origin: allowedOrigin }));

app.use(express.json());

// API routes
app.use('/api/auth',    authRouter);
app.use('/api/agent',  agentRouter);
app.use('/api/invoice', invoiceRouter);
app.use('/api/tb',      tbRouter);

// Serve frontend
app.use(express.static(path.join(__dirname, 'public')));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Running on http://localhost:${PORT}`);
});
