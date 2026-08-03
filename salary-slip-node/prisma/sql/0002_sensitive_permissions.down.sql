-- =====================================================================
-- 0002 DOWN — restore the narrower 0001 sensitivity rule
--
-- Clears every is_sensitive flag and reapplies only the three suffixes
-- 0001 used. Any flag set by hand after 0002 ran is lost, which is why
-- this is a rollback rather than a routine toggle: the flag is intended
-- to be derived, not curated.
-- =====================================================================

BEGIN;

UPDATE permissions SET is_sensitive = FALSE;

UPDATE permissions
   SET is_sensitive = TRUE
 WHERE code LIKE '%.reveal'
    OR code LIKE '%.unmask'
    OR code LIKE '%.override';

COMMIT;
