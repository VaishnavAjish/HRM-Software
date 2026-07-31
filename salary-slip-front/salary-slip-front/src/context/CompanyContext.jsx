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

  const isSuperAdmin = (user?.rawRole === 0 || (user?.role === 'admin' && user?.rawRole !== 1 && user?.rawRole !== 2)) && user?.role !== 'agent';
  const isMaster = user?.rawRole === 1 && user?.role !== 'agent';

  /*
   * The stored scope belongs to whoever chose it.
   *
   * adminScopeKey is seeded once from localStorage and, for a Super Admin or a
   * Master, is never re-derived — the effect below only forces it for the other
   * roles. So a Super Admin who selected "Silver Star / Daduk", signed out and
   * handed the machine over left the next Super Admin scoped to that branch,
   * with every list silently filtered by it. Resetting on a change of identity
   * is what stops one person's selection becoming another person's view.
   *
   * Assigning during render is the supported way to reset on a prop change;
   * doing it in an effect renders the previous user's scope first.
   */
  const [scopeOwnerId, setScopeOwnerId] = useState(user?.id ?? null);

  if (scopeOwnerId !== (user?.id ?? null)) {
    setScopeOwnerId(user?.id ?? null);
    setAdminScopeKey(user ? userCompanyId : DEFAULT_COMPANY_ID);
  }

  useEffect(() => {
    if (!isSuperAdmin && !isMaster) {
      setAdminScopeKey(prev => (prev !== userCompanyId ? userCompanyId : prev));
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
    // A Super Admin actively switches company scope via the dropdown, so
    // re-theming the whole app to match whichever company is selected reads
    // as a jarring color flip, not a helpful cue — keep the app's own fixed
    // theme for them. A Master is permanently tied to one company (no
    // switcher), so their branded per-company theme stays as before.
    const theme = isSuperAdmin
      ? DEFAULT_THEME
      : getCompanyConfig(companyId)?.theme ?? DEFAULT_THEME;
    document.documentElement.dataset.theme = theme;
  }, [companyId, isSuperAdmin]);

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
