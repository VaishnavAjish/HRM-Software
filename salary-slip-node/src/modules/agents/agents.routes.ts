import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { AuthService } from '../auth/auth.service.js';
import { authenticated } from '../auth/guards.js';
import { AuditLogger } from '../../lib/audit/audit-logger.js';
import { ResourceError } from '../masters/masters.service.js';
import { AgentService } from './agents.service.js';
import { PrismaAgentRepository } from './agents.repository.js';
import { make as hashPassword } from '../../lib/laravel/hash.js';
import type { Actor } from '../employees/employees.service.js';

/**
 * Agent routes.
 *
 *   GET    /api/agents             admin
 *   PUT    /api/agents/:id         admin
 *   DELETE /api/agents/:id         admin
 *   GET    /api/agent/candidates   agent
 *
 * Note the role split: the first three are admin-only, while /agent/candidates
 * is the agent's own dashboard and is gated to agents.
 */

export interface AgentRouteDeps {
  authService: AuthService;
  audit: AuditLogger;
  agents?: AgentService;
}

async function respond(reply: FastifyReply, run: () => Promise<unknown>): Promise<unknown> {
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
  if (Number.isNaN(id)) throw new ResourceError('Agent not found', 404);
  return id;
}

const actorOf = (request: FastifyRequest): Actor => request.authUser as unknown as Actor;

export async function registerAgentRoutes(
  app: FastifyInstance,
  deps: AgentRouteDeps,
): Promise<void> {
  const agents =
    deps.agents ?? new AgentService(new PrismaAgentRepository(), { make: (p) => hashPassword(p) });

  const adminOnly = { preHandler: authenticated(deps.authService, ['admin']) };
  const agentOnly = { preHandler: authenticated(deps.authService, ['agent']) };

  app.get('/api/agents', adminOnly, async (request, reply) =>
    respond(reply, async () => {
      const q = (request.query ?? {}) as { company_code?: string };

      return { status: true, data: await agents.list(actorOf(request), q.company_code ?? null) };
    }),
  );

  app.post('/api/appointment/create-account', adminOnly, async (request, reply) =>
    respond(reply, async () => {
      const agent = await agents.create(actorOf(request), request.body);
      await deps.audit.log(request, 'CREATE', 'Agent', null, { id: agent.id });

      return { status: true, message: 'Agent account created successfully.', data: agent };
    }),
  );

  app.put<{ Params: { id: string } }>('/api/agents/:id', adminOnly, async (request, reply) =>
    respond(reply, async () => {
      const id = idOf(request);
      const agent = await agents.update(actorOf(request), id, request.body);
      await deps.audit.log(request, 'UPDATE', 'Agent', { id }, { id });

      return { status: true, message: 'Agent updated successfully.', data: agent };
    }),
  );

  app.delete<{ Params: { id: string } }>('/api/agents/:id', adminOnly, async (request, reply) =>
    respond(reply, async () => {
      const id = idOf(request);
      await agents.remove(actorOf(request), id);
      await deps.audit.log(request, 'DELETE', 'Agent', { id }, null);

      return { status: true, message: 'Agent deleted successfully.' };
    }),
  );

  app.get('/api/agent/candidates', agentOnly, async (request, reply) =>
    respond(reply, async () => {
      const { rows, disclosed } = await agents.candidates(actorOf(request));

      // One counted entry per request; auditing per row would turn a page view
      // into hundreds of inserts and bury the trail.
      if (disclosed > 0) {
        await deps.audit.log(
          request,
          'READ',
          'AGENT_CANDIDATE_LIST_FULL_AADHAAR_DISCLOSED',
          null,
          { disclosed_count: disclosed },
        );
      }

      return { status: true, data: rows };
    }),
  );
}
