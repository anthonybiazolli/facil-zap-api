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
    
    const logs = await prisma.auditLog.findMany({
      where: {
        ...(userId && { userId: userId as string }),
        ...(instanceId && { instanceId: instanceId as string }),
        ...(action && { action: action as string }),
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit as string),
      skip: parseInt(offset as string),
      include: {
        user: {
          select: { name: true, email: true },
        },
      },
    });

    res.json({ success: true, data: logs });
  } catch (error) {
    next(error);
  }
});

// GET /v1/audit/stats - Get audit statistics
router.get('/stats', async (req, res, next) => {
  try {
    const { userId } = req.query;
    
    const [totalActions, actionsByType, recentErrors] = await Promise.all([
      prisma.auditLog.count({
        where: userId ? { userId: userId as string } : undefined,
      }),
      prisma.auditLog.groupBy({
        by: ['action'],
        where: userId ? { userId: userId as string } : undefined,
        _count: { action: true },
      }),
      prisma.auditLog.findMany({
        where: {
          success: false,
          ...(userId && { userId: userId as string }),
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    res.json({
      success: true,
      data: {
        totalActions,
        actionsByType,
        recentErrors,
      },
    });
  } catch (error) {
    next(error);
  }
});

export { router as auditRoutes };
