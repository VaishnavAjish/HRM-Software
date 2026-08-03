import type { FastifyReply, FastifyRequest } from 'fastify';

import { clientIp } from '../../lib/audit/audit-logger.js';
import type { AuthorizationEngine, EngineRequestMeta } from './authorization.engine.js';
import type { AuthorizationDecision, Subject } from './authorization.types.js';
import { applyFieldSecurity, assertWritable, changedFields } from './field-security.js';
import { buildAuthorizedWhere, withAuthorization, type ScopeColumns, type WhereClause } from './row-security.js';

/**
 * The enforcement surface every other module uses.
 *
 * One import, so a route author never has to remember the order of
 * operations. Getting that order wrong is the whole risk: check permission,
 * *then* narrow the query, *then* filter the response, and validate changed
 * fields before the write rather than after. Any route that reimplements this
 * inline is a route that will eventually skip a step.
 */

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by `requirePermission`, so handlers can read obligations. */
    authDecision?: AuthorizationDecision;
  }
}

export function requestMeta(request: FastifyRequest): EngineRequestMeta {
  return {
    sessionId: (request.headers['x-session-id'] as string | undefined) ?? null,
    ipAddress: clientIp(request),
    device: (request.headers['user-agent'] as string | undefined)?.slice(0, 255) ?? null,
    requestId: (request.headers['x-request-id'] as string | undefined) ?? null,
  };
}

const subjectOf = (request: FastifyRequest): Subject => request.authUser as unknown as Subject;

/**
 * Gate a route on a permission.
 *
 * Runs after the authentication guard, never instead of it: this resolves
 * what the caller may do, not who they are. The decision is stashed on the
 * request so the handler can apply the obligations that came with it — an
 * ALLOW carrying `maskedFields` is still an allow, and dropping the
 * obligations silently un-masks the data.
 */
export function requirePermission(
  engine: AuthorizationEngine,
  permissionCode: string,
  resourceOf?: (request: FastifyRequest) => Record<string, unknown>,
) {
  return async function enforce(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const subject = request.authUser;
    if (!subject) {
      await reply.status(401).send({ success: false, error: { code: 'AUTHENTICATION_REQUIRED' } });
      return;
    }

    const decision = await engine.decide(
      {
        subject: subjectOf(request),
        action: permissionCode,
        resource: resourceOf?.(request) ?? {},
        context: {
          action: { changed_fields: Object.keys((request.body as Record<string, unknown>) ?? {}) },
          ...(typeof (request.body as Record<string, unknown>)?.['businessReason'] === 'string'
            ? { businessReason: String((request.body as Record<string, unknown>)['businessReason']) }
            : {}),
        },
      },
      requestMeta(request),
    );

    if (!decision.allowed) {
      await reply.status(403).send({
        success: false,
        error: {
          code: 'PERMISSION_DENIED',
          message: decision.reason,
          decisionId: decision.decisionId,
        },
      });
      return;
    }

    // An obligation the caller cannot satisfy is a refusal, not a warning.
    if (decision.obligations.requireMfa && request.headers['x-mfa-verified'] !== 'true') {
      await reply.status(403).send({
        success: false,
        error: { code: 'MFA_REQUIRED', message: 'This action requires multi-factor verification.' },
      });
      return;
    }

    if (decision.obligations.requireReason && !(request.body as Record<string, unknown>)?.['businessReason']) {
      await reply.status(422).send({
        success: false,
        error: { code: 'BUSINESS_REASON_REQUIRED', message: 'A business reason is required for this action.' },
      });
      return;
    }

    request.authDecision = decision;
  };
}

/**
 * Gate a route on any one of several permission codes.
 *
 * This exists because two vocabularies are live at once: the canonical
 * `domain.resource.action` catalogue and the `resource.action` codes
 * production actually holds (`employees.view`, `salary slips.view`).
 * Hard-coding either alone denies every caller on the other — so a route
 * names both and passes if it holds either.
 *
 * The first code that allows wins, and its obligations are the ones applied.
 * Codes are tried in order, so the canonical one should be listed first: once
 * the migration lands, that is the one whose conditions and field masks take
 * effect, without touching this call site again.
 */
export interface PermissionGateOptions {
  resourceOf?: (request: FastifyRequest) => Record<string, unknown>;
  /**
   * What to do when *none* of the named codes exists in the catalogue.
   *
   * `deny` (default) is correct once the catalogue is complete. `defer` is for
   * the migration window: this database has no `hr.shift.*` or `shifts.*`
   * permission rows at all, so gating the shift routes on them would deny
   * every caller — not because anyone lacks access, but because the question
   * has never been asked. Deferring falls back to the role guard that already
   * ran, and logs, so the gap is visible rather than silent.
   *
   * This is narrower than it looks: it only applies when the permission is
   * absent from the catalogue entirely. A permission that exists and is not
   * granted always denies.
   */
  whenUnknown?: 'deny' | 'defer';
  /** Overridable for tests; defaults to a cached catalogue lookup. */
  catalogueHas?: (codes: string[]) => Promise<boolean>;
}

/** Cached "does any of these codes exist" lookup against `permissions`. */
const cataloguePresence = new Map<string, boolean>();

async function defaultCatalogueHas(codes: string[]): Promise<boolean> {
  const key = codes.join('|');
  const cached = cataloguePresence.get(key);
  if (cached !== undefined) return cached;

  try {
    const { db } = await import('../../db/client.js');
    const rows = await db.$queryRawUnsafe<Array<{ n: number }>>(
      `SELECT count(*)::int AS n FROM permissions WHERE name = ANY($1::text[])`,
      codes,
    );
    const present = (rows[0]?.n ?? 0) > 0;
    cataloguePresence.set(key, present);
    return present;
  } catch {
    // If the catalogue cannot be read, assume the permission exists so the
    // gate stays closed. Failing open here would be the worst option.
    return true;
  }
}

export function requireAnyPermission(
  engine: AuthorizationEngine,
  permissionCodes: string[],
  options: PermissionGateOptions = {},
) {
  const { resourceOf, whenUnknown = 'deny', catalogueHas = defaultCatalogueHas } = options;

  return async function enforce(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!request.authUser) {
      await reply.status(401).send({ success: false, error: { code: 'AUTHENTICATION_REQUIRED' } });
      return;
    }

    const subject = subjectOf(request);
    const resource = resourceOf?.(request) ?? {};
    let last: AuthorizationDecision | null = null;

    for (const code of permissionCodes) {
      const decision = await engine.decide(
        { subject, action: code, resource, context: { audit: false } },
        requestMeta(request),
      );
      last = decision;

      if (decision.allowed) {
        // Re-run the winning code with auditing on, so the trail records the
        // decision that was acted upon and not the ones merely considered.
        request.authDecision = await engine.decide(
          { subject, action: code, resource },
          requestMeta(request),
        );
        return;
      }
    }

    if (whenUnknown === 'defer' && !(await catalogueHas(permissionCodes))) {
      request.log.warn(
        { permissionCodes, userId: subject.id },
        'permission not present in catalogue — deferring to role guard',
      );
      return;
    }

    await reply.status(403).send({
      success: false,
      error: {
        code: 'PERMISSION_DENIED',
        message: last?.reason ?? 'You are not permitted to perform this action.',
        decisionId: last?.decisionId,
      },
    });
  };
}

/** Test seam: forget which codes are known to the catalogue. */
export function resetCatalogueCache(): void {
  cataloguePresence.clear();
}

/**
 * The `where` a list query must run with.
 *
 * Returns `null` when the caller may see nothing — callers must treat that as
 * an empty result rather than as "no filter". The distinction is the entire
 * point, and conflating them returns every row.
 */
export function authorizedWhere(
  request: FastifyRequest,
  callerFilter: WhereClause = {},
  columns: ScopeColumns = {},
): WhereClause | null {
  const decision = request.authDecision;
  if (!decision) return null;

  return withAuthorization(buildAuthorizedWhere(decision, subjectOf(request), columns), callerFilter);
}

/** Apply the decision's read obligations to a response payload. */
export function authorizedResponse<T>(request: FastifyRequest, payload: T): T {
  return applyFieldSecurity(payload, request.authDecision?.obligations);
}

/**
 * Validate a write against the decision's field obligations.
 *
 * `current` is the record as stored. Passing it lets a client echo back
 * fields it was given without being rejected for "changing" them; omit it
 * only when creating.
 */
export function authorizeFields(
  request: FastifyRequest,
  body: Record<string, unknown>,
  current?: Record<string, unknown> | null,
): void {
  assertWritable(changedFields(body, current ?? null), request.authDecision?.obligations);
}

/**
 * Rows a query cannot filter — INDIRECT_REPORTS and friends — checked one at
 * a time. Kept separate from the query path so it is obvious at the call site
 * that this is the slow branch, not the default one.
 */
export async function filterAuthorized<T extends Record<string, unknown>>(
  engine: AuthorizationEngine,
  request: FastifyRequest,
  permissionCode: string,
  rows: T[],
): Promise<T[]> {
  const subject = subjectOf(request);

  // A boolean per row rather than `row | null`: Promise.all unwraps a generic
  // T to Awaited<T>, which loses the relationship the caller's type depends
  // on. Deciding separately and indexing back keeps T intact.
  const verdicts = await Promise.all(
    rows.map(async (row): Promise<boolean> => {
      const decision = await engine.decide({
        subject,
        action: permissionCode,
        resource: row,
        // Per-row decisions would otherwise write one audit entry per row.
        context: { audit: false },
      });
      return decision.allowed;
    }),
  );

  return rows.filter((_row, index) => verdicts[index] === true);
}
