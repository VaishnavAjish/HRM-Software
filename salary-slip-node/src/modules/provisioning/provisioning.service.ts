import { db } from '../../db/client.js';

/**
 * Canonical role and company membership for accounts created by this service.
 *
 * The Laravel side owns the same rule (App\Services\Provisioning) and this is
 * the mirror for the endpoints that have been migrated. Both have to exist,
 * because both can create a user: a trial form submitted while the reverse proxy
 * points at Node must produce the same rows as one submitted against Laravel, or
 * an account's authorization would depend on which process answered.
 *
 * The role is resolved here from the canonical code. It is never read from the
 * request — a trial form is a submission about a person, and a body field naming
 * a role id would let the browser decide who is an administrator.
 */

/** Role codes per tier, most preferred first. Mirrors UserTypeRoles::CODES. */
const TIER_CODES: Record<number, string[]> = {
  0: ['super_administrator', 'super_admin'],
  1: ['tenant_administrator', 'admin'],
  2: ['unit_administrator', 'unit_admin'],
  3: ['employee', 'emp'],
  4: ['agent'],
};

export const PROVISIONING_SOURCE = {
  TRIAL: 'trial',
  APPOINTMENT: 'appointment',
  EMPLOYEE_FORM: 'employee_form',
  AGENT: 'agent',
} as const;

export type ProvisioningSource = (typeof PROVISIONING_SOURCE)[keyof typeof PROVISIONING_SOURCE];

/** Sentinels that mean "no company scope" rather than naming a company. */
const SENTINELS = new Set(['all', 'all-companies']);

async function roleIdForTier(tier: number): Promise<bigint | null> {
  for (const code of TIER_CODES[tier] ?? []) {
    const role = await db.roles.findFirst({ where: { code }, select: { id: true } });
    if (role) return role.id;
  }
  return null;
}

/** Every canonical identity role, so a change replaces rather than accumulates. */
async function identityRoleIds(): Promise<bigint[]> {
  const codes = Object.values(TIER_CODES).flat();
  const roles = await db.roles.findMany({ where: { code: { in: codes } }, select: { id: true } });
  return roles.map((role) => role.id);
}

/**
 * Give a freshly created account its canonical role and company membership.
 *
 * Extra grants are left alone: only the identity roles are replaced, because a
 * user who was separately given HR Manager did not ask to lose it because their
 * type was written.
 */
export async function provision(
  userId: number,
  tier: number,
  companyCode: string | null,
  source: ProvisioningSource,
): Promise<void> {
  const id = BigInt(userId);
  const target = await roleIdForTier(tier);
  const identities = await identityRoleIds();

  await db.$transaction(async (tx) => {
    if (identities.length > 0) {
      await tx.user_roles.deleteMany({
        where: { user_id: id, role_id: { in: identities } },
      });
    }

    if (target !== null) {
      await tx.user_roles.create({ data: { user_id: id, role_id: target } });
    }

    const codes = String(companyCode ?? '')
      .split(',')
      .map((code) => code.trim())
      .filter((code) => code !== '' && !SENTINELS.has(code));

    if (codes.length > 0) {
      /*
       * Raw, deliberately. The generated Prisma client is built from a schema
       * that describes a richer companies table than this database actually
       * has, so going through the model risks writing columns that do not
       * exist. The pivot itself is two integers and a uniqueness constraint;
       * naming them directly is both safe and honest about the drift.
       */
      await tx.$executeRawUnsafe(
        `INSERT INTO user_companies (user_id, company_id, created_at, updated_at)
         SELECT $1, c.id, NOW(), NOW() FROM companies c WHERE c.code = ANY($2::text[])
         ON CONFLICT (user_id, company_id) DO NOTHING`,
        userId,
        codes,
      );
    }

    await tx.$executeRawUnsafe(
      `UPDATE users SET provisioning_source = $2 WHERE id = $1 AND provisioning_source IS NULL`,
      userId,
      source,
    );
  });
}

/** Trial and appointment records are employees; the tier is not negotiable. */
export function provisionEmployee(
  userId: number,
  companyCode: string | null,
  source: ProvisioningSource,
): Promise<void> {
  return provision(userId, 3, companyCode, source);
}

/**
 * The seam the services depend on.
 *
 * Injected rather than imported directly, because the service tests run against
 * fake repositories with no database behind them: a service that reaches for
 * Prisma itself turns every one of those into an integration test, and they fail
 * on a foreign key for a user that was never inserted.
 */
export interface Provisioner {
  provision(
    userId: number,
    tier: number,
    companyCode: string | null,
    source: ProvisioningSource,
  ): Promise<void>;
}

export const prismaProvisioner: Provisioner = { provision };

