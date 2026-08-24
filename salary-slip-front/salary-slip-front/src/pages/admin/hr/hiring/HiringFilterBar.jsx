import { useState } from "react";
import { Search, Bookmark, X } from "lucide-react";
import DatePicker from "../../../../components/ui/DatePicker";

const inputClass =
  "rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2.5 py-1.5 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

/**
 * The one filter bar every Hiring tab shares. A tab opts into only the
 * controls relevant to it via `fields` (e.g. Candidates has no "Employment
 * Type"), so nothing is duplicated per-screen and nothing irrelevant shows.
 */
export default function HiringFilterBar({
  hr,
  fields = [],
  departments = [],
  people = [],
  requisitions = [],
  statusOptions = [],
  priorityOptions = [],
  employmentTypeOptions = [],
  bulkBar = null,
}) {
  const { filters, setFilter, clearAll, hasActiveFilters, savedViews, saveView, applyView, deleteView, selectedIds } = hr;
  const [viewName, setViewName] = useState("");
  const [savingView, setSavingView] = useState(false);

  const has = (f) => fields.includes(f);

  return (
    <div className="sticky top-0 z-20 -mx-4 md:-mx-6 px-4 md:px-6 py-2.5 bg-gray-50/95 dark:bg-[var(--sidebar-bg)]/95 backdrop-blur-sm border-b border-gray-200 dark:border-gray-700">
      <div className="flex flex-wrap items-center gap-2">
        {has("search") && (
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={filters.search}
              onChange={(e) => setFilter("search", e.target.value)}
              placeholder="Search…"
              className={`${inputClass} w-full pl-8`}
            />
          </div>
        )}

        {has("department") && (
          <select className={inputClass} value={filters.departmentId} onChange={(e) => setFilter("departmentId", e.target.value)}>
            <option value="">All Departments</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        )}

        {has("hiringManager") && (
          <select className={inputClass} value={filters.hiringManagerId} onChange={(e) => setFilter("hiringManagerId", e.target.value)}>
            <option value="">All Hiring Managers</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}

        {has("director") && (
          <select className={inputClass} value={filters.directorId} onChange={(e) => setFilter("directorId", e.target.value)}>
            <option value="">All Directors</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}

        {has("recruiter") && (
          <select className={inputClass} value={filters.recruiterId} onChange={(e) => setFilter("recruiterId", e.target.value)}>
            <option value="">All Recruiters</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}

        {has("requisition") && (
          <select className={inputClass} value={filters.requisitionId} onChange={(e) => setFilter("requisitionId", e.target.value)}>
            <option value="">All Requisitions</option>
            {requisitions.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
          </select>
        )}

        {has("employmentType") && (
          <select className={inputClass} value={filters.employmentType} onChange={(e) => setFilter("employmentType", e.target.value)}>
            <option value="">All Types</option>
            {employmentTypeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )}

        {has("status") && (
          <select className={inputClass} value={filters.status} onChange={(e) => setFilter("status", e.target.value)}>
            <option value="">All Statuses</option>
            {statusOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )}

        {has("priority") && (
          <select className={inputClass} value={filters.priority} onChange={(e) => setFilter("priority", e.target.value)}>
            <option value="">All Priorities</option>
            {priorityOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )}

        {has("date") && (
          <div className="flex items-center gap-1">
            <div className="w-36"><DatePicker value={filters.dateFrom} onChange={(v) => setFilter("dateFrom", v)} placeholder="From" /></div>
            <span className="text-gray-400 text-xs">to</span>
            <div className="w-36"><DatePicker value={filters.dateTo} onChange={(v) => setFilter("dateTo", v)} placeholder="To" /></div>
          </div>
        )}

        {has("sort") && (
          <select className={inputClass} value={filters.sort} onChange={(e) => setFilter("sort", e.target.value)}>
            <option value="">Sort: Newest</option>
            <option value="oldest">Sort: Oldest</option>
            <option value="name">Sort: Name A-Z</option>
          </select>
        )}

        {/* Saved views */}
        <div className="relative">
          <select
            className={inputClass}
            value=""
            onChange={(e) => e.target.value && applyView(e.target.value)}
          >
            <option value="">Saved Views…</option>
            {savedViews.map((v) => <option key={v.name} value={v.name}>{v.name}</option>)}
          </select>
        </div>

        {savingView ? (
          <div className="flex items-center gap-1">
            <input
              autoFocus
              value={viewName}
              onChange={(e) => setViewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && viewName.trim()) { saveView(viewName.trim()); setViewName(""); setSavingView(false); }
                if (e.key === "Escape") setSavingView(false);
              }}
              placeholder="View name…"
              className={`${inputClass} w-32`}
            />
            <button
              onClick={() => { if (viewName.trim()) { saveView(viewName.trim()); setViewName(""); } setSavingView(false); }}
              className="text-xs font-semibold text-brand-600 hover:underline"
            >
              Save
            </button>
          </div>
        ) : (
          <button
            onClick={() => setSavingView(true)}
            title="Save current filters as a view"
            className="flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-brand-600 dark:text-gray-400 px-1"
          >
            <Bookmark size={13} /> Save View
          </button>
        )}

        {savedViews.length > 0 && (
          <SavedViewsManage savedViews={savedViews} onDelete={deleteView} />
        )}

        {hasActiveFilters && (
          <button onClick={clearAll} className="text-xs font-semibold text-gray-500 hover:text-red-500 dark:text-gray-400">
            Clear Filters
          </button>
        )}
      </div>

      {selectedIds.length > 0 && bulkBar && (
        <div className="flex flex-wrap items-center gap-3 mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
          <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">{selectedIds.length} selected</span>
          {bulkBar}
        </div>
      )}
    </div>
  );
}

function SavedViewsManage({ savedViews, onDelete }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="text-xs text-gray-400 hover:text-gray-600">
        Manage
      </button>
      {open && (
        <div className="absolute z-30 mt-1 right-0 w-48 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-lg p-2 space-y-1">
          {savedViews.map((v) => (
            <div key={v.name} className="flex items-center justify-between text-xs px-1">
              <span className="text-gray-700 dark:text-gray-200 truncate">{v.name}</span>
              <button onClick={() => onDelete(v.name)} className="text-gray-400 hover:text-red-500">
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
