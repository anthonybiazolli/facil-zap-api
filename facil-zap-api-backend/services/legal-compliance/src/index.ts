// ============================================
// LEGAL COMPLIANCE SERVICE
// Integração com ZapSign para contratos digitais
// ============================================

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import axios from 'axios';
import { createHash } from 'crypto';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const prisma = new PrismaClient();

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

const ZAPSIGN_API_KEY = process.env.ZAPSIGN_API_KEY;
const ZAPSIGN_BASE_URL = 'https://api.zapsign.com.br/api/v1';

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

// GET /contracts - List contracts
app.get('/contracts', async (req, res) => {
  try {
    const { userId, status } = req.query;
    
    const contracts = await prisma.contract.findMany({
      where: {
        ...(userId && { userId: userId as string }),
        ...(status && { status: status as any }),
      },
      orderBy: { createdAt: 'desc' },
    });
    
    res.json({ success: true, data: contracts });
  } catch (error: any) {
    logger.error('Failed to list contracts', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to list contracts' });
  }
});

// POST /contracts - Create contract
app.post('/contracts', async (req, res) => {
  try {
    const {
      userId,
      title,
      description,
      templateType,
      providerName,
      providerDocument,
      clientName,
      clientDocument,
      clientEmail,
      value,
      paymentMethod,
    } = req.body;
    
    // Generate content hash
    const contentHash = createHash('sha256')
      .update(JSON.stringify(req.body))
      .digest('hex');
    
    // Create contract in database
    const contract = await prisma.contract.create({
      data: {
        userId,
        title,
        description,
        templateType,
        contentHash,
        providerName,
        providerDocument,
        clientName,
        clientDocument,
        clientEmail,
        value: parseFloat(value),
        paymentMethod,
        status: 'DRAFT',
      },
    });
    
    // If ZapSign API key is configured, create document
    if (ZAPSIGN_API_KEY) {
      try {
        const zapsignResponse = await axios.post(
          `${ZAPSIGN_BASE_URL}/docs/`,
          {
            name: title,
            content: description,
            signers: [
              {
                name: clientName,
                email: clientEmail,
                cpf_cnpj: clientDocument,
              },
            ],
          },
          {
            headers: {
              Authorization: `Bearer ${ZAPSIGN_API_KEY}`,
            },
          }
        );
        
        await prisma.contract.update({
          where: { id: contract.id },
          data: {
            zapsignDocId: zapsignResponse.data.doc_id,
            status: 'SENT',
          },
        });
      } catch (zapsignError: any) {
        logger.error('ZapSign API error', { error: zapsignError.message });
      }
    }
    
    res.status(201).json({ success: true, data: contract });
  } catch (error: any) {
    logger.error('Failed to create contract', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to create contract' });
  }
});

// GET /contracts/:contractId - Get contract
app.get('/contracts/:contractId', async (req, res) => {
  try {
    const contract = await prisma.contract.findUnique({
      where: { id: req.params.contractId },
    });
    
    if (!contract) {
      res.status(404).json({ success: false, error: 'Contract not found' });
      return;
    }
    
    res.json({ success: true, data: contract });
  } catch (error: any) {
    logger.error('Failed to get contract', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to get contract' });
  }
});

// POST /contracts/:contractId/sign - Sign contract
app.post('/contracts/:contractId/sign', async (req, res) => {
  try {
    const { signedByIp } = req.body;
    
    const contract = await prisma.contract.update({
      where: { id: req.params.contractId },
      data: {
        status: 'SIGNED',
        signedAt: new Date(),
        signedByIp,
      },
    });
    
    res.json({ success: true, data: contract });
  } catch (error: any) {
    logger.error('Failed to sign contract', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to sign contract' });
  }
});

// GET /contracts/:contractId/pdf - Get contract PDF
app.get('/contracts/:contractId/pdf', async (req, res) => {
  try {
    const contract = await prisma.contract.findUnique({
      where: { id: req.params.contractId },
    });
    
    if (!contract) {
      res.status(404).json({ success: false, error: 'Contract not found' });
      return;
    }
    
    if (contract.pdfUrl) {
      res.redirect(contract.pdfUrl);
    } else {
      res.status(404).json({ success: false, error: 'PDF not available' });
    }
  } catch (error: any) {
    logger.error('Failed to get contract PDF', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to get contract PDF' });
  }
});

// Error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error', { error: err.message });
  res.status(500).json({ success: false, error: 'Internal server error' });
});

app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
});

// Start server
app.listen(PORT, () => {
  logger.info(`Legal Compliance service running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await prisma.$disconnect();
  process.exit(0);
});
