// ============================================
// API GATEWAY
// 118 Endpoints Business - Facil Zap API
// ============================================

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import dotenv from 'dotenv';
import { createProxyMiddleware } from 'http-proxy-middleware';

import { createLogger } from './utils/logger';
import { authMiddleware, apiKeyMiddleware } from './middleware/auth';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';

// Route imports
import { instanceRoutes } from './routes/instances';
import { messageRoutes } from './routes/messages';
import { groupRoutes } from './routes/groups';
import { chatRoutes } from './routes/chats';
import { authRoutes } from './routes/auth';
import { auditRoutes } from './routes/audit';
import { contractRoutes } from './routes/contracts';
import { paymentRoutes } from './routes/payments';
import { webhookRoutes } from './routes/webhooks';
import { adminRoutes } from './routes/admin';

dotenv.config();

const logger = createLogger('ApiGateway');
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
app.use(requestLogger);

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      error: 'Too many requests, please try again later',
    });
  },
});
app.use(limiter);

// Speed limiting for expensive operations
const speedLimiter = slowDown({
  windowMs: 60000,
  delayAfter: 10,
  delayMs: 500,
});

// ============================================
// SERVICE PROXIES
// ============================================

const sessionKeeperProxy = createProxyMiddleware({
  target: process.env.SESSION_KEEPER_URL || 'http://session-keeper:3000',
  changeOrigin: true,
  pathRewrite: { '^/v1/instances': '' },
});

const messageQueueProxy = createProxyMiddleware({
  target: process.env.MESSAGE_QUEUE_URL || 'http://message-queue:3000',
  changeOrigin: true,
  pathRewrite: { '^/v1/queue': '' },
});

const antiBanProxy = createProxyMiddleware({
  target: process.env.ANTI_BAN_URL || 'http://anti-ban-engine:3000',
  changeOrigin: true,
  pathRewrite: { '^/v1/antiban': '' },
});

const legalComplianceProxy = createProxyMiddleware({
  target: process.env.LEGAL_COMPLIANCE_URL || 'http://legal-compliance:3000',
  changeOrigin: true,
  pathRewrite: { '^/v1/legal': '' },
});

const paymentGatewayProxy = createProxyMiddleware({
  target: process.env.PAYMENT_GATEWAY_URL || 'http://payment-gateway:3000',
  changeOrigin: true,
  pathRewrite: { '^/v1/payments': '' },
});

// ============================================
// API DOCUMENTATION
// ============================================

// app.use('/docs', swaggerUi.serve, swaggerUi.setup(YAML.load('./swagger.yaml')));

// ============================================
// PUBLIC ROUTES
// ============================================

app.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
  });
});

app.get('/', (req, res) => {
  res.json({
    name: 'Facil Zap API',
    version: '2.0.0',
    description: 'Microserviços de Automação WhatsApp com Anti-Ban 2.0',
    documentation: '/docs',
    health: '/health',
  });
});

// ============================================
// AUTHENTICATION ROUTES
// ============================================

app.use('/v1/auth', authRoutes);

// ============================================
// PROTECTED ROUTES (API Key Required)
// ============================================

app.use('/v1/instances', apiKeyMiddleware, instanceRoutes);
app.use('/v1/messages', apiKeyMiddleware, messageRoutes);
app.use('/v1/groups', apiKeyMiddleware, groupRoutes);
app.use('/v1/chats', apiKeyMiddleware, chatRoutes);
app.use('/v1/queue', apiKeyMiddleware, messageQueueProxy);
app.use('/v1/antiban', apiKeyMiddleware, antiBanProxy);
app.use('/v1/legal', apiKeyMiddleware, contractRoutes);
app.use('/v1/payments', apiKeyMiddleware, paymentRoutes);
app.use('/v1/audit', apiKeyMiddleware, auditRoutes);
app.use('/v1/webhooks', apiKeyMiddleware, webhookRoutes);

// ============================================
// ADMIN ROUTES (JWT Required)
// ============================================

app.use('/v1/admin', authMiddleware, adminRoutes);

// ============================================
// DIRECT SERVICE PROXIES (Internal)
// ============================================

app.use('/internal/session-keeper', sessionKeeperProxy);
app.use('/internal/message-queue', messageQueueProxy);
app.use('/internal/anti-ban', antiBanProxy);
app.use('/internal/legal', legalComplianceProxy);
app.use('/internal/payments', paymentGatewayProxy);

// ============================================
// WEBHOOK ENDPOINTS (Public but signed)
// ============================================

app.use('/webhooks', webhookRoutes);

// ============================================
// ERROR HANDLING
// ============================================

app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.path,
  });
});

// ============================================
// SERVER STARTUP
// ============================================

app.listen(PORT, () => {
  logger.info(`API Gateway running on port ${PORT}`);
  logger.info('Available endpoints:');
  logger.info('  - /v1/auth/*        : Authentication');
  logger.info('  - /v1/instances/*   : WhatsApp Instance Management');
  logger.info('  - /v1/messages/*    : Messaging');
  logger.info('  - /v1/groups/*      : Group Management');
  logger.info('  - /v1/chats/*       : Chat Operations');
  logger.info('  - /v1/queue/*       : Message Queue');
  logger.info('  - /v1/antiban/*     : Anti-Ban Engine');
  logger.info('  - /v1/legal/*       : Legal Compliance');
  logger.info('  - /v1/payments/*    : Payment Gateway');
  logger.info('  - /v1/audit/*       : Audit Logs');
  logger.info('  - /v1/webhooks/*    : Webhook Configuration');
  logger.info('  - /v1/admin/*       : Admin Operations');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});