import { createContext, useContext, useEffect, useState } from "react";
import { candidateApi } from "../utils/api";

const CandidateAuthContext = createContext(null);

const TOKEN_KEY = "candidate_token";

export function CandidateAuthProvider({ children }) {
  const [candidate, setCandidate] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || null);
  const [initializing, setInitializing] = useState(() => Boolean(localStorage.getItem(TOKEN_KEY)));

  const saveToken = (newToken) => {
    setToken(newToken);
    if (newToken) {
      localStorage.setItem(TOKEN_KEY, newToken);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  };

  const logout = async () => {
    if (token) {
      candidateApi.logout(token).catch(() => {});
    }
    saveToken(null);
    setCandidate(null);
  };

  useEffect(() => {
    if (!token || candidate) {
      return;
    }
    let isMounted = true;
    candidateApi.me(token)
      .then((res) => {
        if (!isMounted) return;
        if (res.status) {
          setCandidate(res.candidate);
        } else {
          saveToken(null);
          setCandidate(null);
        }
      })
      .catch(() => {
        if (!isMounted) return;
        saveToken(null);
        setCandidate(null);
      })
      .finally(() => {
        if (isMounted) setInitializing(false);
      });

    return () => {
      isMounted = false;
    };
  }, [token, candidate]);

  const login = async (email, password) => {
    const res = await candidateApi.login({ email, password });
    if (res.status && res.token) {
      saveToken(res.token);
      setCandidate(res.candidate);
    }
    return res;
  };

  const register = async (payload) => {
    const res = await candidateApi.register(payload);
    if (res.status && res.token) {
      saveToken(res.token);
      setCandidate(res.candidate);
    }
    return res;
  };

  return (
    <CandidateAuthContext.Provider
      value={{
        candidate,
        token,
        isAuthenticated: !!candidate,
        initializing,
        login,
        register,
        logout,
        setCandidate,
      }}
    >
      {children}
    </CandidateAuthContext.Provider>
  );
}

export function useCandidateAuth() {
  const context = useContext(CandidateAuthContext);
  if (!context) {
    throw new Error("useCandidateAuth must be used within a CandidateAuthProvider");
  }
  return context;
}
