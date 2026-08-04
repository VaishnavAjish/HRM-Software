const AVATAR_COLORS = [
  "#4f46e5", "#0891b2", "#c026d3", "#ea580c",
  "#059669", "#7c3aed", "#db2777", "#0284c7",
];

export function avatarColor(name = "") {
  const sum = [...name].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}

export function initials(name = "") {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export function toneForPercent(pct) {
  if (pct >= 85) return "ok";
  if (pct >= 55) return "brand";
  return "warn";
}
