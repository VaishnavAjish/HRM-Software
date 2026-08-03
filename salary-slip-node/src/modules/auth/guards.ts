import type { FastifyReply, FastifyRequest } from 'fastify';

import type { AuthService, AuthUserRow } from './auth.service.js';
import { AuthError } from './auth.service.js';

/**
 * Port of App\Http\Middleware\RoleMiddleware.
 *
 * Role normalisation is duplicated in three places in the existing system —
 * this middleware, AuthContext.getUserRole() in React, and various inline
 * checks — and all three must agree. The mapping below is copied from the PHP
 * exactly:
 *
 *   agent     type === 'agent' OR role === 4
 *   admin     role in (0, 1, 2), or the literal string 'admin'
 *   employee  everything else
 *
 * Note role 3 is an employee and role 4 an agent, so "higher number" carries
 * no meaning; this is a lookup, not a comparison.
 */
export type Role = 'admin' | 'agent' | 'employee';

export function resolveRole(user: Record<string, unknown>): Role {
  if (user.type === 'agent' || Number.parseInt(String(user.role), 10) === 4) {
    return 'agent';
  }

  const numeric = Number.parseInt(String(user.role), 10);
  if ([0, 1, 2].includes(numeric) || String(user.role).toLowerCase() === 'admin') {
    return 'admin';
  }

  return 'employee';
}

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: AuthUserRow;
  }
}

/** Bearer token from the Authorization header, if any. */
export function bearerFrom(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1]!.trim() : null;
}

/**
 * Authenticate, then optionally require a role.
 *
 * Returns a preHandler rather than decorating globally so each route opts in,
 * mirroring how the Laravel routes list their middleware individually — and so
 * a route that should be public cannot become authenticated by accident.
 */
export function authenticated(service: AuthService, roles?: Role[]) {
  return async function guard(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const token = bearerFrom(request);

    if (!token) {
      await reply.status(401).send({ status: false, message: 'Unauthenticated' });
      return;
    }

    let user: AuthUserRow;
    try {
      ({ user } = await service.authenticate(token));
    } catch (error) {
      const status = error instanceof AuthError ? error.statusCode : 401;
      const message = error instanceof AuthError ? error.message : 'Unauthenticated';
      await reply.status(status).send({ status: false, message });
      return;
    }

    if (roles && !roles.includes(resolveRole(user))) {
      // Laravel's wording, so the existing toasts read the same.
      await reply
        .status(403)
        .send({ status: false, message: 'Forbidden: insufficient permissions' });
      return;
    }

    request.authUser = user;
  };
}
