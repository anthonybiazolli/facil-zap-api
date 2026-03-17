// ============================================
// MESSAGE QUEUE SERVICE
// BullMQ para processamento assíncrono de mensagens
// ============================================

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Redis connection
const redis = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379');

// Message queue
const messageQueue = new Queue('messages', { connection: redis });

// Middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '50mb' }));

// Logger
const logger = {
  info: (msg: string, meta?: any) => console.log(`[INFO] ${msg}`, meta || ''),
  error: (msg: string, meta?: any) => console.error(`[ERROR] ${msg}`, meta || ''),
};

// Worker para processar mensagens
const worker = new Worker('messages', async (job) => {
  const { instanceId, remoteJid, type, content, antiBanConfig } = job.data;
  
  logger.info(`Processing message job ${job.id}`, { instanceId, remoteJid });
  
  try {
    const response = await axios.post(
      `${process.env.SESSION_KEEPER_URL || 'http://session-keeper:3000'}/sessions/${instanceId}/messages`,
      { remoteJid, type, content, antiBanConfig },
      { timeout: 30000 }
    );
    
    logger.info(`Message sent successfully`, { jobId: job.id });
    return response.data;
  } catch (error: any) {
    logger.error(`Failed to send message`, { jobId: job.id, error: error.message });
    throw error;
  }
}, { connection: redis });

worker.on('completed', (job) => {
  logger.info(`Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  logger.error(`Job ${job?.id} failed`, { error: err.message });
});

// ============================================
// ROUTES
// ============================================

// Health check
app.get('/health', async (req, res) => {
  const queueCount = await messageQueue.getJobCounts();
  
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    queue: queueCount,
  });
});

// POST /queue/messages - Add message to queue
app.post('/queue/messages', async (req, res) => {
  try {
    const { instanceId, remoteJid, type, content, priority = 5, scheduledFor, antiBanConfig } = req.body;
    
    const job = await messageQueue.add(
      'send-message',
      { instanceId, remoteJid, type, content, antiBanConfig },
      {
        priority,
        delay: scheduledFor ? new Date(scheduledFor).getTime() - Date.now() : 0,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      }
    );
    
    res.status(201).json({
      success: true,
      data: {
        jobId: job.id,
        status: 'queued',
      },
    });
  } catch (error: any) {
    logger.error('Failed to queue message', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to queue message',
    });
  }
});

// POST /queue/batch - Add batch messages to queue
app.post('/queue/batch', async (req, res) => {
  try {
    const { messages, options = {} } = req.body;
    
    const jobs = await Promise.all(
      messages.map((msg: any, index: number) =>
        messageQueue.add(
          'send-message',
          msg,
          {
            priority: options.priority || 5,
            delay: options.delay ? options.delay * index : 0,
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 5000,
            },
          }
        )
      )
    );
    
    res.status(201).json({
      success: true,
      data: {
        jobIds: jobs.map(j => j.id),
        count: jobs.length,
      },
    });
  } catch (error: any) {
    logger.error('Failed to queue batch messages', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to queue batch messages',
    });
  }
});

// POST /queue/schedule - Schedule message
app.post('/queue/schedule', async (req, res) => {
  try {
    const { instanceId, remoteJid, type, content, scheduledFor, antiBanConfig } = req.body;
    
    const delay = new Date(scheduledFor).getTime() - Date.now();
    
    if (delay < 0) {
      res.status(400).json({
        success: false,
        error: 'Scheduled time must be in the future',
      });
      return;
    }
    
    const job = await messageQueue.add(
      'send-message',
      { instanceId, remoteJid, type, content, antiBanConfig },
      {
        delay,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      }
    );
    
    res.status(201).json({
      success: true,
      data: {
        jobId: job.id,
        status: 'scheduled',
        scheduledFor,
      },
    });
  } catch (error: any) {
    logger.error('Failed to schedule message', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to schedule message',
    });
  }
});

// GET /queue/jobs/:jobId - Get job status
app.get('/queue/jobs/:jobId', async (req, res) => {
  try {
    const job = await messageQueue.getJob(req.params.jobId);
    
    if (!job) {
      res.status(404).json({
        success: false,
        error: 'Job not found',
      });
      return;
    }
    
    const state = await job.getState();
    
    res.json({
      success: true,
      data: {
        id: job.id,
        state,
        data: job.data,
        returnvalue: job.returnvalue,
        failedReason: job.failedReason,
        attemptsMade: job.attemptsMade,
        timestamp: job.timestamp,
        processedOn: job.processedOn,
        finishedOn: job.finishedOn,
      },
    });
  } catch (error: any) {
    logger.error('Failed to get job status', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to get job status',
    });
  }
});

// POST /queue/jobs/:jobId/cancel - Cancel job
app.post('/queue/jobs/:jobId/cancel', async (req, res) => {
  try {
    const job = await messageQueue.getJob(req.params.jobId);
    
    if (!job) {
      res.status(404).json({
        success: false,
        error: 'Job not found',
      });
      return;
    }
    
    await job.remove();
    
    res.json({
      success: true,
      message: 'Job cancelled',
    });
  } catch (error: any) {
    logger.error('Failed to cancel job', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to cancel job',
    });
  }
});

// GET /queue/:instanceId/stats - Get queue stats for instance
app.get('/queue/:instanceId/stats', async (req, res) => {
  try {
    const jobs = await messageQueue.getJobs(['waiting', 'active', 'completed', 'failed']);
    const instanceJobs = jobs.filter(j => j.data.instanceId === req.params.instanceId);
    
    res.json({
      success: true,
      data: {
        waiting: instanceJobs.filter(j => j.id && !j.processedOn).length,
        processing: instanceJobs.filter(j => j.processedOn && !j.finishedOn).length,
        completed: instanceJobs.filter(j => j.finishedOn).length,
        failed: instanceJobs.filter(j => j.failedReason).length,
      },
    });
  } catch (error: any) {
    logger.error('Failed to get queue stats', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to get queue stats',
    });
  }
});

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error', { error: err.message });
  res.status(500).json({
    success: false,
    error: 'Internal server error',
  });
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
  });
});

// Start server
app.listen(PORT, () => {
  logger.info(`Message Queue service running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await worker.close();
  await messageQueue.close();
  await redis.quit();
  process.exit(0);
});
