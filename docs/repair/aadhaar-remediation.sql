-- =====================================================================
-- Aadhaar remediation — Phase 8
--
-- State as found (2026-08-03, verified by scripts/prod-verify.ts):
--
--   users                       339
--   aadhar_card_no populated    334   <- plaintext, no encryption
--   encrypted_aadhaar_number      0   <- COLUMN EXISTS, zero rows populated
--   aadhaar_last_four             0   <- COLUMN EXISTS, zero rows populated
--   aadhaar_secure_reference      0   <- COLUMN EXISTS, zero rows populated
--
--   CORRECTION (verified against information_schema, not inferred):
--   these three columns are NOT missing. They were created by
--   2026_07_30_000001_add_aadhaar_reference_to_users_table, which IS
--   recorded in `migrations` and applied on 30 July — four days before
--   the authorization incident. The same migration set also added
--   aadhaar_verification_status / _extraction_source / _extracted_at /
--   _verified_by / _verified_at, and a whole aadhaar_export_authorizations
--   table.
--
--   So the schema for Aadhaar protection was designed, migrated and
--   deployed. It was simply never populated. Every one of the 339 rows is
--   NULL in all three columns while 334 plaintext numbers sit in the
--   legacy column beside them. This is not a missing-feature problem; it
--   is a finished feature that was never switched on.
--
--   Consequence for this file: the ALTER TABLE in step 2 is a no-op, and
--   an earlier draft's guard ("refuse if aadhaar_secure_reference exists")
--   would have REFUSED TO RUN against production. The real work is the
--   backfill in step 3 and the encryption in step 5.
--
--   Value-length distribution of the populated column:
--     length 12 -> 294 rows   (well-formed Aadhaar)
--     length  1 ->  39 rows   (junk — a single character)
--     length 36 ->   1 row    (looks like a UUID, not an Aadhaar)
--
--   document_versions           38, of which 37 carry a 12-digit first path
--                               segment in s3_object_key and folder_path.
--                               14 of those segments exactly equal some
--                               user's aadhar_card_no.
--
--   document_audit_logs         2,417 rows recording full-Aadhaar disclosure.
--
-- =====================================================================
-- WHAT THIS FILE DOES AND DOES NOT DO
-- ---------------------------------------------------------------------
-- DOES (steps 2-4): add three columns, backfill the two that can be
--   derived in SQL, and add a partial index. Purely additive. No existing
--   column is read destructively, altered, or dropped.
--
-- DOES NOT: encrypt. `encrypted_aadhaar_number` is populated by the
--   application, not by this file, because the key is Laravel's APP_KEY
--   and lives outside the database. Encrypting in SQL would mean putting
--   the key in a query — which is logged, and defeats the exercise.
--   Step 5 is an artisan command, run after this file.
--
-- DOES NOT: drop `aadhar_card_no`. That is a separate migration, gated on
--   the verification in step 6 returning zero discrepancies. Dropping the
--   source before the ciphertext is proven readable is unrecoverable.
--
-- DOES NOT: touch S3. Existing object keys embed Aadhaar numbers and the
--   standing instruction is that objects are never renamed. Step 7
--   describes the forward-only containment instead.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. PRE-CHECK — run alone. Record the output before proceeding.
-- ---------------------------------------------------------------------
-- SELECT count(*) AS users,
--        count(aadhar_card_no) AS plaintext,
--        count(*) FILTER (WHERE length(aadhar_card_no) = 12) AS well_formed,
--        count(*) FILTER (WHERE aadhar_card_no IS NOT NULL
--                           AND length(aadhar_card_no) <> 12) AS malformed
--   FROM users;
--   expect: 339 / 334 / 294 / 40
--
-- SELECT column_name FROM information_schema.columns
--  WHERE table_schema='public' AND table_name='users'
--    AND column_name IN ('encrypted_aadhaar_number','aadhaar_last_four',
--                        'aadhaar_secure_reference');
--   expect: zero rows. If any row comes back, this file has already run.


-- ---------------------------------------------------------------------
-- 2. SCHEMA — additive
-- ---------------------------------------------------------------------
BEGIN;

-- Guard: refuse if the backfill has ALREADY run, so this file cannot
-- re-issue references over rows that already hold one.
--
-- It deliberately tests for populated DATA, not for the existence of the
-- columns. An earlier draft guarded on the column existing — which is
-- true on production since 30 July, so that draft would have aborted
-- before doing any work at all. Presence of the column says nothing about
-- whether the remediation has happened; presence of a value does.
DO $$
DECLARE populated INT;
BEGIN
  SELECT count(*) INTO populated
    FROM users WHERE aadhaar_secure_reference IS NOT NULL;
  IF populated > 0 THEN
    RAISE EXCEPTION
      'aadhaar_secure_reference already populated on % row(s) — backfill has run. Stop.', populated;
  END IF;
END $$;

ALTER TABLE users
  -- Laravel Crypt ciphertext is base64 JSON and grows well past 255 bytes.
  ADD COLUMN IF NOT EXISTS encrypted_aadhaar_number TEXT,
  -- The only fragment any screen is ever allowed to render.
  ADD COLUMN IF NOT EXISTS aadhaar_last_four        VARCHAR(4),
  -- Opaque handle for joins, lookups and support conversations, so no
  -- workflow needs the number itself to identify a record.
  ADD COLUMN IF NOT EXISTS aadhaar_secure_reference VARCHAR(64);

COMMIT;


-- ---------------------------------------------------------------------
-- 3. BACKFILL — only what is derivable without the encryption key
-- ---------------------------------------------------------------------
BEGIN;

-- last_four: only from well-formed values. A 1-character or 36-character
-- value is not an Aadhaar, and inventing a "last four" from it would
-- manufacture data that looks authoritative and is not.
UPDATE users
   SET aadhaar_last_four = right(aadhar_card_no, 4)
 WHERE aadhar_card_no IS NOT NULL
   AND length(aadhar_card_no) = 12
   AND aadhar_card_no ~ '^[0-9]{12}$'
   AND aadhaar_last_four IS NULL;
--   expect: UPDATE 294

-- secure_reference: unconditional for every user, including those with no
-- Aadhaar. A reference that exists only for people who supplied one is
-- itself a disclosure — its presence would leak who did.
--
-- gen_random_uuid() rather than encode(gen_random_bytes(24),'hex'): the
-- latter lives in pgcrypto, which is NOT installed on this database. A
-- rehearsal against a replica of production's data shape failed here with
-- 'function gen_random_bytes(integer) does not exist', and because the
-- failure was inside this transaction it also rolled back the last_four
-- backfill above. gen_random_uuid() is built in from PostgreSQL 13 and
-- draws on the same strong RNG, so it needs no extension and no superuser.
UPDATE users
   SET aadhaar_secure_reference = replace(gen_random_uuid()::text, '-', '')
 WHERE aadhaar_secure_reference IS NULL;
--   expect: UPDATE 339

COMMIT;


-- ---------------------------------------------------------------------
-- 4. CONSTRAINTS — added after the backfill, never before
-- ---------------------------------------------------------------------
BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS users_aadhaar_secure_reference_unique
  ON users (aadhaar_secure_reference)
  WHERE aadhaar_secure_reference IS NOT NULL;

-- Stops a future write from putting a full number in the four-digit field.
ALTER TABLE users
  ADD CONSTRAINT users_aadhaar_last_four_shape
  CHECK (aadhaar_last_four IS NULL OR aadhaar_last_four ~ '^[0-9]{4}$')
  NOT VALID;

-- Validated separately: NOT VALID takes a weaker lock, and VALIDATE then
-- scans without blocking writes.
ALTER TABLE users VALIDATE CONSTRAINT users_aadhaar_last_four_shape;

COMMIT;


-- ---------------------------------------------------------------------
-- 5. ENCRYPTION — application step, NOT SQL
-- ---------------------------------------------------------------------
-- Run from salary-slip-bac, after steps 2-4 have committed:
--
--   php artisan aadhaar:encrypt --dry-run    # reports counts, writes nothing
--   php artisan aadhaar:encrypt              # populates encrypted_aadhaar_number
--
-- The command must:
--   * read aadhar_card_no, write Crypt::encryptString() into
--     encrypted_aadhaar_number, and touch nothing else;
--   * skip rows where length(aadhar_card_no) <> 12, and report them;
--   * be re-runnable — skip rows already encrypted;
--   * decrypt-and-compare each row it writes before committing it, so a
--     key mismatch fails loudly on row 1 rather than silently on all 294;
--   * never write the plaintext to a log, an exception message, or stdout.
--
-- This command does not exist yet. It is the one piece of Phase 8 that is
-- application code rather than schema, and it is specified here rather
-- than written blind because it depends on which APP_KEY the deployed
-- backend actually holds — and the deployed backend is not this repo.


-- ---------------------------------------------------------------------
-- 6. VERIFICATION — gate for step 7. Every row must satisfy all four.
-- ---------------------------------------------------------------------
-- SELECT
--   count(*) FILTER (WHERE aadhaar_secure_reference IS NULL)        AS missing_reference,
--   count(*) FILTER (WHERE length(aadhar_card_no) = 12
--                      AND aadhaar_last_four IS NULL)               AS missing_last_four,
--   count(*) FILTER (WHERE length(aadhar_card_no) = 12
--                      AND encrypted_aadhaar_number IS NULL)        AS missing_ciphertext,
--   count(*) FILTER (WHERE aadhaar_last_four IS NOT NULL
--                      AND aadhaar_last_four <> right(aadhar_card_no, 4)) AS mismatched
--   FROM users;
--   REQUIRED: 0 / 0 / 0 / 0
--
-- Plus, from the application (the database cannot check this):
--   php artisan aadhaar:verify
--     decrypts every ciphertext and compares it to the plaintext.
--     REQUIRED: 294 verified, 0 failures.
--
-- Do not proceed to step 7 until both are clean.


-- ---------------------------------------------------------------------
-- 7. RETIRING THE PLAINTEXT — separate migration, after step 6 is clean
-- ---------------------------------------------------------------------
-- Deliberately not written as runnable SQL here. It is destructive and
-- must be a reviewed migration of its own, deployed only once the
-- application no longer reads aadhar_card_no anywhere:
--
--   ALTER TABLE users RENAME COLUMN aadhar_card_no TO aadhar_card_no_retired;
--
-- Rename first, deploy, and leave it renamed for one full release. Any
-- code path still reading the old name fails immediately and visibly
-- instead of silently returning NULL and writing a blank into a payslip.
-- Drop it in the release after that.


-- ---------------------------------------------------------------------
-- 8. S3 — containment, not migration
-- ---------------------------------------------------------------------
-- 37 of 38 objects have an Aadhaar-shaped first path segment; 14 are
-- confirmed to equal a real user's number. Object keys appear in S3 server
-- access logs, CloudTrail data events, CDN logs and every presigned URL
-- ever issued. Those copies are not reachable from here.
--
-- Objects are never renamed (standing rule), so remediation is forward-only:
--
--   a. New uploads key on aadhaar_secure_reference, never the number. This
--      is application code in the document service.
--   b. Deny s3:GetObject on the legacy prefix to everything except the
--      application role, via bucket policy.
--   c. Set the log retention on the bucket's access-log target to the
--      minimum your retention policy permits, and confirm what CloudTrail
--      data-event history already holds.
--   d. Presigned URL lifetime down to minutes.
--   e. Treat this as a disclosure incident under your DPDP Act obligations
--      and take that assessment to counsel. 2,417 logged disclosures is a
--      volume that a regulator will read as systemic rather than incidental.
--
-- (a) is the only part this repository can deliver. (b)-(e) are
-- infrastructure and legal, and are named here so they are not lost.


-- =====================================================================
-- ROLLBACK — of steps 2, 3 and 4 only
-- =====================================================================
-- Safe while step 7 has NOT run: aadhar_card_no is still the source of
-- truth, so nothing is lost by discarding the derived columns.
--
-- BEGIN;
-- ALTER TABLE users DROP CONSTRAINT IF EXISTS users_aadhaar_last_four_shape;
-- DROP INDEX IF EXISTS users_aadhaar_secure_reference_unique;
-- ALTER TABLE users
--   DROP COLUMN IF EXISTS encrypted_aadhaar_number,
--   DROP COLUMN IF EXISTS aadhaar_last_four,
--   DROP COLUMN IF EXISTS aadhaar_secure_reference;
-- COMMIT;
--
-- After step 7 this rollback DESTROYS THE ONLY COPY of the Aadhaar data.
-- Once the plaintext column is renamed or dropped, the ciphertext is the
-- record. Do not run it then. Restore from backup instead.
-- =====================================================================
