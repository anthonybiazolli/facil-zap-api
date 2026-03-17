// ============================================
// QUEUE CONTROLLER
// REST API endpoints for queue management
// ============================================

import { Request, Response } from 'express';
import { QueueManager } from '../services/QueueManager';
import { createLogger } from '../utils/logger';
import { MessageJobData, QueuePriority } from '../types';

const logger = createLogger('QueueController');

export class QueueController {
  constructor(private queueManager: QueueManager) {}

  // ============================================
  // MESSAGE JOBS
  // ============================================

  addMessage = async (req: Request, res: Response): Promise<void> => {
    try {
      const data: MessageJobData = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        createdAt: new Date(),
        ...req.body,
      };

      const priority = req.body.priority || QueuePriority.NORMAL;
      const job = await this.queueManager.addMessageJob(data, priority);

      res.status(201).json({
        success: true,
        data: {
          jobId: job.id,
          state: await job.getState(),
          position: await job.getState() === 'waiting' ? 
            await this.getQueuePosition(job.id as string) : null,
        },
      });
    } catch (error) {
      logger.error({ error }, 'Failed to add message to queue');
      res.status(500).json({
        success: false,
        error: 'Failed to add message to queue',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  addBatch = async (req: Request, res: Response): Promise<void> => {
    try {
      const { messages, options = {} } = req.body;

      if (!Array.isArray(messages) || messages.length === 0) {
        res.status(400).json({
          success: false,
          error: 'Messages array is required and must not be empty',
        });
        return;
      }

      if (messages.length > 5000) {
        res.status(400).json({
          success: false,
          error: 'Maximum 5000 messages per batch allowed',
        });
        return;
      }

      const jobData = messages.map((msg: any) => ({
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        createdAt: new Date(),
        ...msg,
      }));

      const job = await this.queueManager.addBatchJob(jobData, {
        antiBanEnabled: options.antiBanEnabled ?? true,
        shuffleOrder: options.shuffleOrder ?? true,
      });

      res.status(201).json({
        success: true,
        data: {
          batchId: job.data.batchId,
          totalMessages: messages.length,
          state: await job.getState(),
        },
      });
    } catch (error) {
      logger.error({ error }, 'Failed to create batch job');
      res.status(500).json({
        success: false,
        error: 'Failed to create batch job',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  scheduleMessage = async (req: Request, res: Response): Promise<void> => {
    try {
      const { scheduledFor, ...messageData } = req.body;
      const scheduleDate = new Date(scheduledFor);

      if (isNaN(scheduleDate.getTime()) || scheduleDate <= new Date()) {
        res.status(400).json({
          success: false,
          error: 'Invalid scheduled time. Must be a future date.',
        });
        return;
      }

      const data: MessageJobData = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        createdAt: new Date(),
        ...messageData,
      };

      const job = await this.queueManager.scheduleMessage(data, scheduleDate);

      res.status(201).json({
        success: true,
        data: {
          jobId: job.id,
          scheduledFor: scheduleDate,
          state: await job.getState(),
        },
      });
    } catch (error) {
      logger.error({ error }, 'Failed to schedule message');
      res.status(500).json({
        success: false,
        error: 'Failed to schedule message',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  // ============================================
  // QUEUE MANAGEMENT
  // ============================================

  getStats = async (req: Request, res: Response): Promise<void> => {
    try {
      const stats = await this.queueManager.getQueueStats();

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get queue stats');
      res.status(500).json({
        success: false,
        error: 'Failed to get queue stats',
      });
    }
  };

  getJobStatus = async (req: Request, res: Response): Promise<void> => {
    try {
      const { jobId } = req.params;
      const status = await this.queueManager.getJobStatus(jobId);

      if (!status) {
        res.status(404).json({
          success: false,
          error: 'Job not found',
        });
        return;
      }

      res.json({
        success: true,
        data: status,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get job status');
      res.status(500).json({
        success: false,
        error: 'Failed to get job status',
      });
    }
  };

  pauseQueue = async (req: Request, res: Response): Promise<void> => {
    try {
      await this.queueManager.pauseQueue();

      res.json({
        success: true,
        message: 'Queue paused successfully',
      });
    } catch (error) {
      logger.error({ error }, 'Failed to pause queue');
      res.status(500).json({
        success: false,
        error: 'Failed to pause queue',
      });
    }
  };

  resumeQueue = async (req: Request, res: Response): Promise<void> => {
    try {
      await this.queueManager.resumeQueue();

      res.json({
        success: true,
        message: 'Queue resumed successfully',
      });
    } catch (error) {
      logger.error({ error }, 'Failed to resume queue');
      res.status(500).json({
        success: false,
        error: 'Failed to resume queue',
      });
    }
  };

  retryFailed = async (req: Request, res: Response): Promise<void> => {
    try {
      await this.queueManager.retryFailedJobs();

      res.json({
        success: true,
        message: 'Failed jobs queued for retry',
      });
    } catch (error) {
      logger.error({ error }, 'Failed to retry jobs');
      res.status(500).json({
        success: false,
        error: 'Failed to retry jobs',
      });
    }
  };

  cancelJob = async (req: Request, res: Response): Promise<void> => {
    try {
      const { jobId } = req.params;
      const cancelled = await this.queueManager.cancelJob(jobId);

      if (!cancelled) {
        res.status(400).json({
          success: false,
          error: 'Job cannot be cancelled (may already be processing or completed)',
        });
        return;
      }

      res.json({
        success: true,
        message: 'Job cancelled successfully',
      });
    } catch (error) {
      logger.error({ error }, 'Failed to cancel job');
      res.status(500).json({
        success: false,
        error: 'Failed to cancel job',
      });
    }
  };

  cleanQueue = async (req: Request, res: Response): Promise<void> => {
    try {
      const { gracePeriod = 3600000, status = ['completed'] } = req.body;
      
      await this.queueManager.cleanQueue(gracePeriod, status);

      res.json({
        success: true,
        message: 'Queue cleaned successfully',
      });
    } catch (error) {
      logger.error({ error }, 'Failed to clean queue');
      res.status(500).json({
        success: false,
        error: 'Failed to clean queue',
      });
    }
  };

  // ============================================
  // PRIVATE METHODS
  // ============================================

  private async getQueuePosition(jobId: string): Promise<number | null> {
    // This is a simplified implementation
    // In production, you'd want to use BullMQ's getJobs method
    return null;
  }
}