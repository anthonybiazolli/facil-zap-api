import { Request, Response, NextFunction } from 'express';
import { createLogger } from '../utils/logger';

const logger = createLogger('ErrorHandler');

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  logger.error({ err, path: req.path }, 'Unhandled error');

  // Axios error from service proxy
  if (err.isAxiosError) {
    const status = err.response?.status || 500;
    const data = err.response?.data || { error: 'Service error' };
    res.status(status).json(data);
    return;
  }

  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
}
