// ============================================
// PAYMENT GATEWAY SERVICE
// Integração PIX para pagamentos
// ============================================

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import axios from 'axios';
import { randomUUID } from 'crypto';

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

const PIX_API_KEY = process.env.PIX_API_KEY;
const PIX_CLIENT_ID = process.env.PIX_CLIENT_ID;
const PIX_CLIENT_SECRET = process.env.PIX_CLIENT_SECRET;

// ============================================
// PIX UTILITIES
// ============================================

function generatePixPayload(txid: string, value: number, description: string): string {
  // Simplified PIX payload generation (Copia e Cola)
  // In production, use a proper PIX library
  return `00020126430014BR.GOV.BCB.PIX0114${txid}5204000053039865404${value.toFixed(2)}5802BR5913${description}6008BRASILIA62070503***6304`;
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

// GET /invoices - List invoices
app.get('/invoices', async (req, res) => {
  try {
    const { userId, status } = req.query;
    
    const invoices = await prisma.invoice.findMany({
      where: {
        ...(userId && { userId: userId as string }),
        ...(status && { status: status as any }),
      },
      orderBy: { createdAt: 'desc' },
    });
    
    res.json({ success: true, data: invoices });
  } catch (error: any) {
    logger.error('Failed to list invoices', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to list invoices' });
  }
});

// POST /invoices - Create invoice
app.post('/invoices', async (req, res) => {
  try {
    const {
      userId,
      contractId,
      description,
      value,
      dueDate,
    } = req.body;
    
    const invoiceNumber = `INV-${Date.now()}`;
    
    const invoice = await prisma.invoice.create({
      data: {
        userId,
        contractId,
        invoiceNumber,
        description,
        value: parseFloat(value),
        dueDate: new Date(dueDate),
        status: 'PENDING',
      },
    });
    
    res.status(201).json({ success: true, data: invoice });
  } catch (error: any) {
    logger.error('Failed to create invoice', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to create invoice' });
  }
});

// GET /invoices/:invoiceId - Get invoice
app.get('/invoices/:invoiceId', async (req, res) => {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: req.params.invoiceId },
    });
    
    if (!invoice) {
      res.status(404).json({ success: false, error: 'Invoice not found' });
      return;
    }
    
    res.json({ success: true, data: invoice });
  } catch (error: any) {
    logger.error('Failed to get invoice', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to get invoice' });
  }
});

// POST /invoices/:invoiceId/cancel - Cancel invoice
app.post('/invoices/:invoiceId/cancel', async (req, res) => {
  try {
    const invoice = await prisma.invoice.update({
      where: { id: req.params.invoiceId },
      data: { status: 'CANCELLED' },
    });
    
    res.json({ success: true, data: invoice });
  } catch (error: any) {
    logger.error('Failed to cancel invoice', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to cancel invoice' });
  }
});

// POST /pix/generate - Generate PIX
app.post('/pix/generate', async (req, res) => {
  try {
    const { invoiceId, value, description } = req.body;
    
    const txid = randomUUID().replace(/-/g, '').substring(0, 32);
    const payload = generatePixPayload(txid, parseFloat(value), description);
    
    // Update invoice with PIX data
    if (invoiceId) {
      await prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          pixTxid: txid,
          pixPayload: payload,
        },
      });
    }
    
    res.json({
      success: true,
      data: {
        txid,
        payload,
        value: parseFloat(value),
        description,
      },
    });
  } catch (error: any) {
    logger.error('Failed to generate PIX', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to generate PIX' });
  }
});

// GET /pix/:txid/status - Get PIX status
app.get('/pix/:txid/status', async (req, res) => {
  try {
    const { txid } = req.params;
    
    const invoice = await prisma.invoice.findUnique({
      where: { pixTxid: txid },
    });
    
    if (!invoice) {
      res.status(404).json({ success: false, error: 'PIX transaction not found' });
      return;
    }
    
    res.json({
      success: true,
      data: {
        txid,
        status: invoice.status,
        value: invoice.value,
        paidAt: invoice.paidAt,
        paidAmount: invoice.paidAmount,
      },
    });
  } catch (error: any) {
    logger.error('Failed to get PIX status', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to get PIX status' });
  }
});

// POST /webhooks/pix - PIX webhook handler
app.post('/webhooks/pix', async (req, res) => {
  try {
    const { txid, status, paidAmount, paidAt } = req.body;
    
    logger.info('PIX webhook received', { txid, status });
    
    const invoice = await prisma.invoice.findUnique({
      where: { pixTxid: txid },
    });
    
    if (invoice) {
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          status: status === 'PAID' ? 'PAID' : invoice.status,
          paidAmount: paidAmount ? parseFloat(paidAmount) : null,
          paidAt: paidAt ? new Date(paidAt) : null,
        },
      });
      
      // Update contract status if applicable
      if (invoice.contractId && status === 'PAID') {
        await prisma.contract.update({
          where: { id: invoice.contractId },
          data: {
            status: 'PAYMENT_RECEIVED',
            paymentReceivedAt: new Date(),
          },
        });
      }
    }
    
    res.json({ success: true, message: 'Webhook processed' });
  } catch (error: any) {
    logger.error('Failed to process PIX webhook', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to process webhook' });
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
  logger.info(`Payment Gateway service running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await prisma.$disconnect();
  process.exit(0);
});
