import { useAuthorization } from "../../hooks/useAuthorization";

export default function Can({ permission, fallback = null, children }) {
  const { can } = useAuthorization();
  return can(permission) ? children : fallback;
}
