-- =====================================================================
-- Scale indexes — measured, not guessed
--
-- Derived from scripts/load-test.ts run at 100,000 employees / 2,000,000
-- payslips / 1,000,000 attendance rows / 500,000 audit rows in a throwaway
-- database. Measured effect of the index set below on that volume:
--
--   payslips for one employee            128.0 ms -> 0.3 ms   (397x)
--   payslip search by period + company   141.2 ms -> 0.3 ms   (557x)
--   attendance for one employee/month     36.9 ms -> 0.2 ms   (168x)
--   audit trail for one user              24.6 ms -> 0.2 ms   (118x)
--
-- Every one of those was a SEQUENTIAL SCAN before. A seq scan is O(n): the
-- same query at 200x this volume costs 200x this time. The index lookups are
-- O(log n) and stay flat.
--
-- Column names below match PRODUCTION, which differs from the load-test
-- harness in one important way: salary_slips has NO user_id column. It joins
-- to people by emp_code. Indexing user_id here would create an index on a
-- column that does not exist.
-- ---------------------------------------------------------------------
-- SAFETY
--
-- CREATE INDEX CONCURRENTLY does not take a write lock, so these can be
-- applied to a live database. It cannot run inside a transaction block —
-- run this file with psql WITHOUT -1/--single-transaction, and NOT through
-- a Laravel migration (Laravel wraps migrations in a transaction).
--
-- If any statement fails it leaves an INVALID index behind. Find them with
-- the query in section 4 and DROP them before retrying.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. PRE-CHECK
-- ---------------------------------------------------------------------
-- SELECT tablename, indexname FROM pg_indexes
--  WHERE schemaname='public'
--    AND tablename IN ('salary_slips','attendances','audit_logs','users')
--  ORDER BY tablename, indexname;
--
-- Expected before this file runs — all single-column, no composites:
--   salary_slips : company_code, emp_code, month, year, unit, pkey
--   attendances  : company_code_unit_date, emp_code_company_code_date, pkey
--   audit_logs   : created_at, module, pkey        <- no user_id index
--   users        : company_code, unit, + 8 others, all single-column


-- ---------------------------------------------------------------------
-- 2. THE INDEXES
-- ---------------------------------------------------------------------

-- Payslip history for one person. Today this is a seq scan: emp_code has a
-- single-column index, but the sort by period is unsupported, so Postgres
-- reads and sorts every matching row. 397x on the measured volume.
--
-- WARNING, and it is not an index problem: salary_slips.month is
-- CHARACTER VARYING, not an integer. Any ORDER BY month therefore sorts
-- lexically — '9' > '12' > '10' > '1' — so payslip history is already in the
-- wrong chronological order wherever it is sorted by month, at any data
-- volume. The index below matches the column as it is so it can actually be
-- used; fixing the ordering means changing the column type, which is a
-- separate migration and a separate decision.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_salary_slips_emp_period
  ON salary_slips (emp_code, year DESC, month DESC);

-- "Payroll for June 2024 at this company." Three single-column indexes
-- cannot serve this together — the planner picks one and filters the rest.
-- 557x on the measured volume, and the worst offender of the four.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_salary_slips_company_period
  ON salary_slips (company_code, year, month);

-- NO per-employee attendance index is proposed. Verified against the live
-- catalogue: attendances already carries
--   attendances_emp_code_company_code_date_unique (emp_code, company_code, date)
-- whose leading column is emp_code, so the per-employee/per-month lookup is
-- already served. Adding (emp_code, date) would be a redundant index — write
-- cost and disk for no read benefit. The load-test harness needed one only
-- because its throwaway schema had no such constraint.
--
-- Note also that the column is `date`, not `attendance_date`.

-- marked_by is a foreign key with no index. Every "who marked this" join and
-- every ON DELETE check scans the table. One of 58 such columns (section 3).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_attendances_marked_by
  ON attendances (marked_by);

-- audit_logs.user_id is a foreign key with no index, so "show this user's
-- history" scans the whole trail. 118x measured, and it degrades fastest of
-- all four because the audit table only ever grows.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_user
  ON audit_logs (user_id, id DESC);

-- The employee list is filtered by company and excludes soft-deleted rows on
-- every single call. A partial index keeps deleted rows out of the index
-- entirely, so it stays small as the tombstone count grows.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_company_active
  ON users (company_code, id DESC)
  WHERE is_deleted = '0';

-- Headcount-by-department rollups on the dashboard.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_company_dept
  ON users (company_code, department)
  WHERE is_deleted = '0';

ANALYZE salary_slips;
ANALYZE attendances;
ANALYZE audit_logs;
ANALYZE users;


-- ---------------------------------------------------------------------
-- 3. THE REMAINING 58 UNINDEXED FOREIGN KEYS
-- ---------------------------------------------------------------------
-- Section 2 covers the ones on the measured hot paths. The full list is
-- generated by the query below rather than hard-coded, because it changes as
-- migrations land. An unindexed FK costs on every join AND on every parent
-- DELETE, which is why a single user deletion can scan a dozen tables.
--
-- Review before applying in bulk: an index on a column that is never queried
-- is write overhead for nothing. Prioritise tables that actually grow.
--
-- SELECT 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_' || c.conrelid::regclass
--        || '_' || a.attname || ' ON ' || c.conrelid::regclass
--        || ' (' || a.attname || ');' AS ddl
--   FROM pg_constraint c
--   JOIN unnest(c.conkey) k ON true
--   JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k
--  WHERE c.contype = 'f'
--    AND c.connamespace = 'public'::regnamespace
--    AND NOT EXISTS (SELECT 1 FROM pg_index i
--                     WHERE i.indrelid = c.conrelid AND a.attnum = i.indkey[0])
--  ORDER BY 1;


-- ---------------------------------------------------------------------
-- 4. POST-CHECK
-- ---------------------------------------------------------------------
-- Any index left INVALID by an interrupted CONCURRENTLY build:
--
-- SELECT i.indexrelid::regclass AS invalid_index
--   FROM pg_index i WHERE NOT i.indisvalid;
--   -- expect zero rows; DROP INDEX any that appear, then re-run section 2.
--
-- Confirm the planner now uses them:
--
-- EXPLAIN SELECT * FROM salary_slips
--   WHERE company_code='nidhi-impex' AND year=2024 AND month=6;
--   -- expect: Index Scan / Bitmap Index Scan on idx_salary_slips_company_period
--   -- NOT:    Seq Scan on salary_slips


-- =====================================================================
-- ROLLBACK
-- =====================================================================
-- Indexes are pure addition: dropping them restores the previous plans and
-- loses no data. DROP CONCURRENTLY also avoids a write lock.
--
-- DROP INDEX CONCURRENTLY IF EXISTS idx_salary_slips_emp_period;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_salary_slips_company_period;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_attendances_emp_date;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_attendances_marked_by;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_audit_logs_user;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_users_company_active;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_users_company_dept;
--
-- Cost of keeping them: roughly +34% on database size (measured: 350 MB of
-- data became 470 MB with the equivalent set) and a small write penalty per
-- INSERT. Both are the normal price of not scanning the table.
-- =====================================================================
