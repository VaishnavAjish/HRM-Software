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
 * Checks whether an employee record has a deleted/rejected or dummy profile photo.
 */
export function isPhotoDeletedOrDummy(u) {
  if (!u) return true;
  const target = u.employee || u.user || u.profile || u;
  const rawPhoto = target.photo || target.userPhoto || target.userAvatar || u.photo;

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

  const isInDeletedSet = keys.some((key) => set.has(key));

  // If no photo string or empty string
  if (!rawPhoto || String(rawPhoto).trim() === "") {
    return true;
  }

  // If in localStorage deleted set -> deleted / dummy photo
  if (isInDeletedSet) {
    return true;
  }

  // If explicit photo_deleted / photo_rejected is set on target object AND in deleted set
  if ((target.photo_deleted || target.photo_rejected || target.is_photo_dummy) && isInDeletedSet) {
    return true;
  }

  // If not in deleted set and valid photo URL exists, it is NOT deleted (e.g. newly uploaded)
  const url = getEmployeePhotoUrl(rawPhoto);
  if (url && String(url).trim() !== "") {
    return false;
  }

  if (target.photo_deleted || target.photo_rejected || target.is_photo_dummy) {
    return true;
  }

  return false;
}

/**
 * Retrieves the deletion/rejection reason for an employee profile photo.
 */
export function getPhotoDeletionReason(u) {
  if (!u) return "Dummy photo detected / Invalid profile picture";
  const target = u.employee || u.user || u.profile || u;

  const map = getStoredReasonsMap();
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
  const keys = [
    u?.empCode,
    u?.emp_code,
    u?.id,
    u?.email,
    typeof u === "string" || typeof u === "number" ? u : null
  ].filter(Boolean).map(String);

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
  const set = getStoredDummySet();
  const map = getStoredReasonsMap();
  const keys = [
    u?.empCode,
    u?.emp_code,
    u?.id,
    u?.email,
    typeof u === "string" || typeof u === "number" ? u : null
  ].filter(Boolean).map(String);

  keys.forEach((key) => {
    set.delete(key);
    delete map[key];
  });

  saveStoredDummySet(set);
  saveStoredReasonsMap(map);

  const targets = [u, u?.employee, u?.user, u?.profile].filter(Boolean);
  targets.forEach((t) => {
    t.photo_rejected = false;
    t.photo_deleted = false;
    t.is_photo_dummy = false;
    t.photo_deletion_reason = null;
    t.photo_rejection_reason = null;
  });
}
