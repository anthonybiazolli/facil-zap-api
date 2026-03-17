// ============================================
// PAYMENT GATEWAY SERVICE
// Sistema de Faturamento PIX Zero Taxa
// ============================================

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { readFileSync, existsSync } from 'fs';
import { Agent } from 'https';

import { PixService } from './services/PixService';
import { createLogger } from './utils/logger';

dotenv.config();

const logger = createLogger('PaymentGateway');
const app = express();
const PORT = process.env.PORT || 3000;
const prisma = new PrismaClient();

// ============================================
// MIDDLEWARE
// ============================================

app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json());

// ============================================
// PIX SERVICE INITIALIZATION
// ============================================

// Correção: Carregamento tolerante a falhas do Certificado Inter
let httpsAgent: Agent | undefined = undefined;

try {
  const certPath = process.env.BANCO_INTER_CERT_PATH;
  const keyPath = process.env.BANCO_INTER_KEY_PATH;

  if (certPath && keyPath && existsSync(certPath) && existsSync(keyPath)) {
    httpsAgent = new Agent({
      cert: readFileSync(certPath),
      key: readFileSync(keyPath),
    });
    logger.info('Banco Inter certificates loaded successfully');
  } else {
    logger.warn('Banco Inter certificates not found or not configured. PIX API calls will fail until configured.');
  }
} catch (error) {
  logger.error({ error }, 'Failed to load Banco Inter certificates');
}

const pixService = new PixService(
  {
    baseUrl: 'https://cdpj.partners.bancointer.com.br',
    clientId: process.env.BANCO_INTER_CLIENT_ID || '',
    clientSecret: process.env.BANCO_INTER_CLIENT_SECRET || '',
    httpsAgent: httpsAgent,
  },
  process.env.PIX_KEY || '',
  process.env.PIX_MERCHANT_NAME || 'FacilZap API',
  process.env.PIX_CITY || 'Sao Paulo'
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

app.get('/metrics', (req, res) => {
  res.json({ status: 'ok' });
});

// ============================================
// INVOICE ROUTES
// ============================================

app.post('/invoices', async (req, res) => {
  try {
    const { userId, description, value, dueDays = 1, contractId } = req.body;

    const invoiceNumber = `INV-${Date.now()}`;
    const txid = pixService.generateTxid();
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + dueDays);

    const pixCharge = await pixService.createPixCharge({
      txid,
      amount: value,
      description,
      expiresIn: dueDays * 86400,
    });

    const invoice = await prisma.invoice.create({
      data: {
        userId,
        contractId,
        invoiceNumber,
        description,
        value,
        currency: 'BRL',
        pixTxid: txid,
        pixPayload: pixCharge.pixCopyPaste,
        pixQrCodeUrl: pixCharge.qrCodeBase64,
        status: 'PENDING',
        dueDate,
      },
    });

    res.status(201).json({
      success: true,
      data: {
        invoiceId: invoice.id,
        invoiceNumber,
        pixPayload: pixCharge.pixCopyPaste,
        pixQrCode: pixCharge.qrCodeBase64,
        dueDate,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to create invoice');
    res.status(500).json({
      success: false,
      error: 'Failed to create invoice',
    });
  }
});

app.get('/invoices/:invoiceId', async (req, res) => {
  try {
    const { invoiceId } = req.params;

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice) {
      res.status(404).json({ success: false, error: 'Invoice not found' });
      return;
    }

    let pixStatus = null;
    if (invoice.status === 'PENDING' && invoice.pixTxid) {
      try {
        pixStatus = await pixService.checkPixStatus(invoice.pixTxid);
        
        if (pixStatus.status === 'CONCLUIDA') {
          await prisma.invoice.update({
            where: { id: invoiceId },
            data: {
              status: 'PAID',
              paidAt: new Date(),
              paidAmount: pixStatus.amount,
              bankReference: pixStatus.endToEndId,
            },
          });
          invoice.status = 'PAID';
        }
      } catch (e) {
        logger.warn({ error: e }, 'Failed to check PIX status');
      }
    }

    res.json({
      success: true,
      data: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        description: invoice.description,
        value: invoice.value,
        status: invoice.status,
        pixPayload: invoice.pixPayload,
        pixQrCode: invoice.pixQrCodeUrl,
        paidAt: invoice.paidAt,
        dueDate: invoice.dueDate,
        pixStatus,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get invoice');
    res.status(500).json({ success: false, error: 'Failed to get invoice' });
  }
});

app.get('/invoices', async (req, res) => {
  try {
    const { userId, status, limit = '10', offset = '0' } = req.query;

    const where: any = {};
    if (userId) where.userId = userId;
    if (status) where.status = status;

    const invoices = await prisma.invoice.findMany({
      where,
      take: parseInt(limit as string),
      skip: parseInt(offset as string),
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: invoices.map((inv: any) => ({
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        description: inv.description,
        value: inv.value,
        status: inv.status,
        dueDate: inv.dueDate,
        paidAt: inv.paidAt,
      })),
    });
  } catch (error) {
    logger.error({ error }, 'Failed to list invoices');
    res.status(500).json({ success: false, error: 'Failed to list invoices' });
  }
});

// ============================================
// PIX ROUTES
// ============================================

app.post('/pix/generate', async (req, res) => {
  try {
    const { amount, description } = req.body;

    const txid = pixService.generateTxid();
    const payload = pixService.generatePixPayload({ txid, amount, description });
    const qrCode = await pixService.generateQRCode(payload.payload);

    res.json({
      success: true,
      data: { txid, pixCopyPaste: payload.payload, qrCode },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to generate PIX');
    res.status(500).json({ success: false, error: 'Failed to generate PIX' });
  }
});

app.get('/pix/status/:txid', async (req, res) => {
  try {
    const { txid } = req.params;
    const status = await pixService.checkPixStatus(txid);
    res.json({ success: true, data: status });
  } catch (error) {
    logger.error({ error }, 'Failed to check PIX status');
    res.status(500).json({ success: false, error: 'Failed to check PIX status' });
  }
});

// ============================================
// WEBHOOK ROUTES
// ============================================

app.post('/webhooks/pix', async (req, res) => {
  try {
    const signature = req.headers['x-webhook-signature'] as string;
    const payload = req.body;

    const expectedSignature = process.env.WEBHOOK_SECRET || '';
    if (signature !== expectedSignature) {
       res.status(401).json({ success: false, error: 'Invalid signature' });
       return;
    }

    const { txid, endToEndId, valor, horario } = payload;

    await prisma.invoice.updateMany({
      where: { pixTxid: txid },
      data: {
        status: 'PAID',
        paidAt: new Date(horario),
        paidAmount: parseFloat(valor),
        bankReference: endToEndId,
      },
    });

    logger.info({ txid }, 'PIX received via webhook');
    res.json({ success: true });
  } catch (error) {
    logger.error({ error }, 'Webhook processing failed');
    res.status(500).json({ success: false });
  }
});

// ============================================
// ERROR HANDLING
// ============================================

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error({ err, path: req.path }, 'Unhandled error');
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// ============================================
// SERVER STARTUP
// ============================================

app.listen(PORT, () => {
  logger.info(`Payment Gateway service running on port ${PORT}`);
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});