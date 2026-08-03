-- =====================================================================
-- 0003 DOWN — remove the PHP-parity columns and indexes
--
-- Safe to run only while the PHP authorization controllers are not in
-- use: it re-opens every 42703 that 0003 closed. It exists so 0003 is
-- reversible, not because rolling back is routine.
--
-- Dropping a column destroys its data. All eleven tables were empty when
-- 0003 was applied; if rows have been written since, they lose these
-- values permanently. permissions.level reverts 96 rows to having no
-- level at all.
-- =====================================================================

BEGIN;

DROP INDEX IF EXISTS permissions_resource_action_index;
DROP INDEX IF EXISTS auth_role_assign_scope_idx;
DROP INDEX IF EXISTS auth_role_assign_expiry_idx;
DROP INDEX IF EXISTS auth_role_assign_user_tenant_idx;
DROP INDEX IF EXISTS auth_policy_validity_idx;
DROP INDEX IF EXISTS auth_relationship_resource_idx;
DROP INDEX IF EXISTS auth_decision_resource_idx;
DROP INDEX IF EXISTS auth_decision_tenant_idx;

ALTER TABLE permissions
  DROP COLUMN IF EXISTS level;

ALTER TABLE authorization_role_assignments
  DROP COLUMN IF EXISTS assignment_source,
  DROP COLUMN IF EXISTS assignment_reason;

ALTER TABLE authorization_role_inheritances
  DROP COLUMN IF EXISTS max_depth,
  DROP COLUMN IF EXISTS inherit_sensitive;

ALTER TABLE authorization_policies
  DROP COLUMN IF EXISTS audit_required,
  DROP COLUMN IF EXISTS approved_at;

ALTER TABLE authorization_policy_versions
  DROP COLUMN IF EXISTS approved_at,
  DROP COLUMN IF EXISTS effective_at,
  DROP COLUMN IF EXISTS deployment_status,
  DROP COLUMN IF EXISTS updated_at;

ALTER TABLE authorization_access_requests
  DROP COLUMN IF EXISTS permission_code,
  DROP COLUMN IF EXISTS decision_reason;

ALTER TABLE authorization_sod_rules
  DROP COLUMN IF EXISTS conflicting_role_codes,
  DROP COLUMN IF EXISTS conflicting_permission_codes,
  DROP COLUMN IF EXISTS enforcement;

ALTER TABLE authorization_decision_logs
  DROP COLUMN IF EXISTS updated_at;

ALTER TABLE authorization_feature_flags
  DROP COLUMN IF EXISTS configuration;

COMMIT;
