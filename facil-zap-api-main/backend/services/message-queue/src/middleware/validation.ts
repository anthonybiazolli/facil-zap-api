// ============================================
// VALIDATION MIDDLEWARE
// ============================================

import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';

// Content schemas
const textContentSchema = z.object({
  text: z.string().min(1).max(65536),
  mentions: z.array(z.string()).optional(),
});

const mediaContentSchema = z.object({
  url: z.string().url().optional(),
  base64: z.string().optional(),
  caption: z.string().max(1024).optional(),
  mimetype: z.string().optional(),
  fileName: z.string().optional(),
});

// Message schemas
export const addMessageSchema = z.object({
  instanceId: z.string().min(1),
  remoteJid: z.string().regex(/^[0-9]+@s\.whatsapp\.net$|^[0-9-]+@g\.us$/),
  type: z.enum(['text', 'image', 'video', 'audio', 'document', 'location', 'contact']),
  content: z.union([textContentSchema, mediaContentSchema, z.record(z.any())]),
  options: z.object({
    delay: z.number().optional(),
    presence: z.enum(['typing', 'recording', 'online', 'offline']).optional(),
    linkPreview: z.boolean().optional(),
  }).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  maxAttempts: z.number().min(1).max(10).optional(),
  antiBanConfig: z.object({
    enabled: z.boolean(),
    typingSimulation: z.boolean().optional(),
    minIntervalMs: z.number().optional(),
    maxIntervalMs: z.number().optional(),
  }).optional(),
});

export const addBatchSchema = z.object({
  messages: z.array(addMessageSchema).min(1).max(5000),
  options: z.object({
    antiBanEnabled: z.boolean().optional(),
    shuffleOrder: z.boolean().optional(),
  }).optional(),
});

export const scheduleMessageSchema = z.object({
  instanceId: z.string().min(1),
  remoteJid: z.string().regex(/^[0-9]+@s\.whatsapp\.net$|^[0-9-]+@g\.us$/),
  type: z.enum(['text', 'image', 'video', 'audio', 'document', 'location', 'contact']),
  content: z.union([textContentSchema, mediaContentSchema, z.record(z.any())]),
  options: z.object({
    delay: z.number().optional(),
    presence: z.enum(['typing', 'recording', 'online', 'offline']).optional(),
    linkPreview: z.boolean().optional(),
  }).optional(),
  scheduledFor: z.string().datetime(),
  antiBanConfig: z.object({
    enabled: z.boolean(),
    typingSimulation: z.boolean().optional(),
  }).optional(),
});

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation error',
          details: error.errors.map(e => ({
            path: e.path.join('.'),
            message: e.message,
          })),
        });
        return;
      }
      next(error);
    }
  };
}