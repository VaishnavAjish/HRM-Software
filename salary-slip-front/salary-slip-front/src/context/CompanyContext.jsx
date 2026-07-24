/* global __APP_COLOR__ */
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  ADMIN_COMPANY_OPTIONS,
  DEFAULT_COMPANY_ID,
  getCompanyConfig,
  getCompanyScopeLabel,
  resolveCompanyId,
  resolveCompanyIds,
  resolveCompanyScope,
  ALL_COMPANY_ID,
  COMPANY_OPTIONS,
} from "../config/companyConfig";
import { useAuth } from "./AuthContext";

const CompanyContext = createContext(null);
const STORAGE_KEY = "active_company_scope";
const DEFAULT_THEME =
  typeof __APP_COLOR__ !== "undefined" ? __APP_COLOR__ : "indigo";

function loadStoredScope() {
  try {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_COMPANY_ID;
  } catch {
    return DEFAULT_COMPANY_ID;
  }
}

function saveStoredScope(scopeKey) {
  try {
    localStorage.setItem(STORAGE_KEY, scopeKey);
  } catch {
    // Ignore storage failures so the app can keep working.
  }
}

export function CompanyProvider({ children }) {
  const { user } = useAuth();
  const [adminScopeKey, setAdminScopeKey] = useState(loadStoredScope);

  const isAdmin = user?.role === "admin";
  const userCompanyId = resolveCompanyId(
    user?.companyId,
    user?.company_code,
    user?.company,
    DEFAULT_COMPANY_ID,
  );

  useEffect(() => {
    if (!isAdmin) {
      setAdminScopeKey(userCompanyId);
    }
  }, [isAdmin, userCompanyId]);

  useEffect(() => {
    if (isAdmin) {
      saveStoredScope(adminScopeKey);
    }
  }, [adminScopeKey, isAdmin]);

  const scope = isAdmin
    ? resolveCompanyScope(adminScopeKey, userCompanyId)
    : resolveCompanyScope(userCompanyId, userCompanyId);
  const companyId = scope.companyId;

  useEffect(() => {
    const theme = getCompanyConfig(companyId)?.theme ?? DEFAULT_THEME;
    document.documentElement.dataset.theme = theme;
  }, [companyId]);

  const companyIds = isAdmin ? resolveCompanyIds(companyId) : [userCompanyId];
  const activeUnit = scope.unit;
  const scopeKey = scope.scopeKey;
  const isAllCompanies = companyId === ALL_COMPANY_ID;
  const companyScope = useMemo(
    () => ({ companyId, unit: activeUnit }),
    [companyId, activeUnit],
  );
  const scopeLabel = getCompanyScopeLabel(companyScope);

  const value = useMemo(
    () => ({
      companyId,
      companyIds,
      companyScope,
      company: getCompanyConfig(companyId),
      companyOptions: isAdmin ? ADMIN_COMPANY_OPTIONS : COMPANY_OPTIONS,
      uploadCompanyOptions: COMPANY_OPTIONS,
      canSwitchCompany: isAdmin,
      activeUnit,
      hasUnitFilter: Boolean(activeUnit),
      isAllCompanies,
      scopeKey,
      scopeLabel,
      setCompanyId: (nextCompanyId) => {
        if (!isAdmin) return;
        setAdminScopeKey(resolveCompanyScope(nextCompanyId).scopeKey);
      },
      setCompanyScope: (nextScope) => {
        if (!isAdmin) return;
        setAdminScopeKey(resolveCompanyScope(nextScope, userCompanyId).scopeKey);
      },
    }),
    [
      activeUnit,
      companyId,
      companyIds,
      companyScope,
      isAdmin,
      isAllCompanies,
      scopeKey,
      scopeLabel,
      userCompanyId,
    ],
  );

  return (
    <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useCompany = () => useContext(CompanyContext);
