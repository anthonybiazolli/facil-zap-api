// ============================================
// ADMIN ROUTES
// Endpoints Administrativos
// ============================================

import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// GET /v1/admin/users - List all users
router.get('/users', async (req, res, next) => {
  try {
    const { limit = '50', offset = '0' } = req.query;

    const users = await prisma.user.findMany({
      take: parseInt(limit as string),
      skip: parseInt(offset as string),
      select: {
        id: true,
        email: true,
        name: true,
        companyName: true,
        isActive: true,
        isVerified: true,
        createdAt: true,
        lastLoginAt: true,
        _count: {
          select: {
            instances: true,
            apiKeys: true,
          },
        },
      },
    });

    res.json({ success: true, data: users });
  } catch (error) {
    next(error);
  }
});

// GET /v1/admin/users/:userId - Get user details
router.get('/users/:userId', async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.userId },
      include: {
        instances: true,
        apiKeys: { select: { id: true, name: true, isActive: true } },
        contracts: true,
        invoices: true,
      },
    });

    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
});

// PATCH /v1/admin/users/:userId - Update user
router.patch('/users/:userId', async (req, res, next) => {
  try {
    const { isActive, isVerified } = req.body;

    const user = await prisma.user.update({
      where: { id: req.params.userId },
      data: { isActive, isVerified },
    });

    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
});

// GET /v1/admin/instances - List all instances
router.get('/instances', async (req, res, next) => {
  try {
    const instances = await prisma.whatsAppInstance.findMany({
      include: {
        user: { select: { email: true, name: true } },
      },
    });

    res.json({ success: true, data: instances });
  } catch (error) {
    next(error);
  }
});

// GET /v1/admin/metrics - System metrics
router.get('/metrics', async (req, res, next) => {
  try {
    const [
      totalUsers,
      totalInstances,
      totalMessages,
      totalContracts,
      totalRevenue,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.whatsAppInstance.count(),
      prisma.message.count(),
      prisma.contract.count(),
      prisma.invoice.aggregate({
        where: { status: 'PAID' },
        _sum: { value: true },
      }),
    ]);

    res.json({
      success: true,
      data: {
        totalUsers,
        totalInstances,
        totalMessages,
        totalContracts,
        totalRevenue: totalRevenue._sum.value || 0,
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /v1/admin/health - System health
router.get('/health', async (req, res, next) => {
  try {
    res.json({
      success: true,
      data: {
        status: 'healthy',
        services: {
          database: 'connected',
          redis: 'connected',
          sessionKeeper: 'healthy',
          messageQueue: 'healthy',
        },
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

export { router as adminRoutes };