import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { db } from '../../db/client.js';
import { AuditLogger } from '../../lib/audit/audit-logger.js';
import { clientIp } from '../../lib/audit/audit-logger.js';
import { AuthService } from '../auth/auth.service.js';
import { authenticated } from '../auth/guards.js';
import { ResourceError } from '../masters/masters.service.js';
import { AuthorizationEngine } from './authorization.engine.js';
import { PrismaAuthorizationRepository } from './authorization.repository.js';
import { SCOPE_TYPES, type Subject } from './authorization.types.js';
import { MatrixService } from './matrix.service.js';
import { isAuthorizationSchemaReady, SCHEMA_NOT_READY_BODY } from './schema-readiness.js';

/**
 * Authorization API.
 *
 * Path-for-path with the routes the React client already calls, so the
 * Permission Matrix and the Authorization Center work against either backend
 * during the migration:
 *
 *   POST /api/v1/authorization/check | check-batch | simulate
 *   GET  /api/v1/roles                    GET  /api/v1/roles/:id/matrix
 *   PUT  /api/v1/roles/:id/matrix         POST /api/v1/roles/:id/clone
 *   GET  /api/v1/scopes/:type/options
 *   GET  /api/v1/users/:id/effective-permissions
 *
 * Every route is authenticated. Management routes additionally require a
 * permission, evaluated by the same engine they administer — there is no
 * bypass for "the screen that edits permissions".
 */

export interface AuthorizationRouteDeps {
  authService: AuthService;
  audit: AuditLogger;
  engine?: AuthorizationEngine;
  matrix?: MatrixService;
}

const num = (value: bigint | number): number => (typeof value === 'bigint' ? Number(value) : value);

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
  const matrix = deps.matrix ?? new MatrixService();

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

  /**
   * Require a permission before the handler runs.
   *
   * Deliberately built on the same engine.decide() the rest of the app uses,
   * rather than a shortcut that trusts the numeric role — the screens that
   * administer authorization are exactly the ones that must not have a
   * privileged side door.
   */
  const requirePermission = (permissionCode: string) =>
    async function check(request: FastifyRequest, reply: FastifyReply): Promise<void> {
      const decision = await engine.decide(
        { subject: subjectOf(request), action: permissionCode, resource: {} },
        metaOf(request),
      );

      if (!decision.allowed) {
        await reply.status(403).send({
          success: false,
          error: { code: 'PERMISSION_DENIED', message: decision.reason, decisionId: decision.decisionId },
        });
      }
    };

  const guarded = (permissionCode: string) => ({
    preHandler: [schemaGate, authenticated(deps.authService), requirePermission(permissionCode)],
  });

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

  /**
   * What-if. Runs the production engine against another subject, with
   * auditing of the *simulated* decision suppressed — the simulation itself is
   * recorded below, so a what-if cannot be used to manufacture an audit trail
   * suggesting a user was granted something.
   */
  app.post('/api/v1/authorization/simulate', guarded('admin.authorization.simulate'), async (request, reply) =>
    respond(reply, async () => {
      const body = (request.body ?? {}) as {
        subjectId?: number;
        permissionCode?: string;
        resource?: Record<string, unknown>;
        context?: Record<string, unknown>;
      };

      if (!body.subjectId || !body.permissionCode) {
        throw new ResourceError('subjectId and permissionCode are required', 422);
      }

      const [target] = await db.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT id, role, type, company_code, unit, department, status, is_deleted, emp_code
           FROM users WHERE id = $1`,
        body.subjectId,
      );
      if (!target) throw new ResourceError('Subject not found', 404);

      const decision = await engine.decide({
        subject: { ...target, id: num(target['id'] as bigint) } as Subject,
        action: body.permissionCode,
        resource: body.resource ?? {},
        context: { ...body.context, audit: false },
      });

      await deps.audit.log(request, 'SIMULATE', 'Authorization', null, {
        subject_id: body.subjectId,
        permission: body.permissionCode,
        allowed: decision.allowed,
      });

      return { success: true, data: { decision } };
    }),
  );

  /* ---- roles and matrix ------------------------------------------- */

  app.get('/api/v1/roles', guarded('admin.role.read'), async (request, reply) =>
    respond(reply, async () => {
      const rows = await db.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT r.id, r.name, r.code, r.role_type, r.is_system, r.is_active, r.status,
                r.default_scope_type, r.tenant_id, r.version,
                (SELECT count(*)::int FROM role_permissions rp WHERE rp.role_id = r.id) AS permission_count
           FROM roles r
          ORDER BY r.is_system DESC, r.name`,
      );

      return {
        success: true,
        data: rows.map((row) => ({ ...row, id: num(row['id'] as bigint) })),
      };
    }),
  );

  app.get<{ Params: { id: string } }>(
    '/api/v1/roles/:id/matrix',
    guarded('admin.role.read'),
    async (request, reply) =>
      respond(reply, async () => {
        const roleId = Number.parseInt(request.params.id, 10);
        if (Number.isNaN(roleId)) throw new ResourceError('Role not found', 404);

        return { success: true, data: await matrix.build(roleId) };
      }),
  );

  app.put<{ Params: { id: string } }>(
    '/api/v1/roles/:id/matrix',
    guarded('admin.role.update'),
    async (request, reply) =>
      respond(reply, async () => {
        const roleId = Number.parseInt(request.params.id, 10);
        if (Number.isNaN(roleId)) throw new ResourceError('Role not found', 404);

        const body = (request.body ?? {}) as {
          changes?: Array<{ permissionCode: string; action: string; state: string }>;
        };
        const changes = body.changes ?? [];

        const result = await matrix.apply(roleId, changes);

        // The audit row records what changed, not the whole matrix — a diff is
        // reviewable, a 900-cell snapshot is not.
        await deps.audit.log(request, 'UPDATE', 'PermissionMatrix', { role_id: roleId }, {
          role_id: roleId,
          changes: changes.map((change) => `${change.permissionCode}.${change.action}=${change.state}`),
        });

        return { success: true, data: result };
      }),
  );

  app.post<{ Params: { id: string } }>(
    '/api/v1/roles/:id/clone',
    guarded('admin.role.clone'),
    async (request, reply) =>
      respond(reply, async () => {
        const roleId = Number.parseInt(request.params.id, 10);
        const body = (request.body ?? {}) as { name?: string };
        if (!body.name?.trim()) throw new ResourceError('name is required', 422);

        const [source] = await db.$queryRawUnsafe<Array<Record<string, unknown>>>(
          'SELECT * FROM roles WHERE id = $1',
          roleId,
        );
        if (!source) throw new ResourceError('Role not found', 404);

        const name = body.name.trim();
        const code = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

        const created = await db.$transaction(async (tx) => {
          const [row] = await tx.$queryRawUnsafe<Array<{ id: bigint }>>(
            `INSERT INTO roles (name, code, type, description, role_type, tenant_id, is_active,
                                is_system, is_assignable, is_sensitive, requires_approval,
                                default_scope_type, status, version, created_at, updated_at)
             VALUES ($1, $2, 'Custom', $3, $4, $5, TRUE, FALSE, TRUE, $6, FALSE, $7, 'ACTIVE', 1, now(), now())
             RETURNING id`,
            name,
            code,
            `Cloned from ${String(source['name'])}`,
            source['role_type'],
            source['tenant_id'],
            source['is_sensitive'],
            source['default_scope_type'],
          );

          // Permission configuration is copied; user assignments deliberately
          // are not. Cloning a role must never silently grant its holders'
          // access to anyone.
          await tx.$executeRawUnsafe(
            `INSERT INTO role_permissions
               (role_id, permission_id, effect, conditions, obligations, inherit_to_children, valid_from, valid_until)
             SELECT $1, permission_id, effect, conditions, obligations, inherit_to_children, valid_from, valid_until
               FROM role_permissions WHERE role_id = $2`,
            row!.id,
            roleId,
          );

          return num(row!.id);
        });

        await deps.audit.log(request, 'CREATE', 'Role', null, { cloned_from: roleId, id: created, name });

        return { success: true, data: { id: created, name, code } };
      }),
  );

  /* ---- scopes ------------------------------------------------------ */

  /**
   * Values for the scope selector.
   *
   * Sourced from the organization tables the application already has rather
   * than a parallel scope registry — a second copy of "which branches exist"
   * is a second thing to keep in step.
   */
  app.get<{ Params: { type: string } }>(
    '/api/v1/scopes/:type/options',
    guarded('admin.role.read'),
    async (request, reply) =>
      respond(reply, async () => {
        const type = request.params.type.toUpperCase();
        if (!(SCOPE_TYPES as readonly string[]).includes(type)) {
          throw new ResourceError('Unknown scope type', 404);
        }

        const queries: Record<string, string | null> = {
          COMPANY: `SELECT DISTINCT company_code AS id, company_code AS label
                      FROM users WHERE company_code IS NOT NULL AND company_code <> '' ORDER BY 1`,
          TENANT: `SELECT DISTINCT company_code AS id, company_code AS label
                     FROM users WHERE company_code IS NOT NULL AND company_code <> '' ORDER BY 1`,
          BUSINESS_UNIT: `SELECT DISTINCT unit AS id, unit AS label
                            FROM users WHERE unit IS NOT NULL AND unit <> '' ORDER BY 1`,
          BRANCH: 'SELECT id::text AS id, name AS label FROM branches ORDER BY name',
          LOCATION: 'SELECT id::text AS id, name AS label FROM locations ORDER BY name',
          TEAM: 'SELECT id::text AS id, name AS label FROM teams ORDER BY name',
          DEPARTMENT: 'SELECT id::text AS id, name AS label FROM departments ORDER BY name',
          GLOBAL: null,
        };

        const sql = queries[type];
        if (!sql) return { success: true, data: [] };

        try {
          return { success: true, data: await db.$queryRawUnsafe<Array<Record<string, unknown>>>(sql) };
        } catch {
          // A scope table this deployment does not have must not break the
          // selector; the client falls back to a free-text id.
          return { success: true, data: [] };
        }
      }),
  );

  /* ---- effective permissions --------------------------------------- */

  /**
   * Every permission resolved for one user, through the real engine.
   *
   * Not a role-permission read: this includes inheritance, scope, explicit
   * denies, delegations and emergency grants, which is the entire point of
   * showing it before a change is saved.
   */
  app.get<{ Params: { id: string } }>(
    '/api/v1/users/:id/effective-permissions',
    guarded('admin.role.read'),
    async (request, reply) =>
      respond(reply, async () => {
        const userId = Number.parseInt(request.params.id, 10);
        if (Number.isNaN(userId)) throw new ResourceError('User not found', 404);

        const [target] = await db.$queryRawUnsafe<Array<Record<string, unknown>>>(
          `SELECT id, role, type, company_code, unit, department, status, is_deleted, emp_code
             FROM users WHERE id = $1`,
          userId,
        );
        if (!target) throw new ResourceError('User not found', 404);

        const codes = await db.$queryRawUnsafe<Array<{ code: string }>>(
          'SELECT COALESCE(code, name) AS code FROM permissions WHERE is_active = TRUE ORDER BY 1',
        );

        const subject = { ...target, id: num(target['id'] as bigint) } as Subject;
        const permissions: Record<string, { allowed: boolean; state: string; reason: string }> = {};

        for (const { code } of codes) {
          // audit:false — resolving the full catalogue for a preview would
          // otherwise write ~100 decision rows per page view.
          const decision = await engine.decide({
            subject,
            action: code,
            resource: {},
            context: { audit: false },
          });

          permissions[code] = {
            allowed: decision.allowed,
            state: decision.effectiveState,
            reason: decision.reason,
          };
        }

        return { success: true, data: { userId, permissions } };
      }),
  );
}
