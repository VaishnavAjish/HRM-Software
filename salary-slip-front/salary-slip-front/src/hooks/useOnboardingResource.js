import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";

export function useOnboardingResource(loader, deps = []) {
  const { user } = useAuth();
  const accessToken = user?.accessToken;
  const tokenType = user?.tokenType || "Bearer";

  const [state, setState] = useState({ data: null, source: null, loading: true, error: null });

  const run = useCallback(() => {
    let active = true;
    setState((s) => ({ ...s, loading: true, error: null }));

    Promise.resolve(loader(accessToken, tokenType))
      .then((res) => {
        if (active) setState({ data: res.data, source: res.source, loading: false, error: null });
      })
      .catch((err) => {
        if (active) setState({ data: null, source: null, loading: false, error: err });
      });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, tokenType, ...deps]);

  useEffect(() => run(), [run]);

  return { ...state, reload: run };
}

export default useOnboardingResource;
