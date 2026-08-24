import type { Request } from 'express';

export type UserRole = 'user' | 'admin' | 'tech_support';

export interface AuthenticatedUser {
  _id: string;
  id?: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  sessionVersion: number;
}

export interface AppError extends Error {
  code?: string;
  status?: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export type AuthenticatedRequest = Request & { user: AuthenticatedUser };
