// ============================================
// QUEUE MANAGER
// Camada de Mensageria - High-Throughput
// Backpressure Handling com Redis/BullMQ (v4+)
// ============================================

import { Queue, Job, FlowProducer, QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

import { createLogger } from '../utils/logger';
import {
  MessageJobData,
  QueueStats,
  BatchJobData,
  ScheduledJobData,
  QueuePriority,
  RateLimitConfig,
} from '../types';

const logger = createLogger('QueueManager');

export class QueueManager extends EventEmitter {
  private connection: Redis;
  private messageQueue: Queue<MessageJobData>;
  private batchQueue: Queue<BatchJobData>;
  private scheduledQueue: Queue<ScheduledJobData>;
  private flowProducer: FlowProducer;
  
  // Eventos de fila do BullMQ v4 (separados da classe Queue)
  private queueEvents: QueueEvents;
  private batchQueueEvents: QueueEvents;

  // Rate limiting
  private rateLimiter: Map<string, number[]> = new Map();
  private rateLimitConfig: RateLimitConfig;
  
  // Metrics
  private metrics = {
    jobsProcessed: 0,
    jobsFailed: 0,
    jobsDelayed: 0,
    averageProcessingTime: 0,
  };

  constructor(redisUrl: string, rateLimitConfig?: Partial<RateLimitConfig>) {
    super();
    
    this.connection = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    this.rateLimitConfig = {
      maxRequestsPerMinute: 30,
      maxConcurrentJobs: 10,
      minIntervalMs: 1500,
      maxIntervalMs: 4500,
      ...rateLimitConfig,
    };

    // Initialize queues
    this.messageQueue = new Queue<MessageJobData>('messages', {
      connection: this.connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: {
          age: 3600, // 1 hour
          count: 1000,
        },
        removeOnFail: {
          age: 86400, // 24 hours
          count: 5000,
        },
      },
    });

    this.batchQueue = new Queue<BatchJobData>('batches', {
      connection: this.connection,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 },
      },
    });

    this.scheduledQueue = new Queue<ScheduledJobData>('scheduled', {
      connection: this.connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'fixed', delay: 10000 },
      },
    });

    this.flowProducer = new FlowProducer({ connection: this.connection });

    // BullMQ v4 requer QueueEvents para ouvir os estados do worker
    this.queueEvents = new QueueEvents('messages', { connection: this.connection });
    this.batchQueueEvents = new QueueEvents('batches', { connection: this.connection });

    this.setupEventHandlers();
    this.startMetricsCollection();
  }

  // ============================================
  // JOB CREATION
  // ============================================

  async addMessageJob(
    data: MessageJobData,
    priority: QueuePriority = QueuePriority.NORMAL
  ): Promise<Job<MessageJobData>> {
    const jobId = `msg_${uuidv4()}`;
    
    // Calcular delay baseado no rate limiting
    const delay = this.calculateNextAvailableSlot(data.instanceId);
    
    const job = await this.messageQueue.add(jobId, data, {
      priority: this.mapPriority(priority),
      delay,
      jobId,
      attempts: data.maxAttempts || 3,
    });

    logger.info({ jobId, instanceId: data.instanceId, delay }, 'Message job added to queue');
    
    this.emit('job:added', { jobId, type: 'message', data });
    
    return job;
  }

  async addBatchJob(
    messages: MessageJobData[],
    options: {
      batchId?: string;
      antiBanEnabled?: boolean;
      shuffleOrder?: boolean;
    } = {}
  ): Promise<Job<BatchJobData>> {
    const batchId = options.batchId || `batch_${uuidv4()}`;
    
    // Embaralhar ordem se solicitado (Anti-Ban)
    let processedMessages = [...messages];
    if (options.shuffleOrder) {
      processedMessages = this.shuffleArray(processedMessages);
    }

    // Criar jobs filhos
    const children = processedMessages.map((msg, index) => ({
      name: `msg_${index}`,
      data: msg,
      queueName: 'messages',
      opts: {
        priority: this.mapPriority(QueuePriority.NORMAL),
        delay: this.calculateBatchDelay(index),
      },
    }));

    // Criar flow
    const flow = await this.flowProducer.add({
      name: batchId,
      queueName: 'batches',
      data: {
        batchId,
        totalMessages: messages.length,
        antiBanEnabled: options.antiBanEnabled ?? true,
        createdAt: new Date(),
      },
      children,
    });

    logger.info({ batchId, totalMessages: messages.length }, 'Batch job created');
    
    this.emit('batch:created', { batchId, total: messages.length });

    return flow.job as Job<BatchJobData>;
  }

  async scheduleMessage(
    data: MessageJobData,
    scheduledFor: Date
  ): Promise<Job<ScheduledJobData>> {
    const jobId = `sched_${uuidv4()}`;
    const delay = scheduledFor.getTime() - Date.now();

    if (delay < 0) {
      throw new Error('Scheduled time must be in the future');
    }

    const job = await this.scheduledQueue.add(jobId, {
      ...data,
      scheduledFor,
      executedAt: null,
    }, {
      delay,
      jobId,
    });

    logger.info({ jobId, scheduledFor }, 'Message scheduled');
    
    this.emit('message:scheduled', { jobId, scheduledFor });

    return job;
  }

  // ============================================
  // RATE LIMITING & BACKPRESSURE
  // ============================================

  private calculateNextAvailableSlot(instanceId: string): number {
    const now = Date.now();
    const minuteAgo = now - 60000;
    
    // Get requests for this instance in the last minute
    let requests = this.rateLimiter.get(instanceId) || [];
    requests = requests.filter(t => t > minuteAgo);
    
    // Check if under rate limit
    if (requests.length < this.rateLimitConfig.maxRequestsPerMinute) {
      requests.push(now);
      this.rateLimiter.set(instanceId, requests);
      return 0; // No delay needed
    }

    // Calculate delay until next slot available
    const oldestRequest = requests[0];
    const delay = oldestRequest + 60000 - now;
    
    // Add jitter to avoid thundering herd
    const jitter = Math.floor(Math.random() * 1000);
    
    requests.push(now + delay + jitter);
    this.rateLimiter.set(instanceId, requests);
    
    return delay + jitter;
  }

  private calculateBatchDelay(index: number): number {
    // Intervalos variáveis para simular comportamento humano
    const baseDelay = index * this.rateLimitConfig.minIntervalMs;
    const variance = Math.random() * (this.rateLimitConfig.maxIntervalMs - this.rateLimitConfig.minIntervalMs);
    
    return Math.floor(baseDelay + variance);
  }

  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  // ============================================
  // QUEUE MANAGEMENT
  // ============================================

  async getQueueStats(): Promise<QueueStats> {
    const [
      messageCount,
      messageWaiting,
      messageActive,
      messageCompleted,
      messageFailed,
      messageDelayed,
      batchCount,
      scheduledCount,
    ] = await Promise.all([
      this.messageQueue.getJobCountByTypes('waiting', 'active', 'completed', 'failed', 'delayed'),
      this.messageQueue.getWaitingCount(),
      this.messageQueue.getActiveCount(),
      this.messageQueue.getCompletedCount(),
      this.messageQueue.getFailedCount(),
      this.messageQueue.getDelayedCount(),
      this.batchQueue.getJobCountByTypes('waiting', 'active', 'completed', 'failed'),
      this.scheduledQueue.getJobCountByTypes('waiting', 'active', 'completed', 'failed', 'delayed'),
    ]);

    return {
      messages: {
        total: messageCount,
        waiting: messageWaiting,
        active: messageActive,
        completed: messageCompleted,
        failed: messageFailed,
        delayed: messageDelayed,
      },
      batches: {
        total: batchCount,
      },
      scheduled: {
        total: scheduledCount,
      },
      processing: {
        jobsProcessed: this.metrics.jobsProcessed,
        jobsFailed: this.metrics.jobsFailed,
        jobsDelayed: this.metrics.jobsDelayed,
        averageProcessingTime: this.metrics.averageProcessingTime,
      },
    };
  }

  async getJobStatus(jobId: string): Promise<any> {
    const job = await this.messageQueue.getJob(jobId);
    
    if (!job) {
      return null;
    }

    return {
      id: job.id,
      state: await job.getState(),
      progress: job.progress,
      attemptsMade: job.attemptsMade,
      failedReason: job.failedReason,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
      data: job.data,
      returnvalue: job.returnvalue,
    };
  }

  async pauseQueue(): Promise<void> {
    await this.messageQueue.pause();
    logger.info('Message queue paused');
  }

  async resumeQueue(): Promise<void> {
    await this.messageQueue.resume();
    logger.info('Message queue resumed');
  }

  async cleanQueue(
    gracePeriod: number = 3600000,
    status: ('completed' | 'failed' | 'wait' | 'active' | 'delayed' | 'paused') = 'completed'
  ): Promise<void> {
    // Correção: BullMQ clean aceita string status único nas últimas versões
    await this.messageQueue.clean(gracePeriod, 0, status);
    logger.info({ gracePeriod, status }, 'Queue cleaned');
  }

  async retryFailedJobs(): Promise<void> {
    const failedJobs = await this.messageQueue.getFailed();
    
    for (const job of failedJobs) {
      await job.retry();
    }
    
    logger.info({ count: failedJobs.length }, 'Failed jobs retried');
  }

  async cancelJob(jobId: string): Promise<boolean> {
    const job = await this.messageQueue.getJob(jobId);
    
    if (!job) return false;
    
    const state = await job.getState();
    
    if (state === 'waiting' || state === 'delayed') {
      await job.remove();
      logger.info({ jobId }, 'Job cancelled');
      return true;
    }
    
    return false;
  }

  // ============================================
  // EVENT HANDLERS (BullMQ v4 QueueEvents)
  // ============================================

  private setupEventHandlers(): void {
    // Queue events via QueueEvents
    this.queueEvents.on('waiting', ({ jobId }: { jobId: string }) => {
      this.emit('job:waiting', { jobId });
    });

    this.queueEvents.on('active', ({ jobId }: { jobId: string }) => {
      this.emit('job:active', { jobId });
    });

    this.queueEvents.on('completed', ({ jobId, returnvalue }: { jobId: string; returnvalue: string }) => {
      this.metrics.jobsProcessed++;
      
      // Assincronamente buscar a job para atualizar o tempo médio (evita bloquear o evento)
      this.messageQueue.getJob(jobId).then((job) => {
        if (job) this.updateAverageProcessingTime(job);
      }).catch(() => {});

      this.emit('job:completed', { jobId, result: returnvalue });
    });

    this.queueEvents.on('failed', ({ jobId, failedReason }: { jobId: string; failedReason: string }) => {
      this.metrics.jobsFailed++;
      logger.error({ jobId, error: failedReason }, 'Job failed');
      this.emit('job:failed', { jobId, error: failedReason });
    });

    this.queueEvents.on('stalled', ({ jobId }: { jobId: string }) => {
      logger.warn({ jobId }, 'Job stalled');
      this.emit('job:stalled', { jobId });
    });

    this.queueEvents.on('progress', ({ jobId, data }: { jobId: string; data: number | object }) => {
      this.emit('job:progress', { jobId, progress: data });
    });

    // Batch events
    this.batchQueueEvents.on('completed', ({ jobId }: { jobId: string }) => {
      logger.info({ batchId: jobId }, 'Batch completed');
      this.emit('batch:completed', { batchId: jobId });
    });
  }

  private updateAverageProcessingTime(job: Job): void {
    if (job.processedOn && job.finishedOn) {
      const processingTime = job.finishedOn - job.processedOn;
      const total = this.metrics.jobsProcessed;
      this.metrics.averageProcessingTime = 
        (this.metrics.averageProcessingTime * (total - 1) + processingTime) / total;
    }
  }

  private startMetricsCollection(): void {
    // Report metrics every minute
    setInterval(() => {
      this.getQueueStats().then(stats => {
        this.emit('metrics', stats);
        logger.debug(stats, 'Queue metrics');
      });
    }, 60000);
  }

  // ============================================
  // UTILITIES
  // ============================================

  private mapPriority(priority: QueuePriority): number {
    const priorities = {
      [QueuePriority.LOW]: 10,
      [QueuePriority.NORMAL]: 5,
      [QueuePriority.HIGH]: 3,
      [QueuePriority.URGENT]: 1,
    };
    return priorities[priority];
  }

  async close(): Promise<void> {
    await this.queueEvents.close();
    await this.batchQueueEvents.close();
    await this.messageQueue.close();
    await this.batchQueue.close();
    await this.scheduledQueue.close();
    await this.flowProducer.close();
    await this.connection.quit();
  }
}