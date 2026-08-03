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
// Sentinel for "session restore hasn't resolved a user yet", distinct from
// the `null` that means "resolved, and there is no user" (logged out).
const UNRESOLVED_OWNER = "__unresolved__";
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
  const { user, initializing } = useAuth();
  const [adminScopeKey, setAdminScopeKey] = useState(loadStoredScope);

  const userCompanyId = resolveCompanyId(
    user?.companyId,
    user?.company_code,
    user?.company,
    DEFAULT_COMPANY_ID,
  );

  const isSuperAdmin = (user?.rawRole === 0 || (user?.role === 'admin' && user?.rawRole !== 1 && user?.rawRole !== 2)) && user?.role !== 'agent';
  const isMaster = user?.rawRole === 1 && user?.role !== 'agent';

  const canAdminManage = isSuperAdmin || isMaster;

  const [scopeOwnerId, setScopeOwnerId] = useState(UNRESOLVED_OWNER);

  if (!initializing) {
    const currentId = user?.id ?? null;
    if (scopeOwnerId === UNRESOLVED_OWNER) {
      setScopeOwnerId(currentId);
      if (user) {
        setAdminScopeKey(canAdminManage ? ALL_COMPANY_ID : userCompanyId);
      }
    } else if (scopeOwnerId !== currentId) {
      setScopeOwnerId(currentId);
      setAdminScopeKey(!user ? DEFAULT_COMPANY_ID : canAdminManage ? ALL_COMPANY_ID : userCompanyId);
    }
  }

  useEffect(() => {
    if (canAdminManage) {
      saveStoredScope(adminScopeKey);
    }
  }, [adminScopeKey, canAdminManage]);

  const rawScope = resolveCompanyScope(adminScopeKey, userCompanyId);
  const scope = canAdminManage ? rawScope : resolveCompanyScope(userCompanyId, userCompanyId);
  const companyId = scope.companyId;

  useEffect(() => {
    const theme = canAdminManage
      ? DEFAULT_THEME
      : getCompanyConfig(companyId)?.theme ?? DEFAULT_THEME;
    document.documentElement.dataset.theme = theme;
  }, [companyId, canAdminManage, userCompanyId]);

  const companyIds = useMemo(
    () => canAdminManage ? resolveCompanyIds(companyId) : [userCompanyId],
    [canAdminManage, companyId, userCompanyId],
  );
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
      companyOptions: canAdminManage ? ADMIN_COMPANY_OPTIONS : [],
      uploadCompanyOptions: COMPANY_OPTIONS,
      canSwitchCompany: canAdminManage,
      activeUnit,
      hasUnitFilter: Boolean(activeUnit),
      isAllCompanies,
      scopeKey,
      scopeLabel,
      setCompanyId: (nextCompanyId) => {
        if (!canAdminManage) return;
        setAdminScopeKey(resolveCompanyScope(nextCompanyId).scopeKey);
      },
      setCompanyScope: (nextScope) => {
        if (!canAdminManage) return;
        const resolved = resolveCompanyScope(nextScope, userCompanyId);
        setAdminScopeKey(resolved.scopeKey);
      },
    }),
    [
      activeUnit,
      companyId,
      companyIds,
      companyScope,
      canAdminManage,
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
