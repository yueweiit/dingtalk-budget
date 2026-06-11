import express from 'express';
import cors from 'cors';
import syncRouter from './routes/sync.js';
import listRouter from './routes/list.js';
import configRouter from './routes/config.js';
import dingtalkRouter from './routes/dingtalk.js';
import { startScheduler } from './services/scheduler.js';

const app = express();
const PORT = process.env.PORT || 3001;

process.on('unhandledRejection', (reason) => {
  console.error('[PROCESS] Unhandled rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[PROCESS] Uncaught exception:', error);
});

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '2mb' }));

app.use((req, res, next) => {
  console.log(`[HTTP] ${req.method} ${req.path}`);
  next();
});

app.use('/api/sync', syncRouter);
app.use('/api/list', listRouter);
app.use('/api/config', configRouter);
app.use('/api/dingtalk', dingtalkRouter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[SERVER] Running on http://0.0.0.0:${PORT}`);
  console.log(`[SERVER] Running on http://localhost:${PORT}`);
  startScheduler();
});

server.on('error', (error) => {
  console.error('[SERVER] Listen error:', error);
  process.exitCode = 1;
});
