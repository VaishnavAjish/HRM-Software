import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { AuditLogger } from '../../lib/audit/audit-logger.js';
import { clientIp } from '../../lib/audit/audit-logger.js';
import { AuthService } from '../auth/auth.service.js';
import { authenticated } from '../auth/guards.js';
import { ResourceError } from '../../lib/errors.js';
import { AuthorizationEngine } from './authorization.engine.js';
import { PrismaAuthorizationRepository } from './authorization.repository.js';
import type { Subject } from './authorization.types.js';
import { isAuthorizationSchemaReady, SCHEMA_NOT_READY_BODY } from './schema-readiness.js';

/**
 * Authorization API.
 *
 * Path-for-path with the routes the React client calls, so a module can be
 * switched to this backend without touching the client:
 *
 *   POST /api/v1/authorization/check | check-batch
 *
 * Decision endpoints only. The management surface — simulate, /v1/roles, the
 * permission matrix, role cloning, scope options and effective-permission
 * previews — was removed along with the Access Control console that was its
 * only caller. It is not reinstated here, because porting it would restore the
 * feature at cutover.
 *
 * Every route is authenticated.
 */

export interface AuthorizationRouteDeps {
  authService: AuthService;
  audit: AuditLogger;
  engine?: AuthorizationEngine;
}

async function respond(reply: FastifyReply, run: () => Promise<unknown>): Promise<unknown> {
  try {
    return reply.send(await run());
  } catch (error) {
    if (error instanceof ResourceError) {
      return reply
        .status(error.statusCode)
        .send({ success: false, error: { code: 'REQUEST_FAILED', message: error.message } });
    }
    throw error;
  }
}

const subjectOf = (request: FastifyRequest): Subject => request.authUser as unknown as Subject;

function metaOf(request: FastifyRequest) {
  return {
    sessionId: (request.headers['x-session-id'] as string | undefined) ?? null,
    ipAddress: clientIp(request),
    device: (request.headers['user-agent'] as string | undefined)?.slice(0, 255) ?? null,
    requestId: (request.headers['x-request-id'] as string | undefined) ?? null,
  };
}

export async function registerAuthorizationRoutes(
  app: FastifyInstance,
  deps: AuthorizationRouteDeps,
): Promise<void> {
  const engine = deps.engine ?? new AuthorizationEngine(new PrismaAuthorizationRepository());

  /**
   * Refuse before touching the database if the authorization schema is absent.
   *
   * Every handler below reaches the authorization_* tables through raw SQL, so
   * a missing schema surfaces as `42P01 relation does not exist` from inside a
   * handler — an opaque 500 that tells the caller nothing and the operator
   * less. When the platform was rolled back out of production on 2026-08-03,
   * Laravel degraded cleanly because RequirePermission checks first; this file
   * had no equivalent.
   *
   * Runs ahead of authentication deliberately: whether the feature exists is
   * not a fact about the caller, and answering it first keeps an unavailable
   * subsystem from looking like an authentication failure.
   */
  const schemaGate = async function ready(_request: FastifyRequest, reply: FastifyReply) {
    if (!(await isAuthorizationSchemaReady())) {
      await reply.status(503).send(SCHEMA_NOT_READY_BODY);
    }
  };

  const guard = { preHandler: [schemaGate, authenticated(deps.authService)] };

  /*
   * There was a requirePermission()/guarded() pair here, applying a permission
   * check to the management routes through the same engine they administered.
   * Both routes below are plain authenticated decision endpoints — a caller
   * asking what it may do needs no permission to ask — so the helpers went with
   * the management surface. Reinstate them alongside any route that writes.
   */

  /* ---- decisions -------------------------------------------------- */

  app.post('/api/v1/authorization/check', guard, async (request, reply) =>
    respond(reply, async () => {
      const body = (request.body ?? {}) as { permissionCode?: string; resource?: Record<string, unknown> };
      if (!body.permissionCode) throw new ResourceError('permissionCode is required', 422);

      const decision = await engine.decide(
        { subject: subjectOf(request), action: body.permissionCode, resource: body.resource ?? {} },
        metaOf(request),
      );

      return { success: true, data: decision };
    }),
  );

  app.post('/api/v1/authorization/check-batch', guard, async (request, reply) =>
    respond(reply, async () => {
      const body = (request.body ?? {}) as {
        checks?: Array<{ permissionCode: string; resource?: Record<string, unknown> }>;
      };
      const checks = body.checks ?? [];

      // Capped so one request cannot turn into an unbounded fan-out of
      // decisions, each of which writes an audit row.
      if (checks.length === 0 || checks.length > 100) {
        throw new ResourceError('checks must contain between 1 and 100 entries', 422);
      }

      const subject = subjectOf(request);
      const meta = metaOf(request);

      const results = await Promise.all(
        checks.map(async (check, index) => ({
          index,
          permissionCode: check.permissionCode,
          decision: await engine.decide(
            { subject, action: check.permissionCode, resource: check.resource ?? {} },
            meta,
          ),
        })),
      );

      return { success: true, data: results };
    }),
  );
}
