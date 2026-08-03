import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { AuthService } from '../auth/auth.service.js';
import { authenticated } from '../auth/guards.js';
import { AuthorizationEngine } from '../authorization/authorization.engine.js';
import { PrismaAuthorizationRepository } from '../authorization/authorization.repository.js';
import { requireAnyPermission } from '../authorization/enforcement.js';
import { AuditLogger } from '../../lib/audit/audit-logger.js';
import {
  ResourceService,
  ResourceError,
  approvalLevelDefinition,
  branchDefinition,
  locationDefinition,
  teamDefinition,
} from './masters.service.js';
import {
  approvalLevelRepository,
  branchRepository,
  locationRepository,
  teamRepository,
} from './masters.repository.js';

/**
 * The RBAC lookup resources, path-for-path with Laravel.
 *
 *   GET    /api/rbac/{resource}/get
 *   POST   /api/rbac/{resource}/store
 *   PUT    /api/rbac/{resource}/update/:id
 *   DELETE /api/rbac/{resource}/delete/:id
 *
 * The URL shape is verb-in-path rather than REST, which is what the existing
 * client calls; it is preserved exactly so no frontend change is needed.
 */

export interface MastersRouteDeps {
  authService: AuthService;
  audit: AuditLogger;
  /** Overridable so tests never touch the production database. */
  services?: Partial<Record<MasterKey, ResourceService>>;
  engine?: AuthorizationEngine;
}

export type MasterKey = 'locations' | 'branches' | 'teams' | 'approval-levels';

function defaultServices(): Record<MasterKey, ResourceService> {
  return {
    locations: new ResourceService(locationRepository(), locationDefinition),
    branches: new ResourceService(branchRepository(), branchDefinition),
    teams: new ResourceService(teamRepository(), teamDefinition),
    'approval-levels': new ResourceService(approvalLevelRepository(), approvalLevelDefinition),
  };
}

async function respond(
  reply: FastifyReply,
  run: () => Promise<{ status: number; body: unknown }>,
): Promise<unknown> {
  try {
    const { status, body } = await run();
    return reply.status(status).send(body);
  } catch (error) {
    if (error instanceof ResourceError) {
      return reply.status(error.statusCode).send({ status: false, message: error.message });
    }
    throw error;
  }
}

export async function registerMastersRoutes(
  app: FastifyInstance,
  deps: MastersRouteDeps,
): Promise<void> {
  const services = { ...defaultServices(), ...(deps.services ?? {}) };

  // Every one of these is admin-only in routes/api.php.
  const engine = deps.engine ?? new AuthorizationEngine(new PrismaAuthorizationRepository());

  /*
   * Organization masters — locations, branches, teams, approval levels.
   *
   * Canonical code first, then the `resource.action` code production holds.
   * `defer` because only `branches.*` exists in this catalogue: locations,
   * teams and approval levels have no permission rows, and denying on a
   * question that was never asked would lock admins out of screens they have
   * always been able to use.
   */
  const PERMS = {
    read: ['admin.organization.read', 'branches.manage', 'org.view'],
    write: ['admin.organization.update', 'branches.manage', 'org.units.manage'],
    remove: ['admin.organization.delete', 'branches.manage', 'org.units.manage'],
  } as const;

  const gate = (codes: readonly string[]) => ({
    preHandler: [
      authenticated(deps.authService, ['admin']),
      requireAnyPermission(engine, [...codes], { whenUnknown: 'defer' }),
    ],
  });

  const guard = gate(PERMS.read);

  for (const key of Object.keys(services) as MasterKey[]) {
    const service = services[key];

    app.get(`/api/rbac/${key}/get`, guard, async (_request, reply) =>
      respond(reply, async () => ({
        status: 200,
        body: { status: true, data: await service.list() },
      })),
    );

    app.post(`/api/rbac/${key}/store`, gate(PERMS.write), async (request, reply) =>
      respond(reply, async () => {
        const item = await service.create(request.body);
        await deps.audit.log(request, 'CREATE', service.name, null, item);

        return {
          status: 200,
          body: { status: true, message: `${service.name} created`, data: item },
        };
      }),
    );

    app.put<{ Params: { id: string } }>(
      `/api/rbac/${key}/update/:id`,
      gate(PERMS.write),
      async (request, reply) =>
        respond(reply, async () => {
          const { before, after } = await service.update(idOf(request), request.body);
          await deps.audit.log(request, 'UPDATE', service.name, before, after);

          return {
            status: 200,
            body: { status: true, message: `${service.name} updated`, data: after },
          };
        }),
    );

    app.delete<{ Params: { id: string } }>(
      `/api/rbac/${key}/delete/:id`,
      gate(PERMS.remove),
      async (request, reply) =>
        respond(reply, async () => {
          const before = await service.remove(idOf(request));
          await deps.audit.log(request, 'DELETE', service.name, before, null);

          return { status: 200, body: { status: true, message: `${service.name} deleted` } };
        }),
    );
  }
}

/**
 * A non-numeric id is a 404 rather than a crash: Number('abc') is NaN, and
 * BigInt(NaN) throws deep inside the repository.
 */
function idOf(request: FastifyRequest<{ Params: { id: string } }>): number {
  const id = Number.parseInt(request.params.id, 10);
  if (Number.isNaN(id)) {
    throw new ResourceError('Not found', 404);
  }
  return id;
}
