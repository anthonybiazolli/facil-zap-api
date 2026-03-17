// ============================================
// MESSAGE QUEUE - TYPES
// Camada de Mensageria - High-Throughput
// ============================================

export interface MessageJobData {
  id: string;
  instanceId: string;
  remoteJid: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'location' | 'contact';
  content: Record<string, any>;
  options?: {
    delay?: number;
    presence?: 'typing' | 'recording' | 'online' | 'offline';
    linkPreview?: boolean;
  };
  priority?: number;
  maxAttempts?: number;
  antiBanConfig?: {
    enabled: boolean;
    typingSimulation?: boolean;
    minIntervalMs?: number;
    maxIntervalMs?: number;
  };
  createdAt: Date;
}

export interface BatchJobData {
  batchId: string;
  totalMessages: number;
  antiBanEnabled: boolean;
  createdAt: Date;
  completedAt?: Date;
  results?: {
    successful: number;
    failed: number;
    cancelled: number;
  };
}

export interface ScheduledJobData extends MessageJobData {
  scheduledFor: Date;
  executedAt: Date | null;
  recurrence?: {
    cron: string;
    endDate?: Date;
    maxOccurrences?: number;
  };
}

export enum QueuePriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  URGENT = 'urgent',
}

export interface RateLimitConfig {
  maxRequestsPerMinute: number;
  maxConcurrentJobs: number;
  minIntervalMs: number;
  maxIntervalMs: number;
}

export interface QueueStats {
  messages: {
    total: number;
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  };
  batches: {
    total: number;
  };
  scheduled: {
    total: number;
  };
  processing: {
    jobsProcessed: number;
    jobsFailed: number;
    jobsDelayed: number;
    averageProcessingTime: number;
  };
}

export interface JobResult {
  success: boolean;
  messageId?: string;
  timestamp?: number;
  error?: string;
  retryable?: boolean;
}

export interface BatchResult {
  batchId: string;
  total: number;
  successful: number;
  failed: number;
  cancelled: number;
  results: JobResult[];
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
}

export interface WebhookEvent {
  event: string;
  timestamp: number;
  data: {
    jobId?: string;
    batchId?: string;
    instanceId?: string;
    status?: string;
    result?: any;
    error?: string;
  };
}

export interface QueueJobOptions {
  priority?: QueuePriority;
  delay?: number;
  attempts?: number;
  backoff?: {
    type: 'fixed' | 'exponential';
    delay: number;
  };
  removeOnComplete?: boolean | number | { count?: number; age?: number };
  removeOnFail?: boolean | number | { count?: number; age?: number };
}