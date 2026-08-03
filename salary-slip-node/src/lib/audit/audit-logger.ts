import type { FastifyRequest } from 'fastify';

/**
 * Port of App\Support\AuditLogger.
 *
 * Writes to the same audit_logs table Laravel writes to, so the RBAC audit
 * screen shows one continuous history across the migration rather than a gap
 * where a module moved to Node.
 *
 * old_value and new_value are `json` columns cast to array in Eloquent, so
 * they are stored as JSON objects here too — not as strings.
 */

export interface AuditEntry {
  userId: number | null;
  action: string;
  module: string;
  oldValue: unknown;
  newValue: unknown;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface AuditSink {
  write(entry: AuditEntry): Promise<void>;
}

/**
 * Client address, resolved the way the PHP helper resolves it.
 *
 * X-Forwarded-For first (taking the left-most entry, the original client),
 * then X-Real-IP, then the socket address. Anything else would record the
 * proxy's address for every request once this sits behind nginx.
 */
export function clientIp(request: FastifyRequest): string | null {
  const forwarded = request.headers['x-forwarded-for'];
  if (forwarded) {
    const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
    if (first) return first;
  }

  const real = request.headers['x-real-ip'];
  if (real) return Array.isArray(real) ? (real[0] ?? null) : real;

  return request.ip ?? null;
}

export class AuditLogger {
  constructor(private readonly sink: AuditSink) {}

  /**
   * Record an action.
   *
   * Never throws: an audit write that fails must not turn a successful update
   * into a 500 the user retries, producing the very duplicate the audit trail
   * was meant to explain. Failures are reported through the request logger.
   */
  async log(
    request: FastifyRequest,
    action: string,
    module: string,
    oldValue: unknown = null,
    newValue: unknown = null,
  ): Promise<void> {
    try {
      await this.sink.write({
        userId: request.authUser ? Number(request.authUser.id) : null,
        action,
        module,
        oldValue,
        newValue,
        ipAddress: clientIp(request),
        userAgent: (request.headers['user-agent'] as string | undefined) ?? null,
      });
    } catch (error) {
      request.log.error({ err: error, action, module }, 'audit write failed');
    }
  }
}

/** Collects entries in memory. Used by tests. */
export class InMemoryAuditSink implements AuditSink {
  entries: AuditEntry[] = [];
  async write(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
  }
}
