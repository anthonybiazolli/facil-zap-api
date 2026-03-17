// ============================================
// AUDIT ROUTES
// Endpoints de Auditoria
// ============================================

import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// GET /v1/audit/logs - Get audit logs
router.get('/logs', async (req, res, next) => {
  try {
    const { userId, instanceId, action, limit = '50', offset = '0' } = req.query;

    const where: any = {};
    if (userId) where.userId = userId as string;
    if (instanceId) where.instanceId = instanceId as string;
    if (action) where.action = action as string;

    const logs = await prisma.auditLog.findMany({
      where,
      take: parseInt(limit as string),
      skip: parseInt(offset as string),
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { email: true, name: true } },
      },
    });

    res.json({ success: true, data: logs });
  } catch (error) {
    next(error);
  }
});

// GET /v1/audit/logs/:logId - Get specific log
router.get('/logs/:logId', async (req, res, next) => {
  try {
    const log = await prisma.auditLog.findUnique({
      where: { id: req.params.logId },
    });

    if (!log) {
      res.status(404).json({ success: false, error: 'Log not found' });
      return;
    }

    res.json({ success: true, data: log });
  } catch (error) {
    next(error);
  }
});

// GET /v1/audit/metrics - Get audit metrics
router.get('/metrics', async (req, res, next) => {
  try {
    const { instanceId, startDate, endDate } = req.query;

    const where: any = {};
    if (instanceId) where.instanceId = instanceId as string;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate as string);
      if (endDate) where.createdAt.lte = new Date(endDate as string);
    }

    const [
      totalActions,
      successCount,
      failureCount,
      actionBreakdown,
    ] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.count({ where: { ...where, success: true } }),
      prisma.auditLog.count({ where: { ...where, success: false } }),
      prisma.auditLog.groupBy({
        by: ['action'],
        where,
        _count: { action: true },
      }),
    ]);

    res.json({
      success: true,
      data: {
        totalActions,
        successCount,
        failureCount,
        actionBreakdown,
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /v1/audit/instance/:instanceId/metrics - Get instance metrics
router.get('/instance/:instanceId/metrics', async (req, res, next) => {
  try {
    const { instanceId } = req.params;

    const metrics = await prisma.auditLog.groupBy({
      by: ['action'],
      where: { instanceId },
      _count: { action: true },
    });

    res.json({ success: true, data: metrics });
  } catch (error) {
    next(error);
  }
});

export { router as auditRoutes };