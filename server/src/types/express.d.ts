import { User, UserRole } from '../models/User';

declare global {
  namespace Express {
    interface Request {
      user?: User & { role: UserRole };
      userId?: string;
      userRole?: UserRole;
      requestId?: string;
      ip?: string;
    }
  }
}

export {};