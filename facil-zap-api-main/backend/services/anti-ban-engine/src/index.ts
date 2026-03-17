// ============================================
// ANTI-BAN ENGINE SERVICE
// Algoritmo Proprietário Anti-Ban 2.0
// ============================================

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';

import { AntiBanEngine } from './services/AntiBanEngine';
import { AntiBanController } from './controllers/antiBanController';
import { createLogger } from './utils/logger';
import { validate, calculateDelaySchema, calculateTypingSchema, recordActivitySchema } from './middleware/validation';

dotenv.config();

const logger = createLogger('AntiBanEngine');
const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// MIDDLEWARE
// ============================================

app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  logger.info({ method: req.method, path: req.path }, 'Request received');
  next();
});

// ============================================
// ANTI-BAN ENGINE INITIALIZATION
// ============================================

const antiBanEngine = new AntiBanEngine(
  process.env.REDIS_URL || 'redis://localhost:6379'
);

const antiBanController = new AntiBanController(antiBanEngine);

// Event listeners
antiBanEngine.on('job:completed', ({ jobId }) => {
  logger.debug({ jobId }, 'Anti-ban job completed');
});

// ============================================
// HEALTH CHECK
// ============================================

app.get('/health', (req, res) => {
  const stats = antiBanEngine.getStats();
  
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    data: {
      stats,
    },
  });
});

// ============================================
// DELAY CALCULATION ROUTES
// ============================================

// Calculate delay for message
app.post('/calculate-delay', validate(calculateDelaySchema), antiBanController.calculateDelay);

// Calculate typing simulation
app.post('/calculate-typing', validate(calculateTypingSchema), antiBanController.calculateTyping);

// ============================================
// RISK SCORING ROUTES
// ============================================

// Get risk score for instance
app.get('/risk/:instanceId', antiBanController.getRiskScore);

// ============================================
// HUMAN WAKE-UP CYCLE ROUTES
// ============================================

// Start wake-up cycle
app.post('/wake-up/:instanceId/start', antiBanController.startWakeUpCycle);

// Stop wake-up cycle
app.post('/wake-up/:instanceId/stop', antiBanController.stopWakeUpCycle);

// ============================================
// ACTIVITY ROUTES
// ============================================

// Record activity
app.post('/activity/:instanceId', validate(recordActivitySchema), antiBanController.recordActivity);

// ============================================
// ANALYTICS ROUTES
// ============================================

// Get engine stats
app.get('/stats', antiBanController.getStats);

// Analyze pattern
app.get('/analyze/:instanceId', antiBanController.analyzePattern);

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
  logger.info(`Anti-Ban Engine running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await antiBanEngine.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await antiBanEngine.close();
  process.exit(0);
});