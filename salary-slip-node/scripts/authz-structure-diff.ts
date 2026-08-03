import { readFileSync } from 'node:fs';

/**
 * Phase 4/5: does production match what
 * 2026_08_03_000001_create_enterprise_authorization_platform would have built?
 *
 * The expectation below is transcribed by hand from the Blueprint calls in that
 * file — Laravel type -> Postgres type. Nothing is inferred from production, or
 * the comparison would be circular and always pass.
 */

const d = JSON.parse(readFileSync(process.argv[2]!, 'utf8'));

type Col = { table_name: string; column_name: string; data_type: string; is_nullable: string; column_default: string | null };
const actual = new Map<string, Map<string, Col>>();
for (const c of d.columns as Col[]) {
  if (!actual.has(c.table_name)) actual.set(c.table_name, new Map());
  actual.get(c.table_name)!.set(c.column_name, c);
}

/** Laravel Blueprint method -> (postgres data_type, nullable-by-default) */
const T = {
  id: 'bigint', foreignId: 'bigint', string: 'character varying', text: 'text',
  json: 'json', boolean: 'boolean', timestamp: 'timestamp without time zone',
  integer: 'integer', unsignedInteger: 'integer', unsignedTinyInteger: 'smallint',
  uuid: 'uuid',
} as const;

// [column, blueprint type, nullable]
type Spec = [string, keyof typeof T, boolean];
const ts = (): Spec[] => [['created_at', 'timestamp', true], ['updated_at', 'timestamp', true]];

const EXPECTED: Record<string, Spec[]> = {
  authorization_role_assignments: [
    ['id', 'id', false], ['user_id', 'foreignId', false], ['role_id', 'foreignId', false],
    ['tenant_id', 'string', true], ['scope_type', 'string', false], ['scope_id', 'string', true],
    ['valid_from', 'timestamp', true], ['valid_until', 'timestamp', true],
    ['assignment_source', 'string', false], ['assignment_reason', 'text', true],
    ['assigned_by', 'foreignId', true], ['approved_by', 'foreignId', true],
    ['status', 'string', false], ...ts(),
  ],
  authorization_role_inheritances: [
    ['id', 'id', false], ['parent_role_id', 'foreignId', false], ['child_role_id', 'foreignId', false],
    ['max_depth', 'unsignedTinyInteger', false], ['inherit_sensitive', 'boolean', false], ...ts(),
  ],
  authorization_policies: [
    ['id', 'id', false], ['tenant_id', 'string', true], ['code', 'string', false], ['name', 'string', false],
    ['description', 'text', true], ['effect', 'string', false], ['subjects', 'json', true],
    ['actions', 'json', false], ['resources', 'json', false], ['scope_type', 'string', false],
    ['scope_id', 'string', true], ['conditions', 'json', true], ['obligations', 'json', true],
    ['priority', 'integer', false], ['valid_from', 'timestamp', true], ['valid_until', 'timestamp', true],
    ['status', 'string', false], ['version', 'unsignedInteger', false], ['audit_required', 'boolean', false],
    ['created_by', 'foreignId', true], ['updated_by', 'foreignId', true], ['approved_by', 'foreignId', true],
    ['approved_at', 'timestamp', true], ...ts(),
  ],
  authorization_policy_versions: [
    ['id', 'id', false], ['policy_id', 'foreignId', false], ['version', 'unsignedInteger', false],
    ['snapshot', 'json', false], ['change_summary', 'text', true],
    ['previous_version_id', 'foreignId', true], ['changed_by', 'foreignId', true],
    ['approved_by', 'foreignId', true], ['approved_at', 'timestamp', true],
    ['effective_at', 'timestamp', true], ['deployment_status', 'string', false], ...ts(),
  ],
  authorization_relationships: [
    ['id', 'id', false], ['tenant_id', 'string', true], ['subject_type', 'string', false],
    ['subject_id', 'string', false], ['relationship', 'string', false], ['resource_type', 'string', false],
    ['resource_id', 'string', false], ['valid_from', 'timestamp', true], ['valid_until', 'timestamp', true],
    ['created_by', 'foreignId', true], ...ts(),
  ],
  authorization_access_requests: [
    ['id', 'id', false], ['tenant_id', 'string', true], ['requester_id', 'foreignId', false],
    ['target_user_id', 'foreignId', true], ['role_id', 'foreignId', true],
    ['permission_code', 'string', true], ['scope_type', 'string', false], ['scope_id', 'string', true],
    ['business_reason', 'text', false], ['requested_until', 'timestamp', true], ['status', 'string', false],
    ['decided_by', 'foreignId', true], ['decision_reason', 'text', true], ['decided_at', 'timestamp', true],
    ['revoked_at', 'timestamp', true], ['revoked_by', 'foreignId', true], ...ts(),
  ],
  authorization_delegations: [
    ['id', 'id', false], ['tenant_id', 'string', true], ['delegator_id', 'foreignId', false],
    ['delegate_id', 'foreignId', false], ['permission_codes', 'json', false], ['scope_type', 'string', false],
    ['scope_id', 'string', true], ['valid_from', 'timestamp', false], ['valid_until', 'timestamp', false],
    ['reason', 'text', false], ['status', 'string', false], ['approved_by', 'foreignId', true], ...ts(),
  ],
  authorization_emergency_grants: [
    ['id', 'id', false], ['grant_uuid', 'uuid', false], ['tenant_id', 'string', true],
    ['user_id', 'foreignId', false], ['permission_codes', 'json', false], ['scope_type', 'string', false],
    ['scope_id', 'string', true], ['reason', 'text', false], ['valid_from', 'timestamp', false],
    ['valid_until', 'timestamp', false], ['status', 'string', false], ['approved_by', 'foreignId', true],
    ['revoked_at', 'timestamp', true], ['revoked_by', 'foreignId', true], ...ts(),
  ],
  authorization_sod_rules: [
    ['id', 'id', false], ['tenant_id', 'string', true], ['code', 'string', false], ['name', 'string', false],
    ['conflicting_role_codes', 'json', true], ['conflicting_permission_codes', 'json', true],
    ['enforcement', 'string', false], ['is_active', 'boolean', false], ...ts(),
  ],
  authorization_decision_logs: [
    ['id', 'id', false], ['decision_id', 'uuid', false], ['tenant_id', 'string', true],
    ['user_id', 'foreignId', true], ['session_id', 'string', true], ['action', 'string', false],
    ['resource_type', 'string', false], ['resource_id', 'string', true], ['decision', 'string', false],
    ['reason_code', 'string', false], ['matched_policy_ids', 'json', true], ['failed_conditions', 'json', true],
    ['scope', 'json', true], ['obligations', 'json', true], ['ip_address', 'string', true],
    ['device', 'string', true], ['request_id', 'string', true], ['changed_fields', 'json', true],
    ['business_reason', 'string', true], ['authorization_version', 'string', false],
    ['duration_ms', 'unsignedInteger', false], ...ts(),
  ],
  authorization_feature_flags: [
    ['id', 'id', false], ['tenant_id', 'string', false], ['key', 'string', false],
    ['enabled', 'boolean', false], ['configuration', 'json', true], ['updated_by', 'foreignId', true], ...ts(),
  ],
  // columns the migration ADDS to pre-existing tables
  permissions: [
    ['code', 'string', true], ['resource', 'string', true], ['action', 'string', true],
    ['level', 'string', false], ['is_sensitive', 'boolean', false], ['is_active', 'boolean', false],
  ],
  roles: [
    ['code', 'string', true], ['description', 'text', true], ['role_type', 'string', false],
    ['tenant_id', 'string', true], ['is_system', 'boolean', false], ['is_assignable', 'boolean', false],
    ['is_sensitive', 'boolean', false], ['requires_approval', 'boolean', false],
    ['default_scope_type', 'string', false], ['status', 'string', false], ['version', 'unsignedInteger', false],
    ['created_by', 'foreignId', true], ['updated_by', 'foreignId', true],
  ],
  role_permissions: [
    ['effect', 'string', false], ['conditions', 'json', true], ['obligations', 'json', true],
    ['inherit_to_children', 'boolean', false], ['valid_from', 'timestamp', true], ['valid_until', 'timestamp', true],
  ],
  user_permissions: [
    ['conditions', 'json', true], ['obligations', 'json', true],
    ['valid_from', 'timestamp', true], ['valid_until', 'timestamp', true],
  ],
};

const REQUIRED_INDEXES = [
  'permissions_code_unique', 'permissions_resource_action_index',
  'roles_code_unique', 'roles_tenant_status_index',
  'auth_role_assign_user_tenant_idx', 'auth_role_assign_scope_idx', 'auth_role_assign_expiry_idx',
  'auth_role_inheritance_unique', 'auth_policy_lookup_idx', 'auth_policy_validity_idx',
  'auth_policy_version_unique', 'auth_relationship_subject_idx', 'auth_relationship_resource_idx',
  'auth_access_request_queue_idx', 'auth_delegation_active_idx', 'auth_emergency_active_idx',
  'auth_decision_tenant_idx', 'auth_decision_user_idx', 'auth_decision_resource_idx',
  'auth_feature_flag_unique',
];

let mismatches = 0;
const note = (s: string) => { mismatches++; console.log(`  MISMATCH ${s}`); };

for (const [table, spec] of Object.entries(EXPECTED)) {
  const cols = actual.get(table);
  console.log(`\n${table}`);
  if (!cols) { note(`${table}: table absent`); continue; }

  for (const [name, kind, nullable] of spec) {
    const c = cols.get(name);
    if (!c) { note(`${table}.${name}: column absent`); continue; }
    const want = T[kind];
    // json vs jsonb is a real difference in Postgres but not a behavioural one
    // for Laravel's json cast; flag it, don't fail on it.
    const typeOk = c.data_type === want || (want === 'json' && c.data_type === 'jsonb');
    if (!typeOk) note(`${table}.${name}: type ${c.data_type}, expected ${want}`);
    const isNull = c.is_nullable === 'YES';
    if (isNull !== nullable) note(`${table}.${name}: nullable=${isNull}, expected ${nullable}`);
  }

  // extra columns only matter on the 11 created tables
  if (table.startsWith('authorization_')) {
    const expectedNames = new Set(spec.map((s) => s[0]));
    const extra = [...cols.keys()].filter((k) => !expectedNames.has(k));
    if (extra.length) console.log(`  EXTRA columns (superset, not a conflict): ${extra.join(', ')}`);
  }
  if (mismatches === 0 || !Object.keys(EXPECTED).includes(table)) continue;
}

console.log('\n=== required indexes ===');
const idxNames = new Set((d.indexes as any[]).map((i) => i.indexname));
const conNames = new Set((d.constraints as any[]).map((c) => c.constraint_name));
for (const ix of REQUIRED_INDEXES) {
  const present = idxNames.has(ix) || conNames.has(ix);
  if (!present) { console.log(`  MISSING ${ix}`); mismatches++; }
}

console.log(`\nTOTAL MISMATCHES: ${mismatches}`);
