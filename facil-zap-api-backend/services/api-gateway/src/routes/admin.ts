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
    const users = await prisma.user.findMany({
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
        apiKeys: {
          select: {
            id: true,
            name: true,
            keyPrefix: true,
            isActive: true,
            lastUsedAt: true,
          },
        },
        _count: {
          select: {
            auditLogs: true,
          },
        },
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
    const user = await prisma.user.update({
      where: { id: req.params.userId },
      data: req.body,
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
        user: {
          select: { name: true, email: true },
        },
      },
    });

    res.json({ success: true, data: instances });
  } catch (error) {
    next(error);
  }
});

// GET /v1/admin/stats - Get system statistics
router.get('/stats', async (req, res, next) => {
  try {
    const [
      totalUsers,
      totalInstances,
      totalMessages,
      totalApiKeys,
      activeInstances,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.whatsAppInstance.count(),
      prisma.message.count(),
      prisma.apiKey.count(),
      prisma.whatsAppInstance.count({
        where: { status: 'READY' },
      }),
    ]);

    res.json({
      success: true,
      data: {
        users: {
          total: totalUsers,
        },
        instances: {
          total: totalInstances,
          active: activeInstances,
        },
        messages: {
          total: totalMessages,
        },
        apiKeys: {
          total: totalApiKeys,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

export { router as adminRoutes };
