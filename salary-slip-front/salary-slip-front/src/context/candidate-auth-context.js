import { createContext, useContext } from "react";

export const CandidateAuthContext = createContext(null);

export function useCandidateAuth() {
  const context = useContext(CandidateAuthContext);
  if (!context) {
    throw new Error("useCandidateAuth must be used within a CandidateAuthProvider");
  }
  return context;
}
