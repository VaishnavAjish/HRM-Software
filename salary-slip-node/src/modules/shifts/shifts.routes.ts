import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { AuthService } from '../auth/auth.service.js';
import { authenticated } from '../auth/guards.js';
import { AuthorizationEngine } from '../authorization/authorization.engine.js';
import { PrismaAuthorizationRepository } from '../authorization/authorization.repository.js';
import { requireAnyPermission } from '../authorization/enforcement.js';
import { AuditLogger } from '../../lib/audit/audit-logger.js';
import { ResourceError } from '../masters/masters.service.js';
import { ShiftService, type ShiftScope } from './shifts.service.js';
import { SettingsService, DEFAULT_GROUP } from '../settings/settings.service.js';
import { PrismaShiftRepository, PrismaSettingsRepository } from './shifts.repository.js';

/**
 * Shifts and RBAC settings.
 *
 *   GET    /api/shifts/get            POST   /api/shifts/store
 *   PUT    /api/shifts/update/:id     DELETE /api/shifts/delete/:id
 *   POST   /api/shifts/assign
 *   GET    /api/rbac/settings         PUT    /api/rbac/settings
 */

export interface ShiftRouteDeps {
  authService: AuthService;
  audit: AuditLogger;
  shifts?: ShiftService;
  settings?: SettingsService;
  engine?: AuthorizationEngine;
}

async function respond(
  reply: FastifyReply,
  run: () => Promise<unknown>,
): Promise<unknown> {
  try {
    return reply.send(await run());
  } catch (error) {
    if (error instanceof ResourceError) {
      return reply.status(error.statusCode).send({ status: false, message: error.message });
    }
    throw error;
  }
}

function idOf(request: FastifyRequest<{ Params: { id: string } }>): number {
  const id = Number.parseInt(request.params.id, 10);
  if (Number.isNaN(id)) throw new ResourceError('Shift not found', 404);
  return id;
}

/** company_code / unit as the client sends them on the query string. */
function requestedScope(request: FastifyRequest): ShiftScope {
  const query = (request.query ?? {}) as Record<string, string | undefined>;
  const body = (request.body ?? {}) as Record<string, unknown>;

  return {
    companyCode: (query.company_code ?? (body.company_code as string | undefined)) || null,
    unit: (query.unit ?? (body.unit as string | undefined)) || null,
  };
}

export async function registerShiftRoutes(
  app: FastifyInstance,
  deps: ShiftRouteDeps,
): Promise<void> {
  const shifts = deps.shifts ?? new ShiftService(new PrismaShiftRepository());
  const settings = deps.settings ?? new SettingsService(new PrismaSettingsRepository());

  const engine = deps.engine ?? new AuthorizationEngine(new PrismaAuthorizationRepository());

  /*
   * Shifts, attendance and RBAC settings.
   *
   * Every code here is `defer`: this catalogue contains no shift permission
   * of any spelling, so the gate currently records the question and falls
   * through to the role guard. Once `hr.shift.*` is seeded the same call
   * sites start enforcing, with no change here — which is the point of
   * naming the canonical code now rather than after the migration.
   */
  const PERMS = {
    shiftRead: ['hr.shift.read', 'shifts.view'],
    shiftWrite: ['hr.shift.update', 'shifts.manage'],
    shiftCreate: ['hr.shift.create', 'shifts.create'],
    shiftDelete: ['hr.shift.delete', 'shifts.delete'],
    shiftAssign: ['hr.shift.assign', 'shifts.assign'],
    settingsRead: ['admin.configuration.read', 'security.view'],
    settingsWrite: ['admin.configuration.update', 'security.users.manage'],
  } as const;

  const gate = (codes: readonly string[]) => ({
    preHandler: [
      authenticated(deps.authService, ['admin']),
      requireAnyPermission(engine, [...codes], { whenUnknown: 'defer' }),
    ],
  });

  const guard = gate(PERMS.shiftRead);

  // ---- shifts ------------------------------------------------------------

  app.get('/api/shifts/get', guard, async (request, reply) =>
    respond(reply, async () => {
      // Role 1 is pinned to their own company, role 2 to company and unit;
      // anyone else uses what the request asked for.
      const { scopeFor } = await import('./shifts.service.js');
      const scope = scopeFor(request.authUser ?? null, requestedScope(request));

      return { status: true, data: await shifts.list(scope) };
    }),
  );

  app.post('/api/shifts/store', gate(PERMS.shiftCreate), async (request, reply) =>
    respond(reply, async () => {
      const shift = await shifts.create(request.body);
      await deps.audit.log(request, 'CREATE', 'Shift', null, shift);

      return { status: true, message: 'Shift created', data: shift };
    }),
  );

  app.put<{ Params: { id: string } }>('/api/shifts/update/:id', gate(PERMS.shiftWrite), async (request, reply) =>
    respond(reply, async () => {
      const shift = await shifts.update(idOf(request), request.body);
      await deps.audit.log(request, 'UPDATE', 'Shift', null, shift);

      return { status: true, message: 'Shift updated', data: shift };
    }),
  );

  app.delete<{ Params: { id: string } }>(
    '/api/shifts/delete/:id',
    gate(PERMS.shiftDelete),
    async (request, reply) =>
      respond(reply, async () => {
        const id = idOf(request);
        await shifts.remove(id);
        await deps.audit.log(request, 'DELETE', 'Shift', { id }, null);

        return { status: true, message: 'Shift deleted' };
      }),
  );

  app.post('/api/shifts/assign', gate(PERMS.shiftAssign), async (request, reply) =>
    respond(reply, async () => {
      const message = await shifts.assign(
        request.body,
        request.authUser ?? null,
        requestedScope(request),
      );

      return { status: true, message };
    }),
  );

  // ---- settings ----------------------------------------------------------

  const groupOf = (request: FastifyRequest): string =>
    ((request.query ?? {}) as { group?: string }).group || DEFAULT_GROUP;

  app.get('/api/rbac/settings', gate(PERMS.settingsRead), async (request, reply) =>
    respond(reply, async () => ({
      status: true,
      data: await settings.list(groupOf(request)),
    })),
  );

  app.put('/api/rbac/settings', gate(PERMS.settingsWrite), async (request, reply) =>
    respond(reply, async () => {
      const group = groupOf(request);
      const { before, after } = await settings.update(group, request.body);

      await deps.audit.log(
        request,
        'UPDATE',
        'Settings',
        { group, values: before },
        { group, values: after },
      );

      return { status: true, message: 'Settings updated' };
    }),
  );
}
