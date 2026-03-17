// ============================================
// MESSAGE QUEUE SERVICE
// Camada de Mensageria - High-Throughput
// Backpressure Handling com Redis/BullMQ
// ============================================

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';

import { QueueManager } from './services/QueueManager';
import { QueueController } from './controllers/queueController';
import { createLogger } from './utils/logger';
import { validate, addMessageSchema, addBatchSchema, scheduleMessageSchema } from './middleware/validation';

dotenv.config();

const logger = createLogger('MessageQueue');
const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// MIDDLEWARE
// ============================================

app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request logging
app.use((req, res, next) => {
  logger.info({ method: req.method, path: req.path }, 'Request received');
  next();
});

// ============================================
// QUEUE MANAGER INITIALIZATION
// ============================================

const queueManager = new QueueManager(
  process.env.REDIS_URL || 'redis://localhost:6379',
  {
    maxRequestsPerMinute: parseInt(process.env.RATE_LIMIT_PER_MINUTE || '30', 10),
    maxConcurrentJobs: parseInt(process.env.MAX_CONCURRENT_JOBS || '10', 10),
    minIntervalMs: 1500,
    maxIntervalMs: 4500,
  }
);

const queueController = new QueueController(queueManager);

// Event listeners
queueManager.on('job:added', ({ jobId }) => {
  logger.debug({ jobId }, 'Job added to queue');
});

queueManager.on('job:completed', ({ jobId, result }) => {
  logger.info({ jobId, result }, 'Job completed');
});

queueManager.on('job:failed', ({ jobId, error }) => {
  logger.error({ jobId, error }, 'Job failed');
});

queueManager.on('batch:created', ({ batchId, total }) => {
  logger.info({ batchId, total }, 'Batch created');
});

queueManager.on('batch:completed', ({ batchId }) => {
  logger.info({ batchId }, 'Batch completed');
});

// ============================================
// HEALTH CHECK
// ============================================

app.get('/health', async (req, res) => {
  const stats = await queueManager.getQueueStats();
  
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    metrics: {
      queueStats: stats,
    },
  });
});

// ============================================
// MESSAGE JOBS ROUTES
// ============================================

// Add single message to queue
app.post('/queue/messages', validate(addMessageSchema), queueController.addMessage);

// Add batch of messages
app.post('/queue/batch', validate(addBatchSchema), queueController.addBatch);

// Schedule message for future delivery
app.post('/queue/schedule', validate(scheduleMessageSchema), queueController.scheduleMessage);

// ============================================
// QUEUE MANAGEMENT ROUTES
// ============================================

// Get queue statistics
app.get('/queue/stats', queueController.getStats);

// Get job status
app.get('/queue/jobs/:jobId', queueController.getJobStatus);

// Pause queue processing
app.post('/queue/pause', queueController.pauseQueue);

// Resume queue processing
app.post('/queue/resume', queueController.resumeQueue);

// Retry failed jobs
app.post('/queue/retry-failed', queueController.retryFailed);

// Cancel a job
app.post('/queue/jobs/:jobId/cancel', queueController.cancelJob);

// Clean completed/failed jobs
app.post('/queue/clean', queueController.cleanQueue);

// ============================================
// REAL-TIME EVENTS (SSE)
// ============================================

app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendEvent = (event: string, data: any) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Subscribe to queue events
  const onJobCompleted = (data: any) => sendEvent('job:completed', data);
  const onJobFailed = (data: any) => sendEvent('job:failed', data);
  const onBatchCompleted = (data: any) => sendEvent('batch:completed', data);

  queueManager.on('job:completed', onJobCompleted);
  queueManager.on('job:failed', onJobFailed);
  queueManager.on('batch:completed', onBatchCompleted);

  // Send initial connection message
  sendEvent('connected', { timestamp: Date.now() });

  // Heartbeat
  const heartbeat = setInterval(() => {
    sendEvent('heartbeat', { timestamp: Date.now() });
  }, 30000);

  // Cleanup on disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    queueManager.off('job:completed', onJobCompleted);
    queueManager.off('job:failed', onJobFailed);
    queueManager.off('batch:completed', onBatchCompleted);
  });
});

// ============================================
// ERROR HANDLING
// ============================================

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error({ err, path: req.path }, 'Unhandled error');
  
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
  });
});

// ============================================
// SERVER STARTUP
// ============================================

app.listen(PORT, () => {
  logger.info(`Message Queue service running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await queueManager.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await queueManager.close();
  process.exit(0);
});