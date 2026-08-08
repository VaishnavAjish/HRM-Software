// Mirrors the web app's getUserRole() branching (AuthContext.jsx) so the
// mobile client routes the same account into the same portal.
export function resolveRole(user) {
  if (!user) return 'employee';

  if (user.type === 'agent' || Number(user.role) === 4) return 'agent';

  const role = user.role;
  if (role === 'admin' || Number(role) === 0 || Number(role) === 1 || Number(role) === 2) {
    return 'admin';
  }

  return 'employee';
}

export function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
