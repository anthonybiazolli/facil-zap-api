// ============================================
// VALIDATION MIDDLEWARE
// ============================================

import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';

export const calculateDelaySchema = z.object({
  instanceId: z.string().min(1),
  messageType: z.enum(['text', 'image', 'video', 'audio', 'document', 'location', 'contact']),
  contentLength: z.number().optional(),
  config: z.object({
    enabled: z.boolean().optional(),
    minIntervalMs: z.number().min(100).optional(),
    maxIntervalMs: z.number().min(100).optional(),
    typingSimulation: z.boolean().optional(),
    humanWakeUp: z.boolean().optional(),
  }).optional(),
});

export const calculateTypingSchema = z.object({
  text: z.string().min(1),
  config: z.object({
    typingSimulation: z.boolean().optional(),
  }).optional(),
});

export const recordActivitySchema = z.object({
  type: z.enum(['message_sent', 'message_received', 'login', 'logout']),
  metadata: z.record(z.any()).optional(),
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