// ============================================
// ERROR HANDLER MIDDLEWARE
// ============================================

import { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import { createLogger } from '../utils/logger';

const logger = createLogger('ErrorHandler');

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  logger.error({ 
    err, 
    path: req.path,
    method: req.method,
  }, 'Unhandled error');

  // Axios errors
  if (axios.isAxiosError(err)) {
    const status = err.response?.status || 500;
    const message = err.response?.data?.error || err.message;
    
    res.status(status).json({
      success: false,
      error: message,
      service: err.config?.url,
    });
    return;
  }

  // Default error
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
}