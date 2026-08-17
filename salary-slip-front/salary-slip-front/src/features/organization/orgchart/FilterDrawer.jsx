import Modal from "../../../components/ui/Modal";
import Button from "../../../components/ui/Button";

const inputClass =
  "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";
const labelClass = "mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400";

export default function FilterDrawer({ open, filters, companies, onChange, onClose, onClear }) {
  if (!open) return null;

  const set = (patch) => onChange({ ...filters, ...patch });
  const chips = [
    filters.companyIds?.length ? `${filters.companyIds.length} compan${filters.companyIds.length === 1 ? "y" : "ies"}` : null,
    filters.includeInactive ? "Including inactive" : null,
    filters.includeVacant === false ? "Excluding vacant" : null,
    filters.asOf ? `As of ${filters.asOf}` : null,
  ].filter(Boolean);

  return (
    <Modal isOpen onClose={onClose} title="Filters" size="sm">
      <div className="space-y-4">
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {chips.map((c) => (
              <span key={c} className="rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">{c}</span>
            ))}
          </div>
        )}

        <label className="block"><span className={labelClass}>Company</span>
          <select
            className={inputClass}
            multiple
            value={(filters.companyIds || []).map(String)}
            onChange={(e) => set({ companyIds: Array.from(e.target.selectedOptions).map((o) => o.value) })}
          >
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>

        <label className="block"><span className={labelClass}>As Of Date</span>
          <input type="date" className={inputClass} value={filters.asOf || ""} onChange={(e) => set({ asOf: e.target.value })} />
        </label>

        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
          <input type="checkbox" checked={filters.includeInactive || false} onChange={(e) => set({ includeInactive: e.target.checked })} />
          Include inactive units
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
          <input type="checkbox" checked={filters.includeVacant !== false} onChange={(e) => set({ includeVacant: e.target.checked })} />
          Include vacant positions
        </label>
      </div>
      <footer className="mt-4 flex justify-between gap-2">
        <Button variant="secondary" onClick={onClear}>Clear All</Button>
        <Button onClick={onClose}>Apply</Button>
      </footer>
    </Modal>
  );
}
