import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import path from 'path';

import { config } from './config/environment';
import { connectDatabase } from './config/database';
import { notFoundHandler, errorHandler } from './middleware/error.middleware';

const app: Application = express();

const swaggerOptions: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'HRFlow Pro API',
      version: '1.0.0',
      description: 'HRFlow Pro - Human Resource Management System API Documentation',
      contact: {
        name: 'HRFlow Pro Team',
        email: 'support@hrflowpro.com',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      {
        url: `${config.clientUrl}${config.apiPrefix}`,
        description: 'Development Server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'accessToken',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Error message' },
            errors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field: { type: 'string' },
                  message: { type: 'string' },
                  code: { type: 'string' },
                },
              },
            },
            stack: { type: 'string' },
          },
        },
        Success: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'Operation successful' },
            data: { type: 'object' },
          },
        },
        Pagination: {
          type: 'object',
          properties: {
            page: { type: 'integer', example: 1 },
            limit: { type: 'integer', example: 10 },
            total: { type: 'integer', example: 100 },
            totalPages: { type: 'integer', example: 10 },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }, { cookieAuth: [] }],
    tags: [
      { name: 'Authentication', description: 'Authentication and authorization endpoints' },
      { name: 'Employees', description: 'Employee management endpoints' },
      { name: 'Branches', description: 'Branch management endpoints' },
      { name: 'Departments', description: 'Department management endpoints' },
      { name: 'Attendance', description: 'Attendance tracking endpoints' },
      { name: 'Leaves', description: 'Leave management endpoints' },
      { name: 'Payroll', description: 'Payroll processing endpoints' },
      { name: 'Recruitment', description: 'Recruitment and hiring endpoints' },
      { name: 'Performance', description: 'Performance management endpoints' },
      { name: 'Training', description: 'Training and development endpoints' },
      { name: 'Appointments', description: 'Appointment scheduling endpoints' },
      { name: 'Reports', description: 'Reports and analytics endpoints' },
    ],
  },
  apis: ['./src/routes/*.ts', './src/routes/**/*.ts'],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

const requestIdMiddleware = (req: Request, _res: Response, next: NextFunction): void => {
  req.id = req.headers['x-request-id'] as string || uuidv4();
  req.headers['x-request-id'] = req.id;
  next();
};

declare global {
  namespace Express {
    interface Request {
      id: string;
    }
  }
}

const corsOptions: cors.CorsOptions = {
  origin: config.cors.origin,
  credentials: config.cors.credentials,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Requested-With'],
  exposedHeaders: ['X-Request-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
  maxAge: 86400,
};

const generalLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.ip || req.socket.remoteAddress || 'unknown',
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      message: 'Too many requests from this IP, please try again later.',
    });
  },
});

const authLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.authMaxRequests,
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.ip || req.socket.remoteAddress || 'unknown',
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      message: 'Too many authentication attempts, please try again later.',
    });
  },
});

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'self'"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
}));

app.use(cors(corsOptions));
app.use(compression());
app.use(cookieParser(config.session.secret || 'default-secret-change-in-production'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

if (config.isDevelopment) {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

app.use(requestIdMiddleware);

if (!config.isDevelopment) {
  app.use(generalLimiter);
  app.use(`${config.apiPrefix}/auth`, authLimiter);
}

if (config.swagger.enabled) {
  app.use(config.swagger.path, swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'HRFlow Pro API Documentation',
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
      showExtensions: true,
      showCommonExtensions: true,
    },
  }));
}

app.use('/uploads', express.static(path.join(process.cwd(), config.upload.dir), {
  maxAge: '1d',
  etag: true,
  lastModified: true,
}));

import authRoutes from './routes/auth.routes';
import employeeRoutes from './routes/employee.routes';
import branchRoutes from './routes/branch.routes';
import departmentRoutes from './routes/department.routes';
import attendanceRoutes from './routes/attendance.routes';
import leaveRoutes from './routes/leave.routes';
import payrollRoutes from './routes/payroll.routes';
import recruitmentRoutes from './routes/recruitment.routes';
import performanceRoutes from './routes/performance.routes';
import trainingRoutes from './routes/training.routes';
import appointmentRoutes from './routes/appointment.routes';
import reportRoutes from './routes/report.routes';

app.use(`${config.apiPrefix}/auth`, authRoutes);
app.use(`${config.apiPrefix}/employees`, employeeRoutes);
app.use(`${config.apiPrefix}/branches`, branchRoutes);
app.use(`${config.apiPrefix}/departments`, departmentRoutes);
app.use(`${config.apiPrefix}/attendance`, attendanceRoutes);
app.use(`${config.apiPrefix}/leaves`, leaveRoutes);
app.use(`${config.apiPrefix}/payroll`, payrollRoutes);
app.use(`${config.apiPrefix}/recruitment`, recruitmentRoutes);
app.use(`${config.apiPrefix}/performance`, performanceRoutes);
app.use(`${config.apiPrefix}/training`, trainingRoutes);
app.use(`${config.apiPrefix}/appointments`, appointmentRoutes);
app.use(`${config.apiPrefix}/reports`, reportRoutes);

app.get(`${config.apiPrefix}/health`, (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'HRFlow Pro API is healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.env,
    database: {
      status: require('./config/database').isConnected() ? 'connected' : 'disconnected',
    },
  });
});

app.get(`${config.apiPrefix}/docs`, (_req: Request, res: Response) => {
  if (config.swagger.enabled) {
    res.redirect(config.swagger.path);
  } else {
    res.status(404).json({
      success: false,
      message: 'API documentation is disabled',
    });
  }
});

app.use(notFoundHandler);
app.use(errorHandler);

export const initializeApp = async (): Promise<Application> => {
  await connectDatabase();
  return app;
};

export default app;