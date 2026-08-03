-- =====================================================================
-- 0004 DOWN — remove the seeded global flags
--
-- Deletes only the seven global ('*') rows this migration inserted. A
-- per-tenant override, or any key added later, is left alone.
--
-- Removing authorization_shadow_mode does NOT disable shadow mode: with
-- the row gone, FeatureFlags falls back to the `true` default at the
-- call site, which is where it stood before 0004. This rollback returns
-- the implicit behaviour, not a stricter one.
-- =====================================================================

BEGIN;

DELETE FROM authorization_feature_flags
 WHERE COALESCE(tenant_id, '*') = '*'
   AND key IN (
     'authorization_engine_v2',
     'authorization_shadow_mode',
     'authorization_field_security',
     'authorization_row_security',
     'authorization_policy_builder',
     'authorization_access_requests',
     'authorization_emergency_access'
   );

COMMIT;
