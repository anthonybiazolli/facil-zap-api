// ============================================
// AUTH MIDDLEWARE
// ============================================

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { createHash } from 'crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const API_KEY_SALT = process.env.API_KEY_SALT || 'salt';

// JWT Authentication for admin routes
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ success: false, error: 'Authorization header required' });
      return;
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    
    (req as any).userId = decoded.userId;
    next();
  } catch (error) {
    res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
}

// API Key Authentication for API routes
export async function apiKeyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const apiKey = req.headers['x-api-key'] as string;
    
    if (!apiKey) {
      res.status(401).json({ success: false, error: 'API key required' });
      return;
    }

    // Hash the provided key
    const keyHash = createHash('sha256')
      .update(apiKey + API_KEY_SALT)
      .digest('hex');

    // Find the key in database
    const keyRecord = await prisma.apiKey.findFirst({
      where: {
        keyHash,
        isActive: true,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
    });

    if (!keyRecord) {
      res.status(401).json({ success: false, error: 'Invalid or expired API key' });
      return;
    }

    // Update last used
    await prisma.apiKey.update({
      where: { id: keyRecord.id },
      data: { lastUsedAt: new Date() },
    });

    // Log the request
    await prisma.auditLog.create({
      data: {
        apiKeyId: keyRecord.id,
        userId: keyRecord.userId,
        action: 'API_REQUEST',
        resource: 'api',
        requestMethod: req.method,
        requestPath: req.path,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        success: true,
      },
    });

    (req as any).userId = keyRecord.userId;
    (req as any).apiKeyId = keyRecord.id;
    (req as any).permissions = keyRecord.permissions;
    
    next();
  } catch (error) {
    res.status(500).json({ success: false, error: 'Authentication error' });
  }
}
