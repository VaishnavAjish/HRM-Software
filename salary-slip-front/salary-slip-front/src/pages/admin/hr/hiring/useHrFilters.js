import { useEffect, useState } from "react";

const DEFAULT_FILTERS = {
  search: "",
  departmentId: "",
  hiringManagerId: "",
  directorId: "",
  recruiterId: "",
  requisitionId: "",
  employmentType: "",
  status: "",
  priority: "",
  dateFrom: "",
  dateTo: "",
  sort: "",
};

/**
 * One filter state shared by every Hiring tab, so switching tabs doesn't
 * wipe out what someone just searched for, and so there is exactly one
 * filter bar implementation instead of one per tab. `namespace` scopes
 * "Saved Views" to localStorage per tab (a requisition view and a candidate
 * view have nothing in common).
 */
export default function useHrFilters(namespace) {
  const [filters, setFiltersState] = useState(DEFAULT_FILTERS);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(filters.search), 400);
    return () => clearTimeout(t);
  }, [filters.search]);

  const setFilter = (key, value) => setFiltersState((f) => ({ ...f, [key]: value }));
  const clearAll = () => setFiltersState(DEFAULT_FILTERS);
  const hasActiveFilters = Object.values(filters).some(Boolean);

  const toggleSelected = (id) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const setAllSelected = (ids) => setSelectedIds(ids);
  const clearSelected = () => setSelectedIds([]);

  const savedViewsKey = `hr_saved_views_${namespace}`;
  const [savedViews, setSavedViews] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(savedViewsKey)) || [];
    } catch {
      return [];
    }
  });

  const persistViews = (next) => {
    setSavedViews(next);
    try {
      localStorage.setItem(savedViewsKey, JSON.stringify(next));
    } catch {
      // Storage can be unavailable (private mode, quota) — saved views just
      // won't persist across reloads; the current session still works.
    }
  };

  const saveView = (name) => {
    if (!name?.trim()) return;
    persistViews([...savedViews.filter((v) => v.name !== name), { name, filters }]);
  };
  const applyView = (name) => {
    const view = savedViews.find((v) => v.name === name);
    if (view) setFiltersState({ ...DEFAULT_FILTERS, ...view.filters });
  };
  const deleteView = (name) => persistViews(savedViews.filter((v) => v.name !== name));

  return {
    filters,
    debouncedSearch,
    setFilter,
    clearAll,
    hasActiveFilters,
    selectedIds,
    toggleSelected,
    setAllSelected,
    clearSelected,
    savedViews,
    saveView,
    applyView,
    deleteView,
  };
}
