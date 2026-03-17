// ============================================
// ANTI-BAN ENGINE SERVICE
// Algoritmo Proprietário Anti-Ban 2.0
// ============================================

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import IORedis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Redis connection
const redis = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379');

// Middleware
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json());

// Logger
const logger = {
  info: (msg: string, meta?: any) => console.log(`[INFO] ${msg}`, meta || ''),
  error: (msg: string, meta?: any) => console.error(`[ERROR] ${msg}`, meta || ''),
};

// Risk scores storage
const riskScores = new Map<string, any>();

// ============================================
// ANTI-BAN ALGORITHMS
// ============================================

function calculateVariableInterval(min: number, max: number): number {
  const mean = (min + max) / 2;
  const stdDev = (max - min) / 6;
  const u1 = Math.random();
  const u2 = Math.random();
  const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const interval = mean + z0 * stdDev;
  return Math.max(min, Math.min(max, Math.round(interval)));
}

function calculateTypingDuration(textLength: number): number {
  const charsPerSecond = 4;
  const baseTime = (textLength / charsPerSecond) * 1000;
  const variation = baseTime * 0.2 * (Math.random() * 2 - 1);
  return Math.max(1000, Math.min(10000, baseTime + variation));
}

function calculateRiskScore(instanceId: string, activities: any[]): any {
  let score = 0;
  const factors: string[] = [];
  
  // Message rate factor
  const messageCount = activities.filter(a => a.type === 'message_sent').length;
  if (messageCount > 100) {
    score += 30;
    factors.push('High message rate');
  } else if (messageCount > 50) {
    score += 15;
    factors.push('Elevated message rate');
  }
  
  // Time pattern factor
  const offHoursMessages = activities.filter(a => {
    const hour = new Date(a.timestamp).getHours();
    return hour < 6 || hour > 23;
  }).length;
  
  if (offHoursMessages > 20) {
    score += 20;
    factors.push('Off-hours activity');
  }
  
  // Similarity factor
  const similarMessages = activities.filter(a => a.similarityScore && a.similarityScore > 0.8).length;
  if (similarMessages > 10) {
    score += 25;
    factors.push('Repetitive content');
  }
  
  // Determine risk level
  let level = 'LOW';
  if (score >= 70) level = 'CRITICAL';
  else if (score >= 50) level = 'HIGH';
  else if (score >= 30) level = 'MEDIUM';
  
  return {
    instanceId,
    score: Math.min(100, score),
    level,
    factors,
    timestamp: new Date().toISOString(),
  };
}

// ============================================
// ROUTES
// ============================================

// Health check
app.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

// POST /calculate-delay - Calculate delay for message
app.post('/calculate-delay', (req, res) => {
  try {
    const { minIntervalMs = 1000, maxIntervalMs = 5000, messageCount = 0 } = req.body;
    
    // Increase intervals based on message count
    const adjustedMin = minIntervalMs + (messageCount * 100);
    const adjustedMax = maxIntervalMs + (messageCount * 200);
    
    const delay = calculateVariableInterval(adjustedMin, adjustedMax);
    
    res.json({
      success: true,
      data: {
        delay,
        minInterval: adjustedMin,
        maxInterval: adjustedMax,
      },
    });
  } catch (error: any) {
    logger.error('Failed to calculate delay', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to calculate delay',
    });
  }
});

// POST /calculate-typing - Calculate typing simulation
app.post('/calculate-typing', (req, res) => {
  try {
    const { textLength } = req.body;
    
    const duration = calculateTypingDuration(textLength);
    
    res.json({
      success: true,
      data: {
        duration,
        textLength,
      },
    });
  } catch (error: any) {
    logger.error('Failed to calculate typing', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to calculate typing',
    });
  }
});

// GET /risk/:instanceId - Get risk score for instance
app.get('/risk/:instanceId', async (req, res) => {
  try {
    const { instanceId } = req.params;
    
    // Get activities from Redis
    const activitiesKey = `activities:${instanceId}`;
    const activities = await redis.lrange(activitiesKey, 0, 999);
    const parsedActivities = activities.map(a => JSON.parse(a));
    
    const riskScore = calculateRiskScore(instanceId, parsedActivities);
    riskScores.set(instanceId, riskScore);
    
    res.json({
      success: true,
      data: riskScore,
    });
  } catch (error: any) {
    logger.error('Failed to get risk score', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to get risk score',
    });
  }
});

// POST /activity/:instanceId - Record activity
app.post('/activity/:instanceId', async (req, res) => {
  try {
    const { instanceId } = req.params;
    const activity = {
      ...req.body,
      timestamp: new Date().toISOString(),
    };
    
    // Store activity in Redis (keep last 1000)
    const activitiesKey = `activities:${instanceId}`;
    await redis.lpush(activitiesKey, JSON.stringify(activity));
    await redis.ltrim(activitiesKey, 0, 999);
    
    // Set expiration (7 days)
    await redis.expire(activitiesKey, 7 * 24 * 60 * 60);
    
    res.json({
      success: true,
      message: 'Activity recorded',
    });
  } catch (error: any) {
    logger.error('Failed to record activity', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to record activity',
    });
  }
});

// GET /stats - Get engine stats
app.get('/stats', (req, res) => {
  try {
    const stats = {
      totalInstances: riskScores.size,
      riskDistribution: {
        LOW: 0,
        MEDIUM: 0,
        HIGH: 0,
        CRITICAL: 0,
      },
    };
    
    for (const score of riskScores.values()) {
      stats.riskDistribution[score.level as keyof typeof stats.riskDistribution]++;
    }
    
    res.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    logger.error('Failed to get stats', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to get stats',
    });
  }
});

// GET /analyze/:instanceId - Analyze pattern
app.get('/analyze/:instanceId', async (req, res) => {
  try {
    const { instanceId } = req.params;
    
    const activitiesKey = `activities:${instanceId}`;
    const activities = await redis.lrange(activitiesKey, 0, 999);
    const parsedActivities = activities.map(a => JSON.parse(a));
    
    // Analyze patterns
    const hourlyDistribution = new Array(24).fill(0);
    parsedActivities.forEach(a => {
      const hour = new Date(a.timestamp).getHours();
      hourlyDistribution[hour]++;
    });
    
    const messageTypes = parsedActivities.reduce((acc: any, a) => {
      acc[a.type] = (acc[a.type] || 0) + 1;
      return acc;
    }, {});
    
    res.json({
      success: true,
      data: {
        instanceId,
        totalActivities: parsedActivities.length,
        hourlyDistribution,
        messageTypes,
        recommendations: generateRecommendations(parsedActivities),
      },
    });
  } catch (error: any) {
    logger.error('Failed to analyze pattern', { error: error.message });
    res.status(500).json({
      success: false,
      error: 'Failed to analyze pattern',
    });
  }
});

function generateRecommendations(activities: any[]): string[] {
  const recommendations: string[] = [];
  
  const messageCount = activities.filter(a => a.type === 'message_sent').length;
  if (messageCount > 100) {
    recommendations.push('Reduce message sending rate to avoid detection');
  }
  
  const offHoursCount = activities.filter(a => {
    const hour = new Date(a.timestamp).getHours();
    return hour < 6 || hour > 23;
  }).length;
  
  if (offHoursCount > 20) {
    recommendations.push('Limit activity during off-hours (00:00-06:00)');
  }
  
  if (recommendations.length === 0) {
    recommendations.push('Current activity pattern looks healthy');
  }
  
  return recommendations;
}

// POST /wake-up/:instanceId/start - Start wake-up cycle
app.post('/wake-up/:instanceId/start', (req, res) => {
  res.json({
    success: true,
    message: 'Wake-up cycle started',
  });
});

// POST /wake-up/:instanceId/stop - Stop wake-up cycle
app.post('/wake-up/:instanceId/stop', (req, res) => {
  res.json({
    success: true,
    message: 'Wake-up cycle stopped',
  });
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
  logger.info(`Anti-Ban Engine running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await redis.quit();
  process.exit(0);
});
