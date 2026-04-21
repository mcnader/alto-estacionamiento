const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const createSessionStore = require('./lib/session-store');

require('./db/database');
const { router: authRouter } = require('./routes/auth');
const apiRouter = require('./routes/api');

const app = express();

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(session({
  store: createSessionStore(DATA_DIR),
  secret: process.env.SESSION_SECRET || 'change-me-in-prod',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 7,
  },
}));

app.use('/api/auth', authRouter);
app.use('/api', apiRouter);

app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Error interno' });
});

const PORT = Number(process.env.PORT);
if (!PORT) throw new Error('PORT env var requerida');
app.listen(PORT, () => {
  console.log(`Servidor escuchando en puerto ${PORT}`);
});
