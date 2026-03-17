// ============================================
// PAYMENT WORKER
// Polling de Confirmação de Pagamentos PIX
// ============================================

import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { Agent } from 'https';
import dotenv from 'dotenv';

import { PixService } from '../services/PixService';
import { createLogger } from '../utils/logger';

dotenv.config();

const logger = createLogger('PaymentWorker');
const prisma = new PrismaClient();

const POLLING_INTERVAL = parseInt(process.env.POLLING_INTERVAL_MS || '10000', 10);

const pixService = new PixService(
  {
    baseUrl: 'https://cdpj.partners.bancointer.com.br',
    clientId: process.env.BANCO_INTER_CLIENT_ID || '',
    clientSecret: process.env.BANCO_INTER_CLIENT_SECRET || '',
    httpsAgent: process.env.BANCO_INTER_CERT_PATH
      ? new Agent({
          cert: readFileSync(process.env.BANCO_INTER_CERT_PATH),
          key: readFileSync(process.env.BANCO_INTER_KEY_PATH || ''),
        })
      : undefined,
  },
  process.env.PIX_KEY || '',
  process.env.PIX_MERCHANT_NAME || 'FacilZap API',
  process.env.PIX_CITY || 'Sao Paulo'
);

async function pollPendingPayments(): Promise<void> {
  try {
    // Find pending invoices
    const pendingInvoices = await prisma.invoice.findMany({
      where: {
        status: 'PENDING',
        pixTxid: { not: null },
        dueDate: { gte: new Date() },
      },
      take: 50,
    });

    logger.debug({ count: pendingInvoices.length }, 'Polling pending payments');

    for (const invoice of pendingInvoices) {
      if (!invoice.pixTxid) continue;

      try {
        const status = await pixService.checkPixStatus(invoice.pixTxid);

        if (status.status === 'CONCLUIDA') {
          // Payment received
          await prisma.invoice.update({
            where: { id: invoice.id },
            data: {
              status: 'PAID',
              paidAt: new Date(),
              paidAmount: status.amount,
              bankReference: status.endToEndId,
            },
          });

          logger.info({ 
            invoiceId: invoice.id, 
            txid: invoice.pixTxid,
            amount: status.amount,
          }, 'Payment confirmed');

          // Activate contract if linked
          if (invoice.contractId) {
            await prisma.contract.update({
              where: { id: invoice.contractId },
              data: {
                status: 'ACTIVE',
                paymentReceivedAt: new Date(),
                activatedAt: new Date(),
              },
            });
          }
        }
      } catch (error) {
        logger.warn({ 
          error, 
          invoiceId: invoice.id,
          txid: invoice.pixTxid,
        }, 'Failed to check payment status');
      }
    }
  } catch (error) {
    logger.error({ error }, 'Polling error');
  }
}

// Start polling
logger.info({ interval: POLLING_INTERVAL }, 'Payment worker started');

setInterval(pollPendingPayments, POLLING_INTERVAL);

// Initial poll
pollPendingPayments();

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down');
  await prisma.$disconnect();
  process.exit(0);
});