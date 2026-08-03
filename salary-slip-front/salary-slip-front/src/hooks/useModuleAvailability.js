import { useEffect, useState } from "react";
import { modulesApi } from "../utils/api";
import { useAuth } from "../context/AuthContext";

/**
 * Which optional modules the backend can actually serve.
 *
 * Availability is a property of the deployment, not of the session, so this is
 * cached outside React: remounting the sidebar must not re-ask.
 *
 * Unknown reads as available. Hiding a module that works is the worse failure —
 * the user loses a feature with no way to tell why — and the API is gated too,
 * so the cost of guessing wrong in this direction is a clean 503 rather than a
 * broken page. A backend too old to know about /modules therefore behaves
 * exactly as it did before.
 */
let cache = null;
let inFlight = null;

function loadModules(accessToken, tokenType) {
  if (cache) return Promise.resolve(cache);
  if (inFlight) return inFlight;

  inFlight = modulesApi
    .get(accessToken, tokenType)
    .then((res) => {
      cache = res?.data?.data?.modules || {};
      return cache;
    })
    .catch(() => ({}))
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

export function useModuleAvailability() {
  const { user } = useAuth();
  const [modules, setModules] = useState(cache || {});
  const accessToken = user?.accessToken;
  const tokenType = user?.tokenType || "Bearer";

  useEffect(() => {
    if (cache || !accessToken) return undefined;

    let active = true;
    loadModules(accessToken, tokenType).then((next) => {
      if (active) setModules(next);
    });

    return () => {
      active = false;
    };
  }, [accessToken, tokenType]);

  // Absent from the map means the backend did not report on it, which is the
  // unknown case, not a denial.
  const isAvailable = (name) => modules[name] !== false;

  return { modules, isAvailable };
}
