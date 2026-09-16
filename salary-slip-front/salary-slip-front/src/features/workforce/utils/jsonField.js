export function toJsonText(value) {
  return value ? JSON.stringify(value, null, 2) : "";
}

export function parseJsonText(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
