// ============================================
// MESSAGE WORKER
// Processamento de filas com Anti-Ban Integration
// ============================================

import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import axios from 'axios';
import dotenv from 'dotenv';

import { MessageJobData, JobResult } from '../types';
import { createLogger } from '../utils/logger';

dotenv.config();

const logger = createLogger('MessageWorker');

// Configuration
const SESSION_KEEPER_URL = process.env.SESSION_KEEPER_URL || 'http://session-keeper:3000';
const ANTI_BAN_URL = process.env.ANTI_BAN_URL || 'http://anti-ban-engine:3000';
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '5', 10);

// Redis connection
const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

// ============================================
// MESSAGE PROCESSOR
// ============================================

async function processMessage(job: Job<MessageJobData>): Promise<JobResult> {
  const { data } = job;
  
  logger.info({ 
    jobId: job.id, 
    instanceId: data.instanceId,
    type: data.type,
    remoteJid: data.remoteJid,
  }, 'Processing message job');

  try {
    // Update progress
    await job.updateProgress(10);

    // Apply Anti-Ban delays if enabled
    if (data.antiBanConfig?.enabled) {
      await job.updateProgress(20);
      await applyAntiBanMeasures(data);
    }

    await job.updateProgress(50);

    // Send message via Session Keeper
    const result = await sendMessageToSessionKeeper(data);

    await job.updateProgress(100);

    logger.info({ jobId: job.id, messageId: result.messageId }, 'Message sent successfully');

    return {
      success: true,
      messageId: result.messageId,
      timestamp: result.timestamp,
    };
  } catch (error) {
    logger.error({ jobId: job.id, error }, 'Failed to process message');

    // Determine if error is retryable
    const retryable = isRetryableError(error);

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      retryable,
    };
  }
}

async function applyAntiBanMeasures(data: MessageJobData): Promise<void> {
  try {
    // Request Anti-Ban engine for timing calculations
    const response = await axios.post(`${ANTI_BAN_URL}/calculate-delay`, {
      instanceId: data.instanceId,
      messageType: data.type,
      contentLength: JSON.stringify(data.content).length,
      config: data.antiBanConfig,
    }, {
      timeout: 5000,
    });

    const { delay, typingDuration, shouldSimulateTyping } = response.data;

    // Apply delay
    if (delay > 0) {
      logger.debug({ delay }, 'Applying Anti-Ban delay');
      await sleep(delay);
    }

    // Simulate typing if needed
    if (shouldSimulateTyping && data.type === 'text') {
      await simulateTyping(data.instanceId, data.remoteJid, typingDuration);
    }
  } catch (error) {
    // Log but don't fail - Anti-Ban is best effort
    logger.warn({ error }, 'Anti-Ban measure failed, continuing anyway');
  }
}

async function simulateTyping(
  instanceId: string, 
  remoteJid: string, 
  duration: number
): Promise<void> {
  try {
    // Set typing presence
    await axios.post(`${SESSION_KEEPER_URL}/sessions/${instanceId}/presence`, {
      presence: 'composing',
      remoteJid,
    }, {
      timeout: 5000,
    });

    // Wait for typing duration
    await sleep(duration);

    // Set paused presence
    await axios.post(`${SESSION_KEEPER_URL}/sessions/${instanceId}/presence`, {
      presence: 'paused',
      remoteJid,
    }, {
      timeout: 5000,
    });
  } catch (error) {
    logger.warn({ error }, 'Typing simulation failed');
  }
}

async function sendMessageToSessionKeeper(data: MessageJobData): Promise<{ messageId: string; timestamp: number }> {
  const response = await axios.post(
    `${SESSION_KEEPER_URL}/sessions/${data.instanceId}/messages`,
    {
      remoteJid: data.remoteJid,
      type: data.type,
      content: data.content,
      options: data.options,
    },
    {
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' },
    }
  );

  if (!response.data.success) {
    throw new Error(response.data.error || 'Failed to send message');
  }

  return response.data.data;
}

function isRetryableError(error: any): boolean {
  if (axios.isAxiosError(error)) {
    // Retry on network errors or 5xx responses
    if (!error.response) return true;
    if (error.response.status >= 500) return true;
    if (error.response.status === 429) return true; // Rate limited
    
    // Don't retry on 4xx client errors (except 429)
    if (error.response.status >= 400 && error.response.status < 500) {
      return false;
    }
  }
  
  return true;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// WORKER SETUP
// ============================================

const worker = new Worker<MessageJobData>('messages', processMessage, {
  connection,
  concurrency: CONCURRENCY,
  limiter: {
    max: 30,
    duration: 60000, // 30 jobs per minute
  },
  settings: {
    backoffStrategy: (attemptsMade: number) => {
      // Exponential backoff with jitter
      const baseDelay = Math.pow(2, attemptsMade) * 1000;
      const jitter = Math.random() * 1000;
      return baseDelay + jitter;
    },
  },
});

// Event handlers
worker.on('completed', (job, result) => {
  logger.info({ jobId: job.id, result }, 'Job completed');
});

worker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, error: err }, 'Job failed');
});

worker.on('error', (err) => {
  logger.error({ error: err }, 'Worker error');
});

worker.on('stalled', (jobId) => {
  logger.warn({ jobId }, 'Job stalled');
});

worker.on('progress', (job, progress) => {
  logger.debug({ jobId: job.id, progress }, 'Job progress');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing worker...');
  await worker.close();
  await connection.quit();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, closing worker...');
  await worker.close();
  await connection.quit();
  process.exit(0);
});

logger.info({ concurrency: CONCURRENCY }, 'Message worker started');