import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';
import config from '../config';

interface CustomError extends Error {
  statusCode?: number;
  code?: string;
  details?: unknown;
}

const errorHandler = (
  error: CustomError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  let statusCode = error.statusCode || 500;
  let message = error.message || 'Internal Server Error';
  let code = error.code || 'INTERNAL_ERROR';

  // Log the error
  logger.error('Error occurred:', {
    requestId: (req as any).id,
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });

  // Handle specific error types
  if (error.name === 'ValidationError') {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Validation failed';
  } else if (error.name === 'UnauthorizedError') {
    statusCode = 401;
    code = 'UNAUTHORIZED';
    message = 'Authentication required';
  } else if (error.name === 'ForbiddenError') {
    statusCode = 403;
    code = 'FORBIDDEN';
    message = 'Access denied';
  } else if (error.name === 'NotFoundError') {
    statusCode = 404;
    code = 'NOT_FOUND';
    message = 'Resource not found';
  } else if (error.name === 'ConflictError') {
    statusCode = 409;
    code = 'CONFLICT';
    message = 'Resource conflict';
  } else if (error.name === 'DatabaseError') {
    statusCode = 500;
    code = 'DATABASE_ERROR';
    message = 'Database operation failed';
  } else if (error.name === 'BlockchainError') {
    statusCode = 500;
    code = 'BLOCKCHAIN_ERROR';
    message = 'Blockchain operation failed';
  }

  // Prepare error response
  const errorResponse = {
    success: false,
    error: {
      code,
      message,
      ...(config.server.env === 'development' && {
        stack: error.stack,
        details: error.details,
      }),
    },
    timestamp: new Date().toISOString(),
    requestId: (req as any).id,
  };

  res.status(statusCode).json(errorResponse);
};

export default errorHandler;