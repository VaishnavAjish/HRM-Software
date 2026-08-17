export const PROFILE_FIELDS = ["name", "phone", "current_company", "current_designation", "experience_years", "skills"];

export function profileCompletion(candidate) {
  if (!candidate) return 0;
  const filled = PROFILE_FIELDS.filter((field) => {
    const value = candidate[field];
    if (Array.isArray(value)) return value.length > 0;
    return value !== null && value !== undefined && String(value).trim() !== "";
  }).length;
  return Math.round((filled / PROFILE_FIELDS.length) * 100);
}
