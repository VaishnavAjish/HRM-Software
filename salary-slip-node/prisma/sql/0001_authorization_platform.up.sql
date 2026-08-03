-- =====================================================================
-- 0001 — Enterprise authorization platform
--
-- Two halves:
--   A. Widen the four shared tables the legacy RBAC already owns
--      (roles, permissions, role_permissions, user_permissions) so they
--      can carry codes, effects, conditions and validity windows.
--   B. Create the eleven authorization_* tables.
--
-- Nothing here drops or rewrites existing rows. The legacy system keeps
-- working against the same tables throughout — every added column is
-- nullable or defaulted, so an INSERT written against the old shape still
-- succeeds. Legacy removal is a separate, later migration.
--
-- Idempotent: safe to run twice. Reversible: see the matching .down.sql.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- A. Shared tables
-- ---------------------------------------------------------------------

-- roles: production has (id, name, type, is_active, created_at, updated_at).
ALTER TABLE roles
  ADD COLUMN IF NOT EXISTS code                VARCHAR(190),
  ADD COLUMN IF NOT EXISTS tenant_id           VARCHAR(190),
  ADD COLUMN IF NOT EXISTS description         VARCHAR(500),
  ADD COLUMN IF NOT EXISTS role_type           VARCHAR(40)  NOT NULL DEFAULT 'BUSINESS',
  ADD COLUMN IF NOT EXISTS is_system           BOOLEAN      NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_assignable       BOOLEAN      NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS is_sensitive        BOOLEAN      NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS requires_approval   BOOLEAN      NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS default_scope_type  VARCHAR(40)  NOT NULL DEFAULT 'TENANT',
  ADD COLUMN IF NOT EXISTS status              VARCHAR(30)  NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS version             INTEGER      NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS created_by          BIGINT,
  ADD COLUMN IF NOT EXISTS updated_by          BIGINT;

-- Backfill a code for every pre-existing role before the unique index is
-- added, otherwise several NULLs are fine but the migration that later makes
-- it NOT NULL would fail. slug(name): lowercase, non-alphanumerics to '_'.
UPDATE roles
   SET code = regexp_replace(lower(trim(name)), '[^a-z0-9]+', '_', 'g')
 WHERE code IS NULL;

-- Two legacy roles could slug to the same code; disambiguate with the id.
UPDATE roles r
   SET code = r.code || '_' || r.id
  FROM (SELECT code AS dup FROM roles GROUP BY code HAVING count(*) > 1) d
 WHERE r.code = d.dup;

CREATE UNIQUE INDEX IF NOT EXISTS roles_code_unique ON roles (code);
CREATE INDEX IF NOT EXISTS roles_tenant_status_idx ON roles (tenant_id, status);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'roles_created_by_foreign') THEN
    ALTER TABLE roles ADD CONSTRAINT roles_created_by_foreign
      FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'roles_updated_by_foreign') THEN
    ALTER TABLE roles ADD CONSTRAINT roles_updated_by_foreign
      FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE SET NULL;
  END IF;
END $$;

-- permissions: production has (id, name, group_id, description, ...).
-- `name` is the legacy key; `code` becomes the canonical one. They are
-- seeded identical so the engine's `code OR name` match is a no-op today and
-- the legacy column can be dropped later without a second data migration.
ALTER TABLE permissions
  ADD COLUMN IF NOT EXISTS code         VARCHAR(190),
  ADD COLUMN IF NOT EXISTS resource     VARCHAR(190),
  ADD COLUMN IF NOT EXISTS action       VARCHAR(80),
  ADD COLUMN IF NOT EXISTS is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS is_sensitive BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE permissions SET code = name WHERE code IS NULL;

-- domain.resource.action -> resource = everything but the last segment.
UPDATE permissions
   SET resource = regexp_replace(code, '\.[^.]+$', ''),
       action   = regexp_replace(code, '^.*\.', '')
 WHERE resource IS NULL AND code LIKE '%.%';

-- Reveal/unmask permissions are sensitive by definition; the matrix greys
-- them behind an extra confirmation.
UPDATE permissions
   SET is_sensitive = TRUE
 WHERE code LIKE '%.reveal' OR code LIKE '%.unmask' OR code LIKE '%.override';

CREATE UNIQUE INDEX IF NOT EXISTS permissions_code_unique ON permissions (code);
CREATE INDEX IF NOT EXISTS permissions_resource_idx ON permissions (resource);

-- role_permissions: production has only (role_id, permission_id).
ALTER TABLE role_permissions
  ADD COLUMN IF NOT EXISTS effect             VARCHAR(10) NOT NULL DEFAULT 'ALLOW',
  ADD COLUMN IF NOT EXISTS conditions         JSONB,
  ADD COLUMN IF NOT EXISTS obligations        JSONB,
  ADD COLUMN IF NOT EXISTS inherit_to_children BOOLEAN    NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS valid_from         TIMESTAMP(0),
  ADD COLUMN IF NOT EXISTS valid_until        TIMESTAMP(0);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'role_permissions_effect_check') THEN
    ALTER TABLE role_permissions ADD CONSTRAINT role_permissions_effect_check
      CHECK (effect IN ('ALLOW', 'DENY'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS role_permissions_validity_idx
  ON role_permissions (role_id, valid_from, valid_until);

-- user_permissions: production has (user_id, permission_id, is_denied).
ALTER TABLE user_permissions
  ADD COLUMN IF NOT EXISTS conditions  JSONB,
  ADD COLUMN IF NOT EXISTS obligations JSONB,
  ADD COLUMN IF NOT EXISTS valid_from  TIMESTAMP(0),
  ADD COLUMN IF NOT EXISTS valid_until TIMESTAMP(0);

CREATE INDEX IF NOT EXISTS user_permissions_validity_idx
  ON user_permissions (user_id, valid_from, valid_until);

-- ---------------------------------------------------------------------
-- B. New tables
-- ---------------------------------------------------------------------

-- Scoped role assignments. Supersedes user_roles, which carries no scope:
-- the same user may hold HR Manager over one company and Branch Admin over
-- one branch, which the two-column pivot cannot express.
CREATE TABLE IF NOT EXISTS authorization_role_assignments (
  id            BIGSERIAL PRIMARY KEY,
  user_id       BIGINT       NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role_id       BIGINT       NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
  scope_type    VARCHAR(40)  NOT NULL DEFAULT 'TENANT',
  scope_id      VARCHAR(190),
  tenant_id     VARCHAR(190),
  status        VARCHAR(30)  NOT NULL DEFAULT 'ACTIVE',
  is_temporary  BOOLEAN      NOT NULL DEFAULT FALSE,
  valid_from    TIMESTAMP(0),
  valid_until   TIMESTAMP(0),
  reason        VARCHAR(500),
  assigned_by   BIGINT REFERENCES users (id) ON DELETE SET NULL,
  approved_by   BIGINT REFERENCES users (id) ON DELETE SET NULL,
  revoked_at    TIMESTAMP(0),
  revoked_by    BIGINT REFERENCES users (id) ON DELETE SET NULL,
  created_at    TIMESTAMP(0),
  updated_at    TIMESTAMP(0)
);

-- One live assignment per (user, role, scope). Partial, so a revoked row can
-- coexist with a fresh grant of the same access.
CREATE UNIQUE INDEX IF NOT EXISTS auth_role_assignment_unique
  ON authorization_role_assignments (user_id, role_id, scope_type, (COALESCE(scope_id, '')))
  WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS auth_role_assignment_user_idx
  ON authorization_role_assignments (user_id, status, valid_until);

-- Role inheritance edges. Cycles are rejected in application code before the
-- insert; the engine also caps traversal depth so a row inserted by hand
-- cannot spin the evaluator.
CREATE TABLE IF NOT EXISTS authorization_role_inheritances (
  id             BIGSERIAL PRIMARY KEY,
  parent_role_id BIGINT NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
  child_role_id  BIGINT NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
  created_at     TIMESTAMP(0),
  updated_at     TIMESTAMP(0),
  CONSTRAINT auth_role_inheritance_no_self CHECK (parent_role_id <> child_role_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS auth_role_inheritance_unique
  ON authorization_role_inheritances (parent_role_id, child_role_id);
CREATE INDEX IF NOT EXISTS auth_role_inheritance_child_idx
  ON authorization_role_inheritances (child_role_id);

CREATE TABLE IF NOT EXISTS authorization_policies (
  id                BIGSERIAL PRIMARY KEY,
  tenant_id         VARCHAR(190),
  code              VARCHAR(190) NOT NULL,
  name              VARCHAR(255) NOT NULL,
  description       VARCHAR(1000),
  effect            VARCHAR(10)  NOT NULL DEFAULT 'ALLOW',
  subjects          JSONB,
  actions           JSONB,
  resources         JSONB,
  scope_type        VARCHAR(40)  NOT NULL DEFAULT 'TENANT',
  scope_id          VARCHAR(190),
  conditions        JSONB,
  obligations       JSONB,
  priority          INTEGER      NOT NULL DEFAULT 100,
  status            VARCHAR(30)  NOT NULL DEFAULT 'DRAFT',
  version           INTEGER      NOT NULL DEFAULT 1,
  valid_from        TIMESTAMP(0),
  valid_until       TIMESTAMP(0),
  requires_approval BOOLEAN      NOT NULL DEFAULT FALSE,
  created_by        BIGINT REFERENCES users (id) ON DELETE SET NULL,
  updated_by        BIGINT REFERENCES users (id) ON DELETE SET NULL,
  approved_by       BIGINT REFERENCES users (id) ON DELETE SET NULL,
  created_at        TIMESTAMP(0),
  updated_at        TIMESTAMP(0),
  CONSTRAINT authorization_policies_effect_check CHECK (effect IN ('ALLOW', 'DENY'))
);
CREATE UNIQUE INDEX IF NOT EXISTS authorization_policies_code_unique ON authorization_policies (code);
CREATE INDEX IF NOT EXISTS authorization_policies_lookup_idx
  ON authorization_policies (tenant_id, status, priority DESC);

-- Immutable history. Every publish writes a row; rollback republishes one.
CREATE TABLE IF NOT EXISTS authorization_policy_versions (
  id                  BIGSERIAL PRIMARY KEY,
  policy_id           BIGINT  NOT NULL REFERENCES authorization_policies (id) ON DELETE CASCADE,
  version             INTEGER NOT NULL,
  snapshot            JSONB   NOT NULL,
  change_summary      VARCHAR(1000),
  previous_version_id BIGINT REFERENCES authorization_policy_versions (id) ON DELETE SET NULL,
  changed_by          BIGINT REFERENCES users (id) ON DELETE SET NULL,
  approved_by         BIGINT REFERENCES users (id) ON DELETE SET NULL,
  created_at          TIMESTAMP(0)
);
CREATE UNIQUE INDEX IF NOT EXISTS auth_policy_version_unique
  ON authorization_policy_versions (policy_id, version);

-- ReBAC edges: "user 7 is approver_of appointment 42".
CREATE TABLE IF NOT EXISTS authorization_relationships (
  id            BIGSERIAL PRIMARY KEY,
  tenant_id     VARCHAR(190),
  subject_type  VARCHAR(80)  NOT NULL DEFAULT 'user',
  subject_id    VARCHAR(190) NOT NULL,
  relationship  VARCHAR(80)  NOT NULL,
  resource_type VARCHAR(190) NOT NULL,
  resource_id   VARCHAR(190) NOT NULL,
  valid_from    TIMESTAMP(0),
  valid_until   TIMESTAMP(0),
  created_by    BIGINT REFERENCES users (id) ON DELETE SET NULL,
  created_at    TIMESTAMP(0),
  updated_at    TIMESTAMP(0)
);
CREATE INDEX IF NOT EXISTS auth_relationship_lookup_idx
  ON authorization_relationships (subject_type, subject_id, resource_type, resource_id);

CREATE TABLE IF NOT EXISTS authorization_access_requests (
  id               BIGSERIAL PRIMARY KEY,
  tenant_id        VARCHAR(190),
  requester_id     BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  target_user_id   BIGINT REFERENCES users (id) ON DELETE SET NULL,
  role_id          BIGINT REFERENCES roles (id) ON DELETE SET NULL,
  permission_codes JSONB,
  scope_type       VARCHAR(40),
  scope_id         VARCHAR(190),
  request_type     VARCHAR(30) NOT NULL DEFAULT 'PERMANENT',
  business_reason  VARCHAR(1000),
  attachment_path  VARCHAR(500),
  requested_from   TIMESTAMP(0),
  requested_until  TIMESTAMP(0),
  status           VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  decided_by       BIGINT REFERENCES users (id) ON DELETE SET NULL,
  decided_at       TIMESTAMP(0),
  decision_note    VARCHAR(1000),
  revoked_at       TIMESTAMP(0),
  revoked_by       BIGINT REFERENCES users (id) ON DELETE SET NULL,
  revocation_reason VARCHAR(500),
  created_at       TIMESTAMP(0),
  updated_at       TIMESTAMP(0)
);
CREATE INDEX IF NOT EXISTS auth_access_request_queue_idx
  ON authorization_access_requests (tenant_id, status, created_at DESC);

-- Approval chain. A request may need manager, resource owner and security.
CREATE TABLE IF NOT EXISTS authorization_access_request_approvals (
  id                BIGSERIAL PRIMARY KEY,
  access_request_id BIGINT      NOT NULL REFERENCES authorization_access_requests (id) ON DELETE CASCADE,
  stage             VARCHAR(40) NOT NULL,
  sequence          INTEGER     NOT NULL DEFAULT 1,
  approver_id       BIGINT REFERENCES users (id) ON DELETE SET NULL,
  status            VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  note              VARCHAR(1000),
  decided_at        TIMESTAMP(0),
  created_at        TIMESTAMP(0),
  updated_at        TIMESTAMP(0)
);
CREATE INDEX IF NOT EXISTS auth_access_request_approval_idx
  ON authorization_access_request_approvals (access_request_id, sequence);

CREATE TABLE IF NOT EXISTS authorization_delegations (
  id               BIGSERIAL PRIMARY KEY,
  tenant_id        VARCHAR(190),
  delegator_id     BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  delegate_id      BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  permission_codes JSONB,
  scope_type       VARCHAR(40),
  scope_id         VARCHAR(190),
  reason           VARCHAR(500),
  status           VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  valid_from       TIMESTAMP(0) NOT NULL,
  valid_until      TIMESTAMP(0) NOT NULL,
  approved_by      BIGINT REFERENCES users (id) ON DELETE SET NULL,
  revoked_at       TIMESTAMP(0),
  created_at       TIMESTAMP(0),
  updated_at       TIMESTAMP(0),
  CONSTRAINT auth_delegation_window_check CHECK (valid_until > valid_from),
  CONSTRAINT auth_delegation_not_self CHECK (delegator_id <> delegate_id)
);
CREATE INDEX IF NOT EXISTS auth_delegation_active_idx
  ON authorization_delegations (delegate_id, status, valid_until);

CREATE TABLE IF NOT EXISTS authorization_emergency_grants (
  id               BIGSERIAL PRIMARY KEY,
  grant_uuid       UUID NOT NULL,
  tenant_id        VARCHAR(190),
  user_id          BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  permission_codes JSONB,
  scope_type       VARCHAR(40),
  scope_id         VARCHAR(190),
  reason           VARCHAR(1000) NOT NULL,
  status           VARCHAR(30)   NOT NULL DEFAULT 'ACTIVE',
  valid_from       TIMESTAMP(0)  NOT NULL,
  valid_until      TIMESTAMP(0)  NOT NULL,
  approved_by      BIGINT REFERENCES users (id) ON DELETE SET NULL,
  mfa_verified     BOOLEAN NOT NULL DEFAULT FALSE,
  revoked_at       TIMESTAMP(0),
  revoked_by       BIGINT REFERENCES users (id) ON DELETE SET NULL,
  reviewed_at      TIMESTAMP(0),
  reviewed_by      BIGINT REFERENCES users (id) ON DELETE SET NULL,
  created_at       TIMESTAMP(0),
  updated_at       TIMESTAMP(0),
  CONSTRAINT auth_emergency_window_check CHECK (valid_until > valid_from)
);
CREATE UNIQUE INDEX IF NOT EXISTS auth_emergency_grant_uuid_unique
  ON authorization_emergency_grants (grant_uuid);
CREATE INDEX IF NOT EXISTS auth_emergency_active_idx
  ON authorization_emergency_grants (user_id, status, valid_until);

CREATE TABLE IF NOT EXISTS authorization_sod_rules (
  id             BIGSERIAL PRIMARY KEY,
  tenant_id      VARCHAR(190),
  code           VARCHAR(190) NOT NULL,
  name           VARCHAR(255) NOT NULL,
  description    VARCHAR(1000),
  left_codes     JSONB NOT NULL,
  right_codes    JSONB NOT NULL,
  severity       VARCHAR(30) NOT NULL DEFAULT 'BLOCK',
  requires_override_reason BOOLEAN NOT NULL DEFAULT TRUE,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMP(0),
  updated_at     TIMESTAMP(0),
  CONSTRAINT auth_sod_severity_check CHECK (severity IN ('BLOCK', 'WARN', 'REVIEW'))
);
CREATE UNIQUE INDEX IF NOT EXISTS auth_sod_rule_code_unique ON authorization_sod_rules (code);

CREATE TABLE IF NOT EXISTS authorization_sod_violations (
  id            BIGSERIAL PRIMARY KEY,
  tenant_id     VARCHAR(190),
  rule_id       BIGINT NOT NULL REFERENCES authorization_sod_rules (id) ON DELETE CASCADE,
  user_id       BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  detail        JSONB,
  status        VARCHAR(30) NOT NULL DEFAULT 'OPEN',
  override_reason VARCHAR(1000),
  overridden_by BIGINT REFERENCES users (id) ON DELETE SET NULL,
  detected_at   TIMESTAMP(0),
  resolved_at   TIMESTAMP(0),
  created_at    TIMESTAMP(0),
  updated_at    TIMESTAMP(0)
);
CREATE INDEX IF NOT EXISTS auth_sod_violation_idx
  ON authorization_sod_violations (user_id, status);

-- Append-only. No UPDATE or DELETE path exists in application code, and the
-- table carries no updated_at for the same reason.
CREATE TABLE IF NOT EXISTS authorization_decision_logs (
  id                    BIGSERIAL PRIMARY KEY,
  decision_id           UUID NOT NULL,
  tenant_id             VARCHAR(190),
  user_id               BIGINT REFERENCES users (id) ON DELETE SET NULL,
  session_id            VARCHAR(190),
  action                VARCHAR(190) NOT NULL,
  resource_type         VARCHAR(190),
  resource_id           VARCHAR(190),
  decision              VARCHAR(10)  NOT NULL,
  reason_code           VARCHAR(80),
  matched_policy_ids    JSONB,
  failed_conditions     JSONB,
  scope                 JSONB,
  obligations           JSONB,
  ip_address            VARCHAR(64),
  device                VARCHAR(255),
  request_id            VARCHAR(190),
  changed_fields        JSONB,
  business_reason       VARCHAR(255),
  authorization_version VARCHAR(20) NOT NULL DEFAULT 'v2',
  duration_ms           INTEGER,
  created_at            TIMESTAMP(0),
  CONSTRAINT auth_decision_check CHECK (decision IN ('ALLOW', 'DENY'))
);
CREATE UNIQUE INDEX IF NOT EXISTS auth_decision_log_uuid_unique
  ON authorization_decision_logs (decision_id);
CREATE INDEX IF NOT EXISTS auth_decision_log_search_idx
  ON authorization_decision_logs (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS auth_decision_log_user_idx
  ON authorization_decision_logs (user_id, action, created_at DESC);

CREATE TABLE IF NOT EXISTS authorization_feature_flags (
  id          BIGSERIAL PRIMARY KEY,
  tenant_id   VARCHAR(190),
  key         VARCHAR(190) NOT NULL,
  enabled     BOOLEAN NOT NULL DEFAULT FALSE,
  description VARCHAR(500),
  updated_by  BIGINT REFERENCES users (id) ON DELETE SET NULL,
  created_at  TIMESTAMP(0),
  updated_at  TIMESTAMP(0)
);
CREATE UNIQUE INDEX IF NOT EXISTS auth_feature_flag_unique
  ON authorization_feature_flags ((COALESCE(tenant_id, '*')), key);

CREATE TABLE IF NOT EXISTS authorization_access_reviews (
  id            BIGSERIAL PRIMARY KEY,
  tenant_id     VARCHAR(190),
  name          VARCHAR(255) NOT NULL,
  description   VARCHAR(1000),
  status        VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
  scope_type    VARCHAR(40),
  scope_id      VARCHAR(190),
  due_at        TIMESTAMP(0),
  started_at    TIMESTAMP(0),
  completed_at  TIMESTAMP(0),
  created_by    BIGINT REFERENCES users (id) ON DELETE SET NULL,
  created_at    TIMESTAMP(0),
  updated_at    TIMESTAMP(0)
);

CREATE TABLE IF NOT EXISTS authorization_access_review_items (
  id           BIGSERIAL PRIMARY KEY,
  review_id    BIGINT NOT NULL REFERENCES authorization_access_reviews (id) ON DELETE CASCADE,
  user_id      BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role_id      BIGINT REFERENCES roles (id) ON DELETE SET NULL,
  assignment_id BIGINT REFERENCES authorization_role_assignments (id) ON DELETE SET NULL,
  decision     VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  note         VARCHAR(1000),
  reviewed_by  BIGINT REFERENCES users (id) ON DELETE SET NULL,
  reviewed_at  TIMESTAMP(0),
  created_at   TIMESTAMP(0),
  updated_at   TIMESTAMP(0)
);
CREATE INDEX IF NOT EXISTS auth_access_review_item_idx
  ON authorization_access_review_items (review_id, decision);

COMMIT;
