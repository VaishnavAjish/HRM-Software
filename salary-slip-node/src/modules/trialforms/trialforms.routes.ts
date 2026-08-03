import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { AuthService } from '../auth/auth.service.js';
import { authenticated } from '../auth/guards.js';
import { AuditLogger } from '../../lib/audit/audit-logger.js';
import { ResourceError } from '../../lib/errors.js';
import { TrialFormService } from './trialforms.service.js';
import { PrismaTrialFormRepository } from './trialforms.repository.js';
import type { Actor } from '../employees/employees.service.js';

/**
 * Trial-form routes.
 *
 *   GET    /api/trial-form/list         admin, agent
 *   POST   /api/trial-form/store        admin, agent
 *   POST   /api/trial-form/update/:id   admin, agent
 *   DELETE /api/trial-form/delete/:id   admin
 *
 * Note update is a POST, not a PUT — the client sends multipart for the form
 * body, and the path is preserved as-is.
 */

export interface TrialFormRouteDeps {
  authService: AuthService;
  audit: AuditLogger;
  trialForms?: TrialFormService;
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
  if (Number.isNaN(id)) throw new ResourceError('Not found', 404);
  return id;
}

const actorOf = (request: FastifyRequest): Actor => request.authUser as unknown as Actor;

/** Multipart or JSON — the trial form UI posts both shapes. */
async function bodyOf(request: FastifyRequest): Promise<Record<string, unknown>> {
  if (typeof request.isMultipart === 'function' && request.isMultipart()) {
    const fields: Record<string, unknown> = {};

    for await (const part of request.parts()) {
      if (part.type === 'file') {
        // File handling for trial forms lands with the shared upload helper;
        // draining here keeps the request from stalling in the meantime.
        await part.toBuffer();
      } else {
        fields[part.fieldname] = part.value;
      }
    }
    return fields;
  }

  return (request.body ?? {}) as Record<string, unknown>;
}

export async function registerTrialFormRoutes(
  app: FastifyInstance,
  deps: TrialFormRouteDeps,
): Promise<void> {
  const forms = deps.trialForms ?? new TrialFormService(new PrismaTrialFormRepository());

  const staff = { preHandler: authenticated(deps.authService, ['admin', 'agent']) };
  const adminOnly = { preHandler: authenticated(deps.authService, ['admin']) };

  app.get('/api/trial-form/list', staff, async (request, reply) =>
    respond(reply, async () => {
      const q = (request.query ?? {}) as { company_code?: string; unit?: string };

      const { rows, disclosed } = await forms.list(
        actorOf(request),
        q.company_code ?? null,
        q.unit ?? null,
      );

      if (disclosed > 0) {
        await deps.audit.log(request, 'READ', 'TRIAL_FORM_LIST_FULL_AADHAAR_DISCLOSED', null, {
          disclosed_count: disclosed,
        });
      }

      return { status: true, data: rows };
    }),
  );

  app.post('/api/trial-form/store', staff, async (request, reply) =>
    respond(reply, async () => {
      const created = await forms.create(actorOf(request), await bodyOf(request));
      await deps.audit.log(request, 'CREATE', 'TrialForm', null, { id: created.id });

      return { status: true, message: 'Trial form submitted' };
    }),
  );

  app.post<{ Params: { id: string } }>(
    '/api/trial-form/update/:id',
    staff,
    async (request, reply) =>
      respond(reply, async () => {
        const id = idOf(request);
        await forms.update(actorOf(request), id, await bodyOf(request));
        await deps.audit.log(request, 'UPDATE', 'TrialForm', { id }, { id });

        return { status: true, message: 'Trial form updated' };
      }),
  );

  app.delete<{ Params: { id: string } }>(
    '/api/trial-form/delete/:id',
    adminOnly,
    async (request, reply) =>
      respond(reply, async () => {
        const id = idOf(request);
        await forms.remove(actorOf(request), id);
        await deps.audit.log(request, 'DELETE', 'TrialForm', { id }, null);

        return { status: true, message: 'Trial form deleted' };
      }),
  );
}
