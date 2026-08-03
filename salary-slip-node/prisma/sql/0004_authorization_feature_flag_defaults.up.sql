-- =====================================================================
-- 0004 — Seed the authorization feature flags
--
-- authorization_feature_flags is empty, and empty is the single most
-- dangerous state it can be in.
--
-- RequirePermission asks FeatureFlags::enabled('authorization_shadow_mode',
-- $tenant, true) and, on a deny from the new engine, falls back to the
-- legacy decision only while that flag is on. With no rows, the answer
-- comes from the `true` default baked into the call site — so the whole
-- application currently depends on a hardcoded parameter rather than on
-- anything visible in the database. authorization_role_assignments is
-- also empty, so the new engine denies nearly everything and that
-- fallback is what keeps production working. One row saying
-- shadow_mode = false would deny every permission-checked request.
--
-- Writing the flags down does not change behaviour: shadow mode was
-- already effectively on. It makes the state explicit, greppable, and
-- visible to the flags endpoint instead of implicit in a default
-- argument.
--
-- The seven keys and their values are copied exactly from the PHP
-- migration's own seed loop, so applying this leaves the table in the
-- state `php artisan migrate` would have produced. Only
-- authorization_shadow_mode is read for an authorization decision; the
-- rest are surfaced by GET /authorization/flags and read with a `false`
-- default, so seeding them true makes the administration UI show the
-- platform as available. Nothing else consumes them.
--
-- Idempotent: an existing row for a key is left exactly as it is, so
-- this can never overwrite a deliberate operator change.
-- =====================================================================

BEGIN;

INSERT INTO authorization_feature_flags (tenant_id, key, enabled, created_at, updated_at)
SELECT v.tenant_id, v.key, v.enabled, now(), now()
  FROM (VALUES
    ('*', 'authorization_engine_v2',       TRUE),
    ('*', 'authorization_shadow_mode',     TRUE),
    ('*', 'authorization_field_security',  TRUE),
    ('*', 'authorization_row_security',    TRUE),
    ('*', 'authorization_policy_builder',  TRUE),
    ('*', 'authorization_access_requests', TRUE),
    ('*', 'authorization_emergency_access',TRUE)
  ) AS v(tenant_id, key, enabled)
 WHERE NOT EXISTS (
   SELECT 1 FROM authorization_feature_flags f
    WHERE f.key = v.key AND COALESCE(f.tenant_id, '*') = v.tenant_id
 );

COMMIT;
