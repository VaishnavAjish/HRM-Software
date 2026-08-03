-- =====================================================================
-- 0003 — PHP parity for the authorization platform
--
-- Two implementations of the same eleven tables exist:
--
--   * prisma/sql/0001, which built what production actually has
--   * salary-slip-bac/database/migrations/2026_08_03_000001_create_
--     enterprise_authorization_platform.php, which the live PHP
--     controllers, models and services were written against
--
-- They diverge. The PHP side reads and writes eighteen columns that
-- production does not have, and thirty-six authorization routes are
-- registered against them. Each of those is a
-- `SQLSTATE[42703] column does not exist` waiting for its first caller.
-- The worst is authorization_decision_logs.updated_at: Eloquent puts
-- both timestamps in every INSERT, so the audit trail cannot be written
-- at all (it survives only because AuthorizationEngine::finish wraps the
-- write in a try/catch and silently drops the record).
--
-- This migration adds exactly those eighteen columns, plus the indexes
-- the PHP migration declares that have no equivalent in production. It
-- is additive only: no column is dropped, retyped, or made stricter, and
-- no row is modified. Production keeps the columns 0001 gave it that PHP
-- does not know about — the result is a superset that satisfies both.
--
-- All eleven tables are empty, so every NOT NULL DEFAULT below is a
-- metadata-only change. permissions.level is added to 96 existing rows
-- with the same default the PHP migration declares ('ACTION').
--
-- Idempotent. Reversible: see the matching .down.sql.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- permissions
-- PermissionController validates `level` against a seven-value list and
-- writes it on both store and update.
-- ---------------------------------------------------------------------
ALTER TABLE permissions
  ADD COLUMN IF NOT EXISTS level VARCHAR(32) NOT NULL DEFAULT 'ACTION';

-- The PHP migration declares (resource, action); production indexes
-- resource alone, which cannot serve a lookup on both.
CREATE INDEX IF NOT EXISTS permissions_resource_action_index
  ON permissions (resource, action);

-- ---------------------------------------------------------------------
-- authorization_role_assignments
-- Written by EnterpriseRoleController::assign ('MANUAL') and by
-- AccessRequestController::approve ('ACCESS_REQUEST'), which also reads
-- assignment_source back when revoking.
-- ---------------------------------------------------------------------
ALTER TABLE authorization_role_assignments
  ADD COLUMN IF NOT EXISTS assignment_source VARCHAR(32) NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN IF NOT EXISTS assignment_reason TEXT;

CREATE INDEX IF NOT EXISTS auth_role_assign_scope_idx
  ON authorization_role_assignments (role_id, scope_type, scope_id);
CREATE INDEX IF NOT EXISTS auth_role_assign_expiry_idx
  ON authorization_role_assignments (valid_until, status);
-- Production's auth_role_assignment_user_idx is (user_id, status,
-- valid_until) and cannot serve a tenant-scoped lookup.
CREATE INDEX IF NOT EXISTS auth_role_assign_user_tenant_idx
  ON authorization_role_assignments (user_id, tenant_id, status);

-- ---------------------------------------------------------------------
-- authorization_role_inheritances
-- EnterpriseRoleController::inherit writes both on every call.
-- ---------------------------------------------------------------------
ALTER TABLE authorization_role_inheritances
  ADD COLUMN IF NOT EXISTS max_depth SMALLINT NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS inherit_sensitive BOOLEAN NOT NULL DEFAULT FALSE;

-- ---------------------------------------------------------------------
-- authorization_policies
-- audit_required is in the model's $fillable and casts; approved_at is
-- written by PolicyController::publish and ::rollback.
-- ---------------------------------------------------------------------
ALTER TABLE authorization_policies
  ADD COLUMN IF NOT EXISTS audit_required BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP(0) WITHOUT TIME ZONE;

CREATE INDEX IF NOT EXISTS auth_policy_validity_idx
  ON authorization_policies (valid_from, valid_until);

-- ---------------------------------------------------------------------
-- authorization_policy_versions
-- deployment_status drives the publish/rollback state machine.
-- updated_at is absent, so Eloquent cannot insert a version row at all.
-- ---------------------------------------------------------------------
ALTER TABLE authorization_policy_versions
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP(0) WITHOUT TIME ZONE,
  ADD COLUMN IF NOT EXISTS effective_at TIMESTAMP(0) WITHOUT TIME ZONE,
  ADD COLUMN IF NOT EXISTS deployment_status VARCHAR(24) NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP(0) WITHOUT TIME ZONE;

-- ---------------------------------------------------------------------
-- authorization_relationships
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS auth_relationship_resource_idx
  ON authorization_relationships (resource_type, resource_id, relationship);

-- ---------------------------------------------------------------------
-- authorization_access_requests
-- The model is $fillable for permission_code and decision_reason;
-- production has permission_codes (plural, JSON) and decision_note,
-- which the PHP code never references. Both shapes now coexist.
-- ---------------------------------------------------------------------
ALTER TABLE authorization_access_requests
  ADD COLUMN IF NOT EXISTS permission_code VARCHAR(255),
  ADD COLUMN IF NOT EXISTS decision_reason TEXT;

-- ---------------------------------------------------------------------
-- authorization_sod_rules
-- SeparationOfDuties::conflicts reads conflicting_role_codes and
-- enforcement on every role assignment and access-request approval, so
-- these three absences break the two write paths that matter most.
-- Production stores the same idea as left_codes/right_codes/severity.
-- ---------------------------------------------------------------------
ALTER TABLE authorization_sod_rules
  ADD COLUMN IF NOT EXISTS conflicting_role_codes JSON,
  ADD COLUMN IF NOT EXISTS conflicting_permission_codes JSON,
  ADD COLUMN IF NOT EXISTS enforcement VARCHAR(24) NOT NULL DEFAULT 'BLOCK';

-- ---------------------------------------------------------------------
-- authorization_decision_logs
-- ---------------------------------------------------------------------
ALTER TABLE authorization_decision_logs
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP(0) WITHOUT TIME ZONE;

CREATE INDEX IF NOT EXISTS auth_decision_resource_idx
  ON authorization_decision_logs (resource_type, resource_id);
-- Production's auth_decision_log_search_idx is (tenant_id, created_at);
-- the allow/deny split is what the analytics endpoint groups by.
CREATE INDEX IF NOT EXISTS auth_decision_tenant_idx
  ON authorization_decision_logs (tenant_id, decision, created_at);

-- ---------------------------------------------------------------------
-- authorization_feature_flags
-- In the model's $fillable and cast to array.
-- ---------------------------------------------------------------------
ALTER TABLE authorization_feature_flags
  ADD COLUMN IF NOT EXISTS configuration JSON;

COMMIT;
