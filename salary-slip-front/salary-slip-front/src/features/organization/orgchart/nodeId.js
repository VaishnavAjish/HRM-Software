const PREFIXES = [
  ["enterprise_", "enterprise"],
  ["company_", "company"],
  ["legal_entity_profile_", "legal_entity_profile"],
  ["org_unit_", "org_unit"],
  ["position_", "position"],
  ["user_", "user"],
];

/**
 * OrganizationChartService node ids are `{kind}_{numericId}` (e.g.
 * `org_unit_42`, `user_7`). Dialogs need the raw numeric id to call the
 * CRUD APIs, which operate on org units/positions/users directly.
 */
export function parseNodeId(id) {
  for (const [prefix, kind] of PREFIXES) {
    if (id.startsWith(prefix)) {
      return { kind, rawId: Number(id.slice(prefix.length)) };
    }
  }
  return { kind: null, rawId: null };
}
