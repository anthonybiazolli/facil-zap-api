// ============================================
// SESSION KEEPER SERVICE
// The Session Keeper - Camada de Sessão
// Gerenciamento Multi-Device com Noise Protocol Framework
// ============================================

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import Redis from 'ioredis';
import dotenv from 'dotenv';

import { SessionManager } from './services/SessionManager';
import { SessionController } from './controllers/sessionController';
import { createLogger } from './utils/logger';

dotenv.config();

const logger = createLogger('SessionKeeper');
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
// REDIS CONNECTION
// ============================================

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

redis.on('connect', () => {
  logger.info('Connected to Redis');
});

redis.on('error', (err) => {
  logger.error({ err }, 'Redis error');
});

// ============================================
// SESSION MANAGER INITIALIZATION
// ============================================

const sessionManager = new SessionManager(
  redis,
  process.env.ENCRYPTION_KEY || 'default-key-change-in-production',
  process.env.WA_WEBHOOK_URL
);

const sessionController = new SessionController(sessionManager);

// ============================================
// HEALTH CHECK
// ============================================

app.get('/health', async (req, res) => {
  const redisHealth = redis.status === 'ready';
  const sessionsCount = sessionManager.getAllSessions().length;
  
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      redis: redisHealth ? 'connected' : 'disconnected',
    },
    metrics: {
      activeSessions: sessionsCount,
    },
  });
});

// ============================================
// SESSION ROUTES
// ============================================

// Create new session
app.post('/sessions', sessionController.createSession);

// List all sessions
app.get('/sessions', sessionController.getSessions);

// Get session details
app.get('/sessions/:sessionId', sessionController.getSession);

// Delete session
app.delete('/sessions/:sessionId', sessionController.deleteSession);

// ============================================
// MESSAGING ROUTES
// ============================================

// Send message
app.post('/sessions/:sessionId/messages', sessionController.sendMessage);

// Send bulk messages
app.post('/sessions/:sessionId/messages/bulk', sessionController.sendBulkMessages);

// ============================================
// GROUP ROUTES
// ============================================

// Get group info
app.get('/sessions/:sessionId/groups/:groupJid', sessionController.getGroupInfo);

// Update group subject
app.patch('/sessions/:sessionId/groups/:groupJid/subject', sessionController.updateGroupSubject);

// Get group invite info
app.get('/sessions/:sessionId/groups/invite/info', sessionController.getGroupInviteInfo);

// Accept group invite
app.post('/sessions/:sessionId/groups/invite/accept', sessionController.acceptGroupInvite);

// ============================================
// PRESENCE & CHAT ROUTES
// ============================================

// Set presence
app.post('/sessions/:sessionId/presence', sessionController.setPresence);

// Mark chat as read
app.post('/sessions/:sessionId/chats/read', sessionController.markChatAsRead);

// Get chats
app.get('/sessions/:sessionId/chats', sessionController.getChats);

// ============================================
// METRICS ENDPOINT
// ============================================

app.get('/metrics', (req, res) => {
  const sessions = sessionManager.getAllSessions();
  
  const metrics = {
    sessions: {
      total: sessions.length,
      byStatus: sessions.reduce((acc: any, s: any) => {
        acc[s.status] = (acc[s.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    },
    messages: sessions.reduce(
      (acc: any, s: any) => ({
        sent: acc.sent + (s.metrics?.messagesSent || 0),
        received: acc.received + (s.metrics?.messagesReceived || 0),
        failed: acc.failed + (s.metrics?.messagesFailed || 0),
      }),
      { sent: 0, received: 0, failed: 0 }
    ),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  };

  res.json({
    success: true,
    data: metrics,
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

// 404 handler
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
  logger.info(`Session Keeper service running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  
  const sessions = sessionManager.getAllSessions();
  for (const session of sessions) {
    try {
      await sessionManager.deleteSession(session.id);
    } catch (err) {
      logger.error({ err, sessionId: session.id }, 'Error closing session');
    }
  }
  
  await redis.quit();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.emit('SIGTERM' as any);
});
