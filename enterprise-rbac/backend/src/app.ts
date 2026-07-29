import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';

import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import roleRoutes from './routes/roles';
import permissionRoutes from './routes/permissions';
import organizationRoutes from './routes/organization';
import auditRoutes from './routes/audit';
import dashboardRoutes from './routes/dashboard';
import { apiRateLimiter } from './middlewares/rateLimiter';
import { ApiError } from './utils/apiError';

const app = express();

app.set('trust proxy', 1);

app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? true,
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(apiRateLimiter);

app.get('/api/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'OK', message: 'Enterprise RBAC API is running.' });
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/roles', roleRoutes);
app.use('/api/v1/permissions', permissionRoutes);
app.use('/api/v1/organization', organizationRoutes);
app.use('/api/v1/audit', auditRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);

app.use((req: Request, res: Response) => {
  res.status(404).json({ message: 'Not Found' });
});

// Global Error Handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) return next(err);

  const status = err instanceof ApiError ? err.status : err.status || 500;
  if (status >= 500) console.error(err.stack);

  res.status(status).json({
    error: {
      message: err.message || 'Internal Server Error',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    },
  });
});

export default app;
