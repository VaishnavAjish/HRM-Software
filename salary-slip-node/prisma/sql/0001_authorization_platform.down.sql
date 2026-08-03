-- =====================================================================
-- 0001 DOWN — remove the enterprise authorization platform
--
-- Restores the schema to the shape production had before 0001: the four
-- shared tables lose their added columns, and the authorization_* tables
-- are dropped.
--
-- This is a real rollback, not a cleanup script. It is destructive of
-- authorization data created *after* the migration — scoped assignments,
-- policies, delegations and the decision log have no pre-0001 home to be
-- written back to. Take a dump first; see scripts/authz-migrate.ts, which
-- refuses to run this without --confirm.
--
-- Legacy RBAC (user_roles, permission_dimensions, role_permissions rows)
-- is untouched by 0001 and therefore still intact here.
-- =====================================================================

BEGIN;

-- Children before parents.
DROP TABLE IF EXISTS authorization_access_review_items;
DROP TABLE IF EXISTS authorization_access_reviews;
DROP TABLE IF EXISTS authorization_sod_violations;
DROP TABLE IF EXISTS authorization_sod_rules;
DROP TABLE IF EXISTS authorization_access_request_approvals;
DROP TABLE IF EXISTS authorization_access_requests;
DROP TABLE IF EXISTS authorization_emergency_grants;
DROP TABLE IF EXISTS authorization_delegations;
DROP TABLE IF EXISTS authorization_relationships;
DROP TABLE IF EXISTS authorization_policy_versions;
DROP TABLE IF EXISTS authorization_policies;
DROP TABLE IF EXISTS authorization_role_inheritances;
DROP TABLE IF EXISTS authorization_role_assignments;
DROP TABLE IF EXISTS authorization_decision_logs;
DROP TABLE IF EXISTS authorization_feature_flags;

-- Shared tables: drop what 0001 added, keep what predates it.
DROP INDEX IF EXISTS user_permissions_validity_idx;
ALTER TABLE user_permissions
  DROP COLUMN IF EXISTS conditions,
  DROP COLUMN IF EXISTS obligations,
  DROP COLUMN IF EXISTS valid_from,
  DROP COLUMN IF EXISTS valid_until;

DROP INDEX IF EXISTS role_permissions_validity_idx;
ALTER TABLE role_permissions
  DROP CONSTRAINT IF EXISTS role_permissions_effect_check;
ALTER TABLE role_permissions
  DROP COLUMN IF EXISTS effect,
  DROP COLUMN IF EXISTS conditions,
  DROP COLUMN IF EXISTS obligations,
  DROP COLUMN IF EXISTS inherit_to_children,
  DROP COLUMN IF EXISTS valid_from,
  DROP COLUMN IF EXISTS valid_until;

DROP INDEX IF EXISTS permissions_code_unique;
DROP INDEX IF EXISTS permissions_resource_idx;
ALTER TABLE permissions
  DROP COLUMN IF EXISTS code,
  DROP COLUMN IF EXISTS resource,
  DROP COLUMN IF EXISTS action,
  DROP COLUMN IF EXISTS is_active,
  DROP COLUMN IF EXISTS is_sensitive;

DROP INDEX IF EXISTS roles_code_unique;
DROP INDEX IF EXISTS roles_tenant_status_idx;
ALTER TABLE roles
  DROP CONSTRAINT IF EXISTS roles_created_by_foreign,
  DROP CONSTRAINT IF EXISTS roles_updated_by_foreign;
ALTER TABLE roles
  DROP COLUMN IF EXISTS code,
  DROP COLUMN IF EXISTS tenant_id,
  DROP COLUMN IF EXISTS description,
  DROP COLUMN IF EXISTS role_type,
  DROP COLUMN IF EXISTS is_system,
  DROP COLUMN IF EXISTS is_assignable,
  DROP COLUMN IF EXISTS is_sensitive,
  DROP COLUMN IF EXISTS requires_approval,
  DROP COLUMN IF EXISTS default_scope_type,
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS version,
  DROP COLUMN IF EXISTS created_by,
  DROP COLUMN IF EXISTS updated_by;

COMMIT;
