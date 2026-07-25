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

  const isSuperAdmin = user?.rawRole === 0 && user?.type !== 'agent';
  const isMaster = user?.rawRole === 1 && user?.type !== 'agent';

  useEffect(() => {
    if (!isSuperAdmin && !isMaster) {
      setAdminScopeKey(userCompanyId);
    }
  }, [isSuperAdmin, isMaster, userCompanyId]);

  useEffect(() => {
    if (isSuperAdmin || isMaster) {
      saveStoredScope(adminScopeKey);
    }
  }, [adminScopeKey, isSuperAdmin, isMaster]);

  const rawScope = resolveCompanyScope(adminScopeKey, userCompanyId);
  const scope = isSuperAdmin
    ? rawScope
    : isMaster
      ? { ...rawScope, companyId: userCompanyId, scopeKey: rawScope.unit ? `${userCompanyId}::${rawScope.unit}` : userCompanyId }
      : resolveCompanyScope(userCompanyId, userCompanyId);
  const companyId = scope.companyId;

  useEffect(() => {
    const theme = getCompanyConfig(companyId)?.theme ?? DEFAULT_THEME;
    document.documentElement.dataset.theme = theme;
  }, [companyId]);

  const companyIds = isSuperAdmin ? resolveCompanyIds(companyId) : [userCompanyId];
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
      companyOptions: isSuperAdmin ? ADMIN_COMPANY_OPTIONS : isMaster ? COMPANY_OPTIONS.filter(o => o.id === companyId) : [],
      uploadCompanyOptions: COMPANY_OPTIONS,
      canSwitchCompany: isSuperAdmin || isMaster,
      activeUnit,
      hasUnitFilter: Boolean(activeUnit),
      isAllCompanies,
      scopeKey,
      scopeLabel,
      setCompanyId: (nextCompanyId) => {
        if (!isSuperAdmin) return;
        setAdminScopeKey(resolveCompanyScope(nextCompanyId).scopeKey);
      },
      setCompanyScope: (nextScope) => {
        if (!isSuperAdmin && !isMaster) return;
        const resolved = resolveCompanyScope(nextScope, userCompanyId);
        if (isMaster && resolved.companyId !== userCompanyId) return;
        setAdminScopeKey(resolved.scopeKey);
      },
    }),
    [
      activeUnit,
      companyId,
      companyIds,
      companyScope,
      isAdmin,
      isSuperAdmin,
      isMaster,
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
