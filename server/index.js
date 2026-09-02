import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '.env') });

function normalizeApprovalSource(value) {
  const source = String(value || 'dingtalk').trim().toLowerCase();
  if (['oa_db', 'dingtalk_oa', 'oa', 'database', 'db'].includes(source)) {
    return 'oa_db';
  }
  return 'dingtalk';
}

const approvalSource = normalizeApprovalSource(
  process.env.DINGTALK_SYNC_SOURCE || process.env.APPROVAL_SOURCE || 'dingtalk'
);
const requiredEnvVars = ['PGHOST', 'PGDATABASE', 'PGUSER', 'PGPASSWORD', 'DINGTALK_PROCESS_CODE'];
if (approvalSource === 'dingtalk') {
  requiredEnvVars.push('DINGTALK_APP_KEY', 'DINGTALK_APP_SECRET');
}
const missing = requiredEnvVars.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`[FATAL] Missing required environment variables: ${missing.join(', ')}`);
  console.error('Please copy .env.example to .env and fill in the values.');
  console.error(`[FATAL] Working directory: ${process.cwd()}`);
  console.error(`[FATAL] .env path: ${join(__dirname, '.env')}`);
  process.exit(1);
}

console.log(`[CONFIG] Approval source: ${approvalSource}`);
console.log(`[CONFIG] DINGTALK_APP_KEY: ${process.env.DINGTALK_APP_KEY ? 'loaded (' + process.env.DINGTALK_APP_KEY.substring(0, 6) + '...)' : 'MISSING'}`);
console.log(`[CONFIG] Working directory: ${process.cwd()}`);
console.log(`[CONFIG] .env loaded from: ${join(__dirname, '.env')}`);

import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import syncRouter from './routes/sync.js';
import listRouter from './routes/list.js';
import configRouter from './routes/config.js';
import dingtalkRouter from './routes/dingtalk.js';
import authRouter from './routes/auth.js';
import { loadSession } from './services/auth.js';
import { startScheduler } from './services/scheduler.js';

const app = express();
const PORT = process.env.PORT || 3001;
const isProduction = process.env.NODE_ENV === 'production';

process.on('unhandledRejection', (reason) => {
  console.error('[PROCESS] Unhandled rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[PROCESS] Uncaught exception:', error);
});

// CORS - require explicit origin in production
const corsOrigin = process.env.CORS_ORIGIN;
app.use(cors({
  origin: corsOrigin || 'http://localhost:5173',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60000),
  max: Number(process.env.RATE_LIMIT_MAX || 100),
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: '请求过于频繁，请稍后再试' },
});
app.use('/api/', limiter);
app.use('/api/', loadSession);

// API Key authentication
const API_KEY = process.env.API_KEY;
if (API_KEY) {
  app.use('/api/', (req, res, next) => {
    if (req.path === '/health' || req.path.startsWith('/auth/')) return next();
    if (req.authUser && !req.path.startsWith('/dingtalk')) return next();
    const key = req.headers['x-api-key'] || req.query.apiKey;
    if (key !== API_KEY) {
      return res.status(401).json({ success: false, message: '未授权：无效的 API Key' });
    }
    next();
  });
}

app.use((req, res, next) => {
  console.log(`[HTTP] ${req.method} ${req.path}`);
  next();
});

app.use('/api/sync', syncRouter);
app.use('/api/list', listRouter);
app.use('/api/config', configRouter);
app.use('/api/dingtalk', dingtalkRouter);
app.use('/api/auth', authRouter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Global error handler - hide details in production
app.use((err, req, res, _next) => {
  console.error('[ERROR]', err);
  res.status(500).json({
    success: false,
    message: isProduction ? '服务器内部错误' : err.message,
  });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[SERVER] Running on http://localhost:${PORT}`);
  console.log(`[SERVER] API Key auth: ${API_KEY ? 'enabled' : 'disabled (set API_KEY to enable)'}`);
  startScheduler();
});

server.on('error', (error) => {
  console.error('[SERVER] Listen error:', error);
  process.exitCode = 1;
});
