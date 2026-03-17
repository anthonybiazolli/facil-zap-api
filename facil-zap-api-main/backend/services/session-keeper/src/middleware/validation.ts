// ============================================
// VALIDATION MIDDLEWARE
// Validação de requisições com Zod
// ============================================

import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';

// Schemas de validação
export const createSessionSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  syncFullHistory: z.boolean().optional(),
});

export const sendMessageSchema = z.object({
  remoteJid: z.string().regex(/^[0-9]+@s\.whatsapp\.net$|^[0-9-]+@g\.us$/),
  type: z.enum(['text', 'image', 'video', 'audio', 'document', 'location', 'contact']),
  content: z.record(z.any()),
  options: z.object({
    delay: z.number().optional(),
    presence: z.enum(['typing', 'recording', 'online', 'offline']).optional(),
    linkPreview: z.boolean().optional(),
  }).optional(),
  antiBan: z.object({
    enabled: z.boolean(),
    minIntervalMs: z.number().min(100).optional(),
    maxIntervalMs: z.number().min(100).optional(),
    typingSimulation: z.boolean().optional(),
    humanWakeUp: z.boolean().optional(),
  }).optional(),
});

export const bulkMessageSchema = z.object({
  messages: z.array(sendMessageSchema).min(1).max(100),
  antiBan: z.object({
    enabled: z.boolean(),
    minIntervalMs: z.number().optional(),
    maxIntervalMs: z.number().optional(),
    typingSimulation: z.boolean().optional(),
    randomizeOrder: z.boolean().optional(),
  }).optional(),
});

export const presenceSchema = z.object({
  presence: z.enum(['unavailable', 'available', 'composing', 'recording', 'paused']),
  remoteJid: z.string().optional(),
});

export const groupSubjectSchema = z.object({
  subject: z.string().min(1).max(100),
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