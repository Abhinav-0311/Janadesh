// Common API response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  timestamp: string;
  requestId?: string;
}

// Database types
export interface DatabaseHealthCheck {
  status: 'healthy' | 'unhealthy';
  totalConnections: number;
  idleConnections: number;
  waitingConnections: number;
}

// Redis types
export interface RedisHealthCheck {
  status: 'healthy' | 'unhealthy';
  latency: number;
  memory: object | null;
}

// User types
export interface User {
  id: string;
  walletAddress: string;
  email: string;
  username: string;
  firstName?: string;
  lastName?: string;
  isVerified: boolean;
  role: 'admin' | 'creator' | 'voter';
  createdAt: Date;
  updatedAt: Date;
}

// Election types
export interface Election {
  id: string;
  contractAddress: string;
  title: string;
  description?: string;
  creatorId: string;
  electionType: 'single' | 'multiple' | 'ranked';
  startTime: Date;
  endTime: Date;
  isPublic: boolean;
  status: 'pending' | 'active' | 'ended' | 'cancelled';
  createdAt: Date;
  updatedAt: Date;
}

// Candidate types
export interface Candidate {
  id: string;
  electionId: string;
  name: string;
  description?: string;
  imageUrl?: string;
  position: number;
  createdAt: Date;
}

// Vote types
export interface Vote {
  id: string;
  electionId: string;
  voterAddress: string;
  candidateId: string;
  transactionHash: string;
  blockNumber?: number;
  votedAt: Date;
}

// JWT payload types
export interface JwtPayload {
  userId: string;
  walletAddress: string;
  role: string;
  iat: number;
  exp: number;
}

// Request types
import { Request } from 'express';

export interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    walletAddress: string;
    role: string;
    voterStatus: string;
    isVerified: boolean;
    isEmailVerified: boolean;
    email?: string;
    username?: string;
  };
}

// Blockchain types
export interface BlockchainTransaction {
  hash: string;
  blockNumber?: number;
  gasUsed?: string;
  status: 'pending' | 'confirmed' | 'failed';
}

// WebSocket types
export interface WebSocketMessage {
  type: 'election_update' | 'vote_confirmation' | 'system_notification';
  data: unknown;
  timestamp: string;
}

// Error types
export class CustomError extends Error {
  public statusCode: number;
  public code: string;
  public details?: unknown;

  constructor(message: string, statusCode: number = 500, code: string = 'INTERNAL_ERROR', details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends CustomError {
  constructor(message: string, details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class UnauthorizedError extends CustomError {
  constructor(message: string = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends CustomError {
  constructor(message: string = 'Access denied') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class NotFoundError extends CustomError {
  constructor(message: string = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends CustomError {
  constructor(message: string = 'Resource conflict') {
    super(message, 409, 'CONFLICT');
  }
}

export class DatabaseError extends CustomError {
  constructor(message: string, details?: unknown) {
    super(message, 500, 'DATABASE_ERROR', details);
  }
}

export class BlockchainError extends CustomError {
  constructor(message: string, details?: unknown) {
    super(message, 500, 'BLOCKCHAIN_ERROR', details);
  }
}