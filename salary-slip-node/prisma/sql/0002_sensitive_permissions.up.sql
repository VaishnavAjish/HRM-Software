-- =====================================================================
-- 0002 — Widen sensitive-permission detection
--
-- 0001 flagged is_sensitive from '%.reveal', '%.unmask' and '%.override'.
-- Against the canonical catalogue that is right; against the vocabulary
-- production actually uses it caught one permission out of four:
--
--   company.statutory.reveal                    matched
--   appointments.view_full_aadhaar              MISSED
--   workforce.replacements.view_sensitive       MISSED
--   workforce.view_cost                         MISSED
--
-- The flag is not cosmetic. The permission matrix uses it to require a
-- confirmation before a sensitive permission is granted to a role, so an
-- unflagged Aadhaar-reveal permission is one careless click from being
-- handed to a broad business role.
--
-- Idempotent. Reversible, though the down migration can only restore the
-- narrower 0001 rule, not a hand-edited flag.
-- =====================================================================

BEGIN;

UPDATE permissions
   SET is_sensitive = TRUE
 WHERE is_sensitive = FALSE
   AND (
        -- Canonical suffixes (kept from 0001).
        code LIKE '%.reveal'
     OR code LIKE '%.unmask'
     OR code LIKE '%.override'
        -- Legacy spellings for the same idea.
     OR code LIKE '%view_full%'
     OR code LIKE '%_sensitive'
     OR code LIKE '%.view_cost'
        -- Anything naming an identity document or bank detail.
     OR code LIKE '%aadhaar%'
     OR code LIKE '%aadhar%'
     OR code LIKE '%bank_account%'
        -- Security administration: granting these grants everything else.
     OR code LIKE 'security.%'
     OR code LIKE 'admin.authorization.%'
   );

COMMIT;
