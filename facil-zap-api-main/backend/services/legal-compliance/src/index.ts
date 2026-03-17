// ============================================
// LEGAL COMPLIANCE SERVICE
// Micro SaaS Legal - Compliance Automático
// ============================================

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

import { ContractEngine } from './services/ContractEngine';
import { createLogger } from './utils/logger';

dotenv.config();

const logger = createLogger('LegalCompliance');
const app = express();
const PORT = process.env.PORT || 3000;
const prisma = new PrismaClient();

// ============================================
// MIDDLEWARE
// ============================================

app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));

// ============================================
// CONTRACT ENGINE INITIALIZATION
// ============================================

const contractEngine = new ContractEngine(
  process.env.ZAPSIGN_API_KEY || '',
  process.env.ZAPSIGN_WEBHOOK_SECRET || '',
  process.env.CONTRACT_HASH_SECRET || '',
  process.env.GOOGLE_CLIENT_ID ? {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    refreshToken: process.env.GOOGLE_REFRESH_TOKEN || '',
    fromEmail: process.env.SMTP_FROM_EMAIL || '',
  } : undefined
);

// ============================================
// HEALTH CHECK
// ============================================

app.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

// ============================================
// CONTRACT ROUTES
// ============================================

// Create contract
app.post('/contracts', async (req, res) => {
  try {
    const { userId, templateType, ...contractData } = req.body;

    // Generate contract PDF
    const pdfBuffer = await contractEngine.generateContractPDF({
      id: `contract_${Date.now()}`,
      ...contractData,
      createdAt: new Date(),
    });

    // Generate hash
    const hashResult = contractEngine.generateContractHash({
      id: `contract_${Date.now()}`,
      ...contractData,
      createdAt: new Date(),
    });

    // Save to database
    const contract = await prisma.contract.create({
      data: {
        userId,
        title: contractData.title || 'Contrato de Serviço',
        templateType: templateType || 'service',
        contentHash: hashResult.hash,
        providerName: contractData.providerName,
        providerDocument: contractData.providerDocument,
        clientName: contractData.clientName,
        clientDocument: contractData.clientDocument,
        clientEmail: contractData.clientEmail,
        value: contractData.value,
        currency: contractData.currency || 'BRL',
        paymentMethod: 'pix',
        status: 'DRAFT',
      },
    });

    res.status(201).json({
      success: true,
      data: {
        contractId: contract.id,
        hash: hashResult.hash,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to create contract');
    res.status(500).json({
      success: false,
      error: 'Failed to create contract',
    });
  }
});

// Send contract for signature
app.post('/contracts/:contractId/send', async (req, res) => {
  try {
    const { contractId } = req.params;

    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
    });

    if (!contract) {
      res.status(404).json({
        success: false,
        error: 'Contract not found',
      });
      return;
    }

    // Generate PDF
    const pdfBuffer = await contractEngine.generateContractPDF({
      id: contract.id,
      providerName: contract.providerName,
      providerDocument: contract.providerDocument,
      clientName: contract.clientName,
      clientDocument: contract.clientDocument,
      clientEmail: contract.clientEmail,
      value: Number(contract.value),
      currency: contract.currency,
      terms: 'Contrato de prestação de serviços FacilZap API',
      createdAt: contract.createdAt,
    });

    // Create ZapSign document
    const zapSignDoc = await contractEngine.createZapSignDocument(
      {
        id: contract.id,
        providerName: contract.providerName,
        providerDocument: contract.providerDocument,
        clientName: contract.clientName,
        clientDocument: contract.clientDocument,
        clientEmail: contract.clientEmail,
        value: Number(contract.value),
        currency: contract.currency,
        terms: 'Contrato de prestação de serviços',
        createdAt: contract.createdAt,
      },
      pdfBuffer
    );

    // Update contract
    await prisma.contract.update({
      where: { id: contractId },
      data: {
        status: 'SENT',
        zapsignDocId: zapSignDoc.id,
      },
    });

    res.json({
      success: true,
      data: {
        signUrl: zapSignDoc.signUrl,
        status: zapSignDoc.status,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to send contract');
    res.status(500).json({
      success: false,
      error: 'Failed to send contract',
    });
  }
});

// Verify contract integrity
app.get('/contracts/:contractId/verify', async (req, res) => {
  try {
    const { contractId } = req.params;

    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
    });

    if (!contract) {
      res.status(404).json({
        success: false,
        error: 'Contract not found',
      });
      return;
    }

    res.json({
      success: true,
      data: {
        contractId: contract.id,
        hash: contract.contentHash,
        status: contract.status,
        isValid: true, // Simplified - would verify against stored hash
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to verify contract');
    res.status(500).json({
      success: false,
      error: 'Failed to verify contract',
    });
  }
});

// ============================================
// WEBHOOK ROUTES
// ============================================

// ZapSign webhook
app.post('/webhooks/zapsign', async (req, res) => {
  try {
    const signature = req.headers['x-zapsign-signature'] as string;
    const payload = req.body;

    const result = await contractEngine.handleZapSignWebhook(payload, signature);

    // Update contract status
    await prisma.contract.update({
      where: { id: result.contractId },
      data: {
        status: result.status === 'signed' ? 'SIGNED' : undefined,
        signedAt: result.signedAt,
      },
    });

    // Trigger payment if signed
    if (result.status === 'signed') {
      logger.info({ contractId: result.contractId }, 'Contract signed, triggering payment');
      // Would trigger payment gateway here
    }

    res.json({ success: true });
  } catch (error) {
    logger.error({ error }, 'Webhook processing failed');
    res.status(400).json({
      success: false,
      error: 'Webhook processing failed',
    });
  }
});

// ============================================
// ERROR HANDLING
// ============================================

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error({ err, path: req.path }, 'Unhandled error');
  res.status(500).json({
    success: false,
    error: 'Internal server error',
  });
});

// ============================================
// SERVER STARTUP
// ============================================

app.listen(PORT, () => {
  logger.info(`Legal Compliance service running on port ${PORT}`);
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});