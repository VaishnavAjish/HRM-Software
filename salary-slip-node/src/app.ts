import Fastify, {
  type FastifyError,
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';

import { env, isProduction } from './config/env.js';
import { redact } from './lib/laravel/aadhaar.js';
import { registerAuthRoutes } from './modules/auth/auth.routes.js';
import { registerShiftRoutes } from './modules/shifts/shifts.routes.js';
import { registerEmployeeRoutes } from './modules/employees/employees.routes.js';
import { registerAuthorizationRoutes } from './modules/authorization/authorization.routes.js';
import { registerAgentRoutes } from './modules/agents/agents.routes.js';
import { registerTrialFormRoutes } from './modules/trialforms/trialforms.routes.js';
import { registerProfileRoutes } from './modules/profile/profile.routes.js';
import { AuthService } from './modules/auth/auth.service.js';
import { PrismaAuthRepository, PrismaCacheStore } from './modules/auth/auth.repository.js';
import { TokenBlacklist } from './modules/auth/token-blacklist.js';
import { AuditLogger } from './lib/audit/audit-logger.js';
import { PrismaAuditSink } from './lib/audit/audit.repository.js';

/**
 * Application factory.
 *
 * Kept separate from server.ts so tests can build an instance without binding
 * a port, and so the migration can mount modules one at a time — this file is
 * the single place a newly ported module becomes reachable.
 */

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      // Aadhaar numbers reach log lines through error messages and request
      // bodies; the PHP side redacts them and so must this.
      formatters: {
        log: (obj) => obj,
      },
      serializers: {
        // stack is always a string: the pino serializer type requires the
        // property to be present, and `exactOptionalPropertyTypes` will not
        // accept `undefined` standing in for "omitted".
        err: (err: Error) => ({
          type: err.name,
          message: redact(err.message),
          stack: isProduction ? '' : (err.stack ?? ''),
        }),
      },
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.body.password',
          'req.body.aadhar_card_no',
          'req.body.aadhaar_card_no',
        ],
        censor: '[redacted]',
      },
    },
    // Laravel sat behind a proxy in production; without this the rate limiter
    // buckets every caller under the proxy's address.
    trustProxy: true,
    bodyLimit: 25 * 1024 * 1024, // matches the PHP upload ceiling
  });

  await app.register(helmet, {
    // The API serves JSON and presigned redirects, never HTML, so CSP here
    // would only ever mis-fire.
    contentSecurityPolicy: false,
  });

  await app.register(cors, {
    // Closed by default. The PHP config allows '*', which is what let the
    // unauthenticated appointment endpoint be read from any website.
    origin: env.CORS_ORIGINS.length > 0 ? env.CORS_ORIGINS : false,
    credentials: false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // The identity-claim endpoint accepts a photo; limits mirror the PHP
  // validator (image, max 5120 KB).
  await app.register(multipart, {
    limits: { fileSize: 5120 * 1024, files: 1, fields: 30 },
  });

  await app.register(rateLimit, {
    global: false, // opt in per route, mirroring Laravel's per-route throttle:
    max: 60,
    timeWindow: '1 minute',
  });

  registerErrorHandler(app);

  // Migrated modules mount here, one at a time. Anything not listed is still
  // served by Laravel and reaches it through the reverse proxy.
  const authService = new AuthService(
    new PrismaAuthRepository(),
    new TokenBlacklist(new PrismaCacheStore(), 0),
    { jwtSecret: env.JWT_SECRET, jwtTtlMinutes: env.JWT_TTL, issuer: `http://${env.HOST}:${env.PORT}` },
  );
  const audit = new AuditLogger(new PrismaAuditSink());

  await registerAuthRoutes(app, { service: authService });
  await registerShiftRoutes(app, { authService, audit });
  await registerEmployeeRoutes(app, { authService, audit });
  await registerAuthorizationRoutes(app, { authService, audit });
  await registerAgentRoutes(app, { authService, audit });
  await registerTrialFormRoutes(app, { authService, audit });
  await registerProfileRoutes(app, { authService });

  /**
   * Health check. Deliberately unauthenticated and free of dependency probes:
   * a load balancer needs to know the process is up, not whether Postgres is
   * reachable — conflating the two takes the whole fleet out during a brief
   * database blip.
   */
  app.get('/api/health', async () => ({
    status: 'ok',
    service: 'salary-slip-node',
    env: env.NODE_ENV,
  }));

  return app;
}

/**
 * One error shape for the whole API, matching what the React client already
 * parses. src/utils/api.js reads, in order: data.message, a string data.error,
 * then data.error.message — so `message` is what must always be present.
 */
function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    const status = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;

    if (status >= 500) {
      request.log.error({ err: error }, 'unhandled error');
    }

    reply.status(status).send({
      status: false,
      // Never surface an internal message to the client in production; it is
      // in the log above, correlated by request id.
      message:
        status >= 500 && isProduction
          ? 'Something went wrong. Please try again.'
          : redact(error.message),
    });
  });

  app.setNotFoundHandler((_request: FastifyRequest, reply: FastifyReply) => {
    reply.status(404).send({ status: false, message: 'Not found' });
  });
}
