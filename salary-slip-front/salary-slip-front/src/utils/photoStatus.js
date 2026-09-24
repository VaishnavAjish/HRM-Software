/**
 * Utility for tracking employee profile photo deletion, deletion reasons, and dummy photo flag status.
 */
import { getEmployeePhotoUrl } from "../pages/admin/AdminModals/employee-helpers";

const STORAGE_KEY = "hrms_dummy_photo_employees";
const REASONS_KEY = "hrms_photo_deletion_reasons";

function getStoredDummySet() {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch (e) {
    return new Set();
  }
}

function saveStoredDummySet(set) {
  try {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(set)));
    }
  } catch (e) {
    // Ignore storage errors
  }
}

function getStoredReasonsMap() {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(REASONS_KEY) : null;
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (e) {
    return {};
  }
}

function saveStoredReasonsMap(map) {
  try {
    if (typeof window !== "undefined") {
      localStorage.setItem(REASONS_KEY, JSON.stringify(map));
    }
  } catch (e) {
    // Ignore storage errors
  }
}

/**
 * Every localStorage-backed check below (deleted-set, reasons map) needs to key
 * off the same identifiers, whether it's handed the flat row or a wrapper like
 * `{ employee: {...} }` / `{ user: {...} }`. Kept in one place so the four
 * functions below can never drift into checking different key sets.
 */
function deriveDummyPhotoKeys(u) {
  if (!u) return [];
  if (typeof u === "string" || typeof u === "number") return [String(u)];
  const target = u.employee || u.user || u.profile || u;
  return [
    target.empCode,
    target.emp_code,
    target.id,
    target.email,
    u.empCode,
    u.emp_code,
    u.id,
    u.email,
  ].filter(Boolean).map(String);
}

/**
 * Storage-only half of clearPhotoDeletedFlag: drops the given keys from the
 * deleted-set/reasons-map without mutating any object fields. Used to
 * self-heal a stale flag from a read-only check (isPhotoDeletedOrDummy runs
 * during render, e.g. one row per grid cell — it must not mutate the record
 * it was just handed).
 */
function forgetDummyPhotoKeys(keys) {
  if (!keys.length) return;
  const set = getStoredDummySet();
  const map = getStoredReasonsMap();
  let changed = false;
  keys.forEach((key) => {
    if (set.delete(key)) changed = true;
    if (key in map) {
      delete map[key];
      changed = true;
    }
  });
  if (changed) {
    saveStoredDummySet(set);
    saveStoredReasonsMap(map);
  }
}

/**
 * Checks whether an employee record has a deleted/rejected or dummy profile photo.
 */
export function isPhotoDeletedOrDummy(u) {
  if (!u) return true;
  const target = u.employee || u.user || u.profile || u;
  const rawPhoto = target.photo || target.userPhoto || target.userAvatar || u.photo;

  // If no photo string or empty string
  if (!rawPhoto || String(rawPhoto).trim() === "") {
    return true;
  }

  const url = getEmployeePhotoUrl(rawPhoto);
  const hasResolvableUrl = Boolean(url && String(url).trim() !== "");
  const serverFlaggedDummy = Boolean(
    target.photo_deleted || target.photo_rejected || target.is_photo_dummy
  );

  // The record's own (server-fetched) flags are the freshest signal we have.
  // If the server says the photo is fine and it actually resolves to a real
  // URL, treat it as fixed — and self-heal any stale "dummy" flag left behind
  // in this browser's localStorage from an earlier deletion. Without this,
  // uploading a brand-new valid photo through any flow other than the
  // employee's own Profile-page save (the only caller of
  // clearPhotoDeletedFlag) left the record capped below 100% completion
  // forever in whichever browser had previously marked it dummy.
  if (hasResolvableUrl && !serverFlaggedDummy) {
    forgetDummyPhotoKeys(deriveDummyPhotoKeys(u));
    return false;
  }

  if (serverFlaggedDummy) {
    return true;
  }

  // No resolvable URL and no server flag either — fall back to this browser's
  // locally-remembered deletion state (e.g. an optimistic delete whose
  // follow-up save hasn't round-tripped through the server yet).
  const set = getStoredDummySet();
  const isInDeletedSet = deriveDummyPhotoKeys(u).some((key) => set.has(key));
  return isInDeletedSet;
}

/**
 * Retrieves the deletion/rejection reason for an employee profile photo.
 */
export function getPhotoDeletionReason(u) {
  if (!u) return "Dummy photo detected / Invalid profile picture";
  const target = u.employee || u.user || u.profile || u;

  const map = getStoredReasonsMap();
  const keys = deriveDummyPhotoKeys(u);

  for (const key of keys) {
    if (map[key]) return map[key];
  }

  if (target.photo_deletion_reason || target.photo_rejection_reason || target.rejection_reason) {
    return target.photo_deletion_reason || target.photo_rejection_reason || target.rejection_reason;
  }

  return "Dummy photo detected / Original photo required";
}

/**
 * Marks an employee's photo as deleted / dummy photo detected with a reason.
 */
export function markPhotoAsDeleted(u, reason) {
  if (!u) return;
  const set = getStoredDummySet();
  const map = getStoredReasonsMap();
  const keys = deriveDummyPhotoKeys(u);

  const cleanReason = (reason && String(reason).trim()) || "Dummy photo detected / Invalid profile picture";

  keys.forEach((key) => {
    set.add(key);
    map[key] = cleanReason;
  });

  saveStoredDummySet(set);
  saveStoredReasonsMap(map);

  const targets = [u, u?.employee, u?.user, u?.profile].filter(Boolean);
  targets.forEach((t) => {
    t.photo_rejected = true;
    t.photo_deleted = true;
    t.is_photo_dummy = true;
    t.photo_deletion_reason = cleanReason;
  });
}

/**
 * Clears the deleted/dummy photo flag when a valid original photo is uploaded.
 */
export function clearPhotoDeletedFlag(u) {
  if (!u) return;
  forgetDummyPhotoKeys(deriveDummyPhotoKeys(u));

  const targets = [u, u?.employee, u?.user, u?.profile].filter(Boolean);
  targets.forEach((t) => {
    t.photo_rejected = false;
    t.photo_deleted = false;
    t.is_photo_dummy = false;
    t.photo_deletion_reason = null;
    t.photo_rejection_reason = null;
  });
}
