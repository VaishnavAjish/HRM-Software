export const CARD_BASE =
  "rounded-xl border bg-white dark:bg-gray-800 shadow-sm px-3.5 py-3 text-left transition-shadow hover:shadow-md";

export function statusDotClass(isActive) {
  if (isActive === false) return "bg-gray-400";
  if (isActive === undefined) return "bg-gray-300";
  return "bg-green-500";
}

export function initials(name) {
  if (!name) return "?";
  const parts = String(name).trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}
