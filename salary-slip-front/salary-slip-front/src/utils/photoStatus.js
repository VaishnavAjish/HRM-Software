/**
 * Utility for tracking employee profile photo deletion and dummy photo flag status.
 */

const STORAGE_KEY = "hrms_dummy_photo_employees";

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

/**
 * Checks whether an employee record has a deleted/rejected or dummy profile photo.
 */
export function isPhotoDeletedOrDummy(u) {
  if (!u) return false;
  const target = u.employee || u.user || u.profile || u;

  if (target.photo_rejected || target.photo_deleted || target.is_photo_dummy) {
    return true;
  }

  const set = getStoredDummySet();
  const keys = [
    target.empCode,
    target.emp_code,
    target.id,
    target.email,
    u.empCode,
    u.emp_code,
    u.id,
    u.email
  ].filter(Boolean).map(String);

  return keys.some((key) => set.has(key));
}

/**
 * Marks an employee's photo as deleted / dummy photo detected.
 */
export function markPhotoAsDeleted(u) {
  if (!u) return;
  const set = getStoredDummySet();
  const keys = [
    u?.empCode,
    u?.emp_code,
    u?.id,
    u?.email,
    typeof u === "string" || typeof u === "number" ? u : null
  ].filter(Boolean).map(String);

  keys.forEach((key) => set.add(key));
  saveStoredDummySet(set);
}

/**
 * Clears the deleted/dummy photo flag when a valid original photo is uploaded.
 */
export function clearPhotoDeletedFlag(u) {
  if (!u) return;
  const set = getStoredDummySet();
  const keys = [
    u?.empCode,
    u?.emp_code,
    u?.id,
    u?.email,
    typeof u === "string" || typeof u === "number" ? u : null
  ].filter(Boolean).map(String);

  keys.forEach((key) => set.delete(key));
  saveStoredDummySet(set);
}
