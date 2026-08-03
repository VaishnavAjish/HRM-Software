import type { FastifyInstance, FastifyRequest } from 'fastify';

import { AuthService } from '../auth/auth.service.js';
import { authenticated } from '../auth/guards.js';
import { DashboardService } from './dashboard.service.js';
import { PrismaDashboardRepository } from './dashboard.repository.js';
import type { Actor } from '../employees/employees.service.js';

/**
 * Self-service routes.
 *
 *   GET /api/dashboard   employee
 *
 * profile-update is not here yet: its photo upload goes through
 * DocumentService, so it lands with the Documents module.
 */

export interface ProfileRouteDeps {
  authService: AuthService;
  dashboard?: DashboardService;
}

export async function registerProfileRoutes(
  app: FastifyInstance,
  deps: ProfileRouteDeps,
): Promise<void> {
  const dashboard = deps.dashboard ?? new DashboardService(new PrismaDashboardRepository());

  app.get(
    '/api/dashboard',
    { preHandler: authenticated(deps.authService, ['employee']) },
    async (request: FastifyRequest, reply) => {
      const q = (request.query ?? {}) as { company_code?: string };
      const actor = request.authUser as unknown as Actor;

      return reply.send({
        status: true,
        data: await dashboard.forActor(actor, q.company_code ?? null),
      });
    },
  );
}
