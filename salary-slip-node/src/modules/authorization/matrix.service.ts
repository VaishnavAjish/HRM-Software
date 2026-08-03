import { db } from '../../db/client.js';
import { ResourceError } from '../masters/masters.service.js';
import type { EffectiveState } from './authorization.types.js';

/**
 * The Permission Matrix document.
 *
 * Built server-side and returned whole, because the states are not
 * independent: a cell's value depends on the role's own grants, on every role
 * it inherits from, and on whether the grant carries a condition. A client
 * that fetched cells individually would have to reassemble that itself and
 * would get it subtly wrong.
 *
 * Shape mirrors the reference design directly — modules group permissions,
 * permissions become rows, actions become columns.
 */

/**
 * Trailing segments that are genuinely *actions on a resource*, and therefore
 * become matrix columns. Order here is column order.
 *
 * Everything else — `company.legal_entities`, `appointments.view_full_aadhaar`,
 * `groups.lifecycle` — is a distinct permission that merely looks like an
 * action because of the dotted name. Treating those as columns produced a
 * 27-column matrix in which most cells were structurally empty, because
 * `legal_entities` is meaningless applied to `departments`. They get their own
 * row and a single ACCESS column instead.
 */
const STANDARD_ACTIONS = [
  'view', 'read', 'create', 'edit', 'update', 'delete', 'approve', 'reject',
  'import', 'export', 'print', 'download', 'assign', 'manage', 'configure',
];

/** Column used by permissions that are not an action on a resource. */
const ACCESS_ACTION = 'access';

/** Legacy action -> the column it belongs under. */
const ACTION_LABELS: Record<string, string> = {
  view: 'View', read: 'View', create: 'Create', edit: 'Update', update: 'Update',
  delete: 'Delete', approve: 'Approve', import: 'Import', export: 'Export',
  print: 'Print', download: 'Download', assign: 'Assign', manage: 'Manage',
  configure: 'Configure', access: 'Access', admins: 'Admins', calendars: 'Calendars',
  suspend: 'Suspend', publish: 'Publish', reset: 'Reset', revoke: 'Revoke',
  audit: 'Audit', lifecycle: 'Lifecycle', policies: 'Policies',
  analytics: 'Analytics', customize: 'Customize', inspect: 'Inspect',
};

const titleCase = (value: string): string =>
  value
    .split(/[._\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

const slug = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

export interface MatrixPermission {
  code: string;
  label: string;
  resource: string;
  description: string | null;
  isSensitive: boolean;
  actions: string[];
  inheritedFrom: string[];
  conditions: string[];
}

export interface MatrixModule {
  key: string;
  label: string;
  permissions: MatrixPermission[];
}

export interface MatrixDocument {
  role: { id: number; name: string; code: string | null; isSystem: boolean; version: number };
  columns: Array<{ key: string; label: string }>;
  modules: MatrixModule[];
  states: Record<string, EffectiveState>;
  inheritance: Array<{ id: number; name: string; code: string | null }>;
  recentChanges: Array<{ id: string; actor: string; summary: string; at: string }>;
}

interface PermissionRow {
  id: bigint;
  code: string;
  name: string;
  description: string | null;
  resource: string | null;
  action: string | null;
  is_sensitive: boolean;
  group_name: string | null;
}

interface GrantRow {
  permission_id: bigint;
  code: string;
  effect: string;
  conditions: unknown;
  role_id: bigint;
  role_name: string;
}

const num = (value: bigint | number): number => (typeof value === 'bigint' ? Number(value) : value);
const cellKey = (code: string, action: string): string => `${code}::${action}`;

export class MatrixService {
  /** One document per (role, scope). */
  async build(roleId: number): Promise<MatrixDocument> {
    const [role] = await db.$queryRawUnsafe<
      Array<{ id: bigint; name: string; code: string | null; is_system: boolean; version: number }>
    >('SELECT id, name, code, is_system, version FROM roles WHERE id = $1', roleId);

    if (!role) throw new ResourceError('Role not found', 404);

    const permissions = await db.$queryRawUnsafe<PermissionRow[]>(
      `SELECT p.id, COALESCE(p.code, p.name) AS code, p.name, p.description,
              p.resource, p.action, p.is_sensitive, g.name AS group_name
         FROM permissions p
         LEFT JOIN permission_groups g ON g.id = p.group_id
        WHERE p.is_active = TRUE
        ORDER BY g.name NULLS LAST, p.resource, p.action`,
    );

    const inheritance = await this.parents(roleId);
    const inheritedIds = inheritance.map((parent) => parent.id);

    // The role's own grants and everything it inherits, in one pass so a cell
    // can be labelled INHERITED_* without a second query per row.
    const grants = await db.$queryRawUnsafe<GrantRow[]>(
      `SELECT rp.permission_id, COALESCE(p.code, p.name) AS code, rp.effect, rp.conditions,
              rp.role_id, r.name AS role_name
         FROM role_permissions rp
         JOIN permissions p ON p.id = rp.permission_id
         JOIN roles r ON r.id = rp.role_id
        WHERE rp.role_id = ANY($1::bigint[])
          AND (rp.valid_from  IS NULL OR rp.valid_from  <= now())
          AND (rp.valid_until IS NULL OR rp.valid_until  > now())`,
      [roleId, ...inheritedIds],
    );

    return this.assemble(role, permissions, grants, roleId, inheritance);
  }

  private assemble(
    role: { id: bigint; name: string; code: string | null; is_system: boolean; version: number },
    permissions: PermissionRow[],
    grants: GrantRow[],
    roleId: number,
    inheritance: Array<{ id: number; name: string; code: string | null }>,
  ): MatrixDocument {
    const byResource = new Map<string, { module: string; permission: MatrixPermission }>();
    const states: Record<string, EffectiveState> = {};
    const actionsSeen = new Set<string>();

    // Index grants by code so each permission row is a map lookup.
    const grantsByCode = new Map<string, GrantRow[]>();
    for (const grant of grants) {
      const list = grantsByCode.get(grant.code) ?? [];
      list.push(grant);
      grantsByCode.set(grant.code, list);
    }

    for (const row of permissions) {
      const rawResource = row.resource ?? row.code.replace(/\.[^.]+$/, '');
      const rawAction = row.action ?? row.code.replace(/^.*\./, '');

      // An action only becomes a column if it is genuinely an action. Anything
      // else keeps its full code as the row and occupies the ACCESS column, so
      // the grid stays narrow and every cell is meaningful.
      const isStandard = STANDARD_ACTIONS.includes(rawAction);
      const resource = isStandard ? rawResource : row.code;
      const action = isStandard ? rawAction : ACCESS_ACTION;

      const moduleLabel = row.group_name ?? titleCase(rawResource.split('.')[0] ?? 'Other');

      actionsSeen.add(action);

      const key = `${moduleLabel}::${resource}`;
      let entry = byResource.get(key);

      if (!entry) {
        entry = {
          module: moduleLabel,
          permission: {
            code: resource,
            label: titleCase(resource),
            resource,
            description: row.description,
            isSensitive: false,
            actions: [],
            inheritedFrom: [],
            conditions: [],
          },
        };
        byResource.set(key, entry);
      }

      entry.permission.actions.push(action);
      // A resource is sensitive if any of its actions is.
      if (row.is_sensitive) entry.permission.isSensitive = true;

      const applicable = grantsByCode.get(row.code) ?? [];
      states[cellKey(resource, action)] = this.resolveState(applicable, roleId, entry.permission);
    }

    const modules = new Map<string, MatrixModule>();
    for (const { module, permission } of byResource.values()) {
      const key = slug(module);
      const existing = modules.get(key) ?? { key, label: module, permissions: [] };
      existing.permissions.push(permission);
      modules.set(key, existing);
    }

    return {
      role: {
        id: num(role.id),
        name: role.name,
        code: role.code,
        isSystem: role.is_system,
        version: role.version,
      },
      columns: this.columns(actionsSeen),
      modules: [...modules.values()].sort((a, b) => a.label.localeCompare(b.label)),
      states,
      inheritance,
      recentChanges: [],
    };
  }

  /**
   * Collapse the grants touching one cell into a single state.
   *
   * Order matters and mirrors the engine: an explicit deny outranks
   * everything, an own grant outranks an inherited one, and a grant carrying
   * a condition reports CONDITIONAL rather than a flat allow — the matrix must
   * not show a plain tick for access that only applies sometimes.
   */
  private resolveState(grants: GrantRow[], roleId: number, permission: MatrixPermission): EffectiveState {
    if (grants.length === 0) return 'NOT_ASSIGNED';

    const own = grants.filter((grant) => num(grant.role_id) === roleId);
    const inherited = grants.filter((grant) => num(grant.role_id) !== roleId);

    for (const grant of inherited) {
      const name = grant.role_name;
      if (!permission.inheritedFrom.includes(name)) permission.inheritedFrom.push(name);
    }

    const denied = (list: GrantRow[]) => list.some((grant) => String(grant.effect).toUpperCase() === 'DENY');
    const conditional = (list: GrantRow[]) =>
      list.some((grant) => grant.conditions !== null && grant.conditions !== undefined);

    if (own.length > 0) {
      if (denied(own)) return 'DENY';
      if (conditional(own)) {
        for (const grant of own) {
          if (grant.conditions) permission.conditions.push(this.describeCondition(grant.conditions));
        }
        return 'CONDITIONAL';
      }
      return 'ALLOW';
    }

    return denied(inherited) ? 'INHERITED_DENY' : 'INHERITED_ALLOW';
  }

  /** A short human sentence for the details panel. Never raw JSON. */
  private describeCondition(conditions: unknown): string {
    const tree = typeof conditions === 'string' ? this.safeParse(conditions) : conditions;
    if (!tree || typeof tree !== 'object') return 'Conditional access';

    const node = tree as Record<string, unknown>;
    if (Array.isArray(node['all'])) return `All of ${node['all'].length} conditions must hold`;
    if (Array.isArray(node['any'])) return `Any of ${node['any'].length} conditions must hold`;

    const operator = String(node['operator'] ?? 'condition').replaceAll('_', ' ');
    const left = String(node['left'] ?? node['attribute'] ?? '').replace(/^(subject|resource|action|environment)\./, '');
    const right = node['right'] ?? node['value'];

    return left ? `${titleCase(left)} ${operator} ${right ?? ''}`.trim() : `Condition: ${operator}`;
  }

  private safeParse(value: string): unknown {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  /**
   * Columns are derived from the data, not hard-coded.
   *
   * The canonical catalogue uses read/update; this database uses view/edit,
   * plus one-off actions like `admins` and `calendars` from the organization
   * module. Fixing the column list in the client would silently hide those.
   */
  private columns(actions: Set<string>): Array<{ key: string; label: string }> {
    const known = STANDARD_ACTIONS.filter((action) => actions.has(action));
    // ACCESS is last: it applies to the standalone permissions, which read as
    // a tail of one-off rows beneath the real action grid.
    const access = actions.has(ACCESS_ACTION) ? [ACCESS_ACTION] : [];

    return [...known, ...access].map((action) => ({
      key: action,
      label: ACTION_LABELS[action] ?? titleCase(action),
    }));
  }

  /** Parent roles, depth-capped, for the inheritance panel. */
  private async parents(roleId: number): Promise<Array<{ id: number; name: string; code: string | null }>> {
    const out: Array<{ id: number; name: string; code: string | null }> = [];
    const seen = new Set<number>([roleId]);
    let frontier = [roleId];

    for (let depth = 0; depth < 8 && frontier.length > 0; depth += 1) {
      const rows = await db.$queryRawUnsafe<Array<{ id: bigint; name: string; code: string | null }>>(
        `SELECT r.id, r.name, r.code
           FROM authorization_role_inheritances i
           JOIN roles r ON r.id = i.parent_role_id
          WHERE i.child_role_id = ANY($1::bigint[]) AND r.is_active = TRUE`,
        frontier,
      );

      const next: number[] = [];
      for (const row of rows) {
        const id = num(row.id);
        if (seen.has(id)) continue;
        seen.add(id);
        out.push({ id, name: row.name, code: row.code });
        next.push(id);
      }
      frontier = next;
    }

    return out;
  }

  /**
   * Apply matrix edits.
   *
   * Only the cells the client changed are sent, and each is written on its own
   * terms — so two administrators editing different modules of the same role
   * do not overwrite one another the way a whole-matrix PUT would.
   */
  async apply(
    roleId: number,
    changes: Array<{ permissionCode: string; action: string; state: string }>,
  ): Promise<{ applied: number }> {
    if (changes.length === 0) throw new ResourceError('No changes supplied', 400);

    const [role] = await db.$queryRawUnsafe<Array<{ id: bigint; is_system: boolean }>>(
      'SELECT id, is_system FROM roles WHERE id = $1',
      roleId,
    );
    if (!role) throw new ResourceError('Role not found', 404);

    let applied = 0;

    await db.$transaction(async (tx) => {
      for (const change of changes) {
        // A cell addresses resource + action, and the stored permission is the
        // two joined back together — except in the ACCESS column, whose rows
        // already carry the complete code (see STANDARD_ACTIONS).
        const code =
          change.action === ACCESS_ACTION ? change.permissionCode : `${change.permissionCode}.${change.action}`;

        const [permission] = await tx.$queryRawUnsafe<Array<{ id: bigint }>>(
          'SELECT id FROM permissions WHERE code = $1 OR name = $1',
          code,
        );
        if (!permission) continue;

        if (change.state === 'NOT_ASSIGNED') {
          await tx.$executeRawUnsafe(
            'DELETE FROM role_permissions WHERE role_id = $1 AND permission_id = $2',
            roleId,
            permission.id,
          );
        } else {
          const effect = change.state === 'DENY' ? 'DENY' : 'ALLOW';

          await tx.$executeRawUnsafe(
            `INSERT INTO role_permissions (role_id, permission_id, effect, inherit_to_children)
             VALUES ($1, $2, $3, TRUE)
             ON CONFLICT (role_id, permission_id) DO UPDATE SET effect = EXCLUDED.effect`,
            roleId,
            permission.id,
            effect,
          );
        }
        applied += 1;
      }

      // Bumping the version is what lets a concurrent editor's save be
      // detected rather than silently interleaved.
      await tx.$executeRawUnsafe(
        'UPDATE roles SET version = version + 1, updated_at = now() WHERE id = $1',
        roleId,
      );
    });

    return { applied };
  }
}
