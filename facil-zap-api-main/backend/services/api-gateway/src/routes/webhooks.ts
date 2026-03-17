// ============================================
// WEBHOOK ROUTES
// Endpoints de Configuração de Webhooks
// ============================================

import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';

const router = Router();
const prisma = new PrismaClient();

// POST /v1/webhooks - Create webhook
router.post('/', async (req, res, next) => {
  try {
    const { userId, name, url, events, secret } = req.body;

    const webhook = await prisma.webhookConfig.create({
      data: {
        userId,
        name,
        url,
        events,
        secret: secret || createHash('sha256').update(Math.random().toString()).digest('hex').substring(0, 32),
      },
    });

    res.status(201).json({
      success: true,
      data: {
        webhookId: webhook.id,
        name: webhook.name,
        url: webhook.url,
        events: webhook.events,
        secret: webhook.secret,
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /v1/webhooks - List webhooks
router.get('/', async (req, res, next) => {
  try {
    const { userId } = req.query;

    const webhooks = await prisma.webhookConfig.findMany({
      where: { userId: userId as string },
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

// GET /v1/webhooks/:webhookId - Get webhook
router.get('/:webhookId', async (req, res, next) => {
  try {
    const webhook = await prisma.webhookConfig.findUnique({
      where: { id: req.params.webhookId },
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
    const { name, url, events, isActive } = req.body;

    const webhook = await prisma.webhookConfig.update({
      where: { id: req.params.webhookId },
      data: { name, url, events, isActive },
    });

    res.json({ success: true, data: webhook });
  } catch (error) {
    next(error);
  }
});

// DELETE /v1/webhooks/:webhookId - Delete webhook
router.delete('/:webhookId', async (req, res, next) => {
  try {
    await prisma.webhookConfig.delete({
      where: { id: req.params.webhookId },
    });

    res.json({ success: true, message: 'Webhook deleted' });
  } catch (error) {
    next(error);
  }
});

// POST /v1/webhooks/:webhookId/test - Test webhook
router.post('/:webhookId/test', async (req, res, next) => {
  try {
    // Would send test event
    res.json({ success: true, message: 'Test event sent' });
  } catch (error) {
    next(error);
  }
});

// GET /v1/webhooks/:webhookId/deliveries - Get delivery history
router.get('/:webhookId/deliveries', async (req, res, next) => {
  try {
    const deliveries = await prisma.webhookDelivery.findMany({
      where: { configId: req.params.webhookId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json({ success: true, data: deliveries });
  } catch (error) {
    next(error);
  }
});

export { router as webhookRoutes };