import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";

export function useOnboardingResource(loader, deps = []) {
  const { user } = useAuth();
  const accessToken = user?.accessToken;
  const tokenType = user?.tokenType || "Bearer";

  const [nonce, setNonce] = useState(0);
  const key = `${accessToken || ""}|${tokenType}|${JSON.stringify(deps)}|${nonce}`;

  const [result, setResult] = useState({ key: null, data: null, source: null, error: null });

  useEffect(() => {
    let active = true;

    Promise.resolve(loader(accessToken, tokenType))
      .then((res) => {
        if (active) setResult({ key, data: res.data, source: res.source, error: null });
      })
      .catch((err) => {
        if (active) setResult({ key, data: null, source: null, error: err });
      });

    return () => {
      active = false;
    };
    // loader is redefined every render by design; `key` already encodes every
    // input that should trigger a refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return {
    data: result.key === key ? result.data : null,
    source: result.key === key ? result.source : null,
    error: result.key === key ? result.error : null,
    loading: result.key !== key,
    reload,
  };
}

export default useOnboardingResource;
