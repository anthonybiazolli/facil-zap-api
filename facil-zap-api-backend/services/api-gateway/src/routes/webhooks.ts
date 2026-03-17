// ============================================
// WEBHOOK ROUTES
// Endpoints de Webhooks
// ============================================

import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// GET /v1/webhooks - List webhook configurations
router.get('/', async (req, res, next) => {
  try {
    const userId = (req as any).userId;
    
    const webhooks = await prisma.webhookConfig.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        url: true,
        events: true,
        isActive: true,
        lastTriggeredAt: true,
        createdAt: true,
      },
    });

    res.json({ success: true, data: webhooks });
  } catch (error) {
    next(error);
  }
});

// POST /v1/webhooks - Create webhook
router.post('/', async (req, res, next) => {
  try {
    const userId = (req as any).userId;
    const { name, url, events, secret, maxRetries, retryIntervalMs } = req.body;
    
    const webhook = await prisma.webhookConfig.create({
      data: {
        userId,
        name,
        url,
        events,
        secret,
        maxRetries,
        retryIntervalMs,
      },
    });

    res.status(201).json({ success: true, data: webhook });
  } catch (error) {
    next(error);
  }
});

// GET /v1/webhooks/:webhookId - Get webhook
router.get('/:webhookId', async (req, res, next) => {
  try {
    const userId = (req as any).userId;
    
    const webhook = await prisma.webhookConfig.findFirst({
      where: { id: req.params.webhookId, userId },
    });

    if (!webhook) {
      res.status(404).json({ success: false, error: 'Webhook not found' });
      return;
    }

    res.json({ success: true, data: webhook });
  } catch (error) {
    next(error);
  }
});

// PATCH /v1/webhooks/:webhookId - Update webhook
router.patch('/:webhookId', async (req, res, next) => {
  try {
    const userId = (req as any).userId;
    
    const webhook = await prisma.webhookConfig.updateMany({
      where: { id: req.params.webhookId, userId },
      data: req.body,
    });

    res.json({ success: true, data: webhook });
  } catch (error) {
    next(error);
  }
});

// DELETE /v1/webhooks/:webhookId - Delete webhook
router.delete('/:webhookId', async (req, res, next) => {
  try {
    const userId = (req as any).userId;
    
    await prisma.webhookConfig.deleteMany({
      where: { id: req.params.webhookId, userId },
    });

    res.json({ success: true, message: 'Webhook deleted' });
  } catch (error) {
    next(error);
  }
});

// POST /webhooks/zapsign - ZapSign webhook handler
router.post('/zapsign', async (req, res, next) => {
  try {
    console.log('ZapSign webhook received:', req.body);
    res.json({ success: true, message: 'Webhook received' });
  } catch (error) {
    next(error);
  }
});

// POST /webhooks/pix - PIX webhook handler
router.post('/pix', async (req, res, next) => {
  try {
    console.log('PIX webhook received:', req.body);
    res.json({ success: true, message: 'Webhook received' });
  } catch (error) {
    next(error);
  }
});

// POST /webhooks/whatsapp - WhatsApp webhook handler
router.post('/whatsapp', async (req, res, next) => {
  try {
    console.log('WhatsApp webhook received:', req.body);
    res.json({ success: true, message: 'Webhook received' });
  } catch (error) {
    next(error);
  }
});

export { router as webhookRoutes };
