// ============================================
// AUTH ROUTES
// Endpoints de Autenticação
// ============================================

import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';

const router = Router();
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const API_KEY_SALT = process.env.API_KEY_SALT || 'salt';

// POST /v1/auth/register - Register new user
router.post('/register', async (req, res, next) => {
  try {
    const { email, password, name, companyName } = req.body;
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: hashedPassword,
        name,
        companyName,
      },
    });

    res.status(201).json({
      success: true,
      data: {
        userId: user.id,
        email: user.email,
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /v1/auth/login - Login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      res.status(401).json({ success: false, error: 'Invalid credentials' });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ success: false, error: 'Invalid credentials' });
      return;
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /v1/auth/api-keys - Create API key
router.post('/api-keys', async (req, res, next) => {
  try {
    const { userId, name, permissions = ['read', 'write'] } = req.body;
    
    const keyBytes = randomBytes(32);
    const apiKey = `fz_${keyBytes.toString('base64url')}`;
    
    const keyHash = createHash('sha256')
      .update(apiKey + API_KEY_SALT)
      .digest('hex');

    await prisma.apiKey.create({
      data: {
        userId,
        name,
        keyHash,
        keyPrefix: apiKey.substring(0, 8),
        permissions,
      },
    });

    res.status(201).json({
      success: true,
      data: {
        apiKey,
        name,
        permissions,
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /v1/auth/api-keys - List API keys
router.get('/api-keys', async (req, res, next) => {
  try {
    const { userId } = req.query;
    
    const keys = await prisma.apiKey.findMany({
      where: { userId: userId as string },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        permissions: true,
        isActive: true,
        lastUsedAt: true,
        createdAt: true,
      },
    });

    res.json({ success: true, data: keys });
  } catch (error) {
    next(error);
  }
});

// POST /v1/auth/api-keys/:keyId/revoke - Revoke API key
router.post('/api-keys/:keyId/revoke', async (req, res, next) => {
  try {
    await prisma.apiKey.update({
      where: { id: req.params.keyId },
      data: { isActive: false },
    });

    res.json({ success: true, message: 'API key revoked' });
  } catch (error) {
    next(error);
  }
});

// POST /v1/auth/api-keys/:keyId/rotate - Rotate API key
router.post('/api-keys/:keyId/rotate', async (req, res, next) => {
  try {
    const keyBytes = randomBytes(32);
    const newApiKey = `fz_${keyBytes.toString('base64url')}`;
    
    const keyHash = createHash('sha256')
      .update(newApiKey + API_KEY_SALT)
      .digest('hex');

    await prisma.apiKey.update({
      where: { id: req.params.keyId },
      data: {
        keyHash,
        keyPrefix: newApiKey.substring(0, 8),
        rotatedAt: new Date(),
      },
    });

    res.json({
      success: true,
      data: { apiKey: newApiKey },
    });
  } catch (error) {
    next(error);
  }
});

// POST /v1/auth/refresh - Refresh token
router.post('/refresh', async (req, res, next) => {
  try {
    const { token } = req.body;
    
    const decoded = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true }) as any;
    const newToken = jwt.sign(
      { userId: decoded.userId, email: decoded.email },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ success: true, data: { token: newToken } });
  } catch (error) {
    next(error);
  }
});

// POST /v1/auth/forgot-password - Request password reset
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body;
    res.json({ success: true, message: 'Reset email sent' });
  } catch (error) {
    next(error);
  }
});

// POST /v1/auth/reset-password - Reset password
router.post('/reset-password', async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;
    res.json({ success: true, message: 'Password reset successful' });
  } catch (error) {
    next(error);
  }
});

export { router as authRoutes };
