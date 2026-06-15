import express from 'express';
import { getSchedulerStatus, startScheduler, stopScheduler } from '../services/scheduler.js';

const router = express.Router();
const isProduction = process.env.NODE_ENV === 'production';

router.get('/scheduler', async (req, res) => {
  try {
    res.json({
      success: true,
      data: await getSchedulerStatus(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: isProduction ? '操作失败' : error.message,
    });
  }
});

router.post('/scheduler/start', (req, res) => {
  try {
    startScheduler();
    res.json({
      success: true,
      message: 'Scheduler started',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: isProduction ? '操作失败' : error.message,
    });
  }
});

router.post('/scheduler/stop', (req, res) => {
  try {
    stopScheduler();
    res.json({
      success: true,
      message: 'Scheduler stopped',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: isProduction ? '操作失败' : error.message,
    });
  }
});

export default router;
