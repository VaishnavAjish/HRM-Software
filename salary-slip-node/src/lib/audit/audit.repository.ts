import { db } from '../../db/client.js';
import type { AuditEntry, AuditSink } from './audit-logger.js';

/**
 * Writes to the same audit_logs table Laravel writes to, so the RBAC audit
 * screen shows one history across the migration instead of a gap where a
 * module moved to Node.
 */
export class PrismaAuditSink implements AuditSink {
  async write(entry: AuditEntry): Promise<void> {
    await db.audit_logs.create({
      data: {
        user_id: entry.userId === null ? null : BigInt(entry.userId),
        action: entry.action,
        module: entry.module,
        // json columns, cast to array in Eloquent — stored as JSON, not text.
        old_value: (entry.oldValue ?? null) as never,
        new_value: (entry.newValue ?? null) as never,
        ip_address: entry.ipAddress,
        user_agent: entry.userAgent,
        created_at: new Date(),
        updated_at: new Date(),
      },
    });
  }
}
