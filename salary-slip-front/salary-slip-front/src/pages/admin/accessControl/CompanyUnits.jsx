import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  Building2, Plus, RefreshCw, Search, Loader2, Pencil, Trash2,
  Power, PowerOff, Link2, AlertTriangle,
} from "lucide-react";
import Badge from "../../../components/ui/Badge";
import Button from "../../../components/ui/Button";
import Card from "../../../components/ui/Card";
import Modal from "../../../components/ui/Modal";
import { SkeletonTable } from "../../../components/ui/Skeleton";
import { useAuth } from "../../../context/AuthContext";
import { useAuthorization } from "../../../hooks/useAuthorization";
import { companyUnitApi } from "../../../utils/api";

const inputClass =
  "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";
const labelClass = "mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400";

const STATUS_FILTERS = [
  { value: "ALL", label: "All" },
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
];

/*
 * A company code is a slug because users.company_code is a comma-separated list
 * that every scope check splits on. A code containing a comma would parse as two
 * companies and scope an account to something nobody created, so the field
 * derives the slug as you type rather than letting one be entered by hand and
 * rejected afterwards.
 */
function slugify(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

function Th({ children, className = "" }) {
  return (
    <th scope="col" className={`px-4 py-3 whitespace-nowrap ${className}`}>{children}</th>
  );
}

/**
 * The number of people attached, and by which mechanism.
 *
 * Two counts, not one. `assignedUsers` comes from the normalised pivot;
 * `legacyUsers` comes from the free-text column that authorization still reads.
 * While the unit backfill is outstanding those numbers disagree — a unit can
 * show 0 assigned and 333 legacy — and collapsing them into one figure would
 * either hide the migration or overstate it.
 */
function UsageCell({ assigned, legacy }) {
  if (!assigned && !legacy) return <span className="text-gray-400">0</span>;

  return (
    <span className="whitespace-nowrap">
      {assigned}
      {legacy > 0 && (
        <span
          className="ml-1.5 text-xs text-amber-600 dark:text-amber-400"
          title="Users matched by the legacy text column, not yet linked to this record"
        >
          +{legacy} legacy
        </span>
      )}
    </span>
  );
}

function CompanyModal({ company, busy, onSave, onClose }) {
  const isEdit = Boolean(company);
  const [name, setName] = useState(company?.name ?? "");
  const [code, setCode] = useState(company?.code ?? "");
  const [codeTouched, setCodeTouched] = useState(isEdit);

  const locked = Boolean(company?.codeLocked);

  const changeName = (value) => {
    setName(value);
    if (!codeTouched && !isEdit) setCode(slugify(value));
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={isEdit ? `Edit ${company.name}` : "Add company"}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            disabled={busy || !name.trim() || !code.trim()}
            onClick={() => onSave({ name: name.trim(), code: code.trim() })}
          >
            {busy && <Loader2 size={16} className="animate-spin" />}
            Save
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className={labelClass}>Company name *</span>
          <input className={inputClass} value={name} onChange={(e) => changeName(e.target.value)} />
        </label>

        <label className="block">
          <span className={labelClass}>Company code *</span>
          <input
            className={inputClass}
            value={code}
            disabled={locked}
            onChange={(e) => { setCodeTouched(true); setCode(slugify(e.target.value)); }}
          />
          {locked ? (
            <span className="mt-1 flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
              The code is locked because users or units already depend on it. It is the tenant
              key every access check reads, so changing it would rescope those accounts.
            </span>
          ) : (
            <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
              Lowercase letters, numbers and hyphens. This becomes the tenant key.
            </span>
          )}
        </label>
      </div>
    </Modal>
  );
}

function UnitModal({ unit, companies, busy, onSave, onClose }) {
  const isEdit = Boolean(unit);
  const [name, setName] = useState(unit?.name ?? "");
  const [companyId, setCompanyId] = useState(unit?.companyId ?? "");

  const locked = Boolean(unit?.companyLocked);
  const selectable = companies.filter((company) => company.isActive || company.id === unit?.companyId);

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={isEdit ? `Edit ${unit.name}` : "Add unit"}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            disabled={busy || !name.trim() || !companyId}
            onClick={() => onSave({ name: name.trim(), companyId: Number(companyId) })}
          >
            {busy && <Loader2 size={16} className="animate-spin" />}
            Save
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className={labelClass}>Company *</span>
          <select
            className={inputClass}
            value={companyId}
            disabled={locked}
            onChange={(e) => setCompanyId(e.target.value)}
          >
            <option value="">Select company</option>
            {selectable.map((company) => (
              <option key={company.id} value={company.id}>{company.name}</option>
            ))}
          </select>
          {locked && (
            <span className="mt-1 flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
              This unit cannot be moved while users are assigned to it — that would move them
              between companies without anyone saying so. Reassign them first.
            </span>
          )}
        </label>

        <label className="block">
          <span className={labelClass}>Unit name *</span>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
          <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
            Unique within the company. Two companies may each have a unit of the same name.
          </span>
        </label>
      </div>
    </Modal>
  );
}

/**
 * Legacy unit names nothing accounts for yet.
 *
 * `users.unit` was free text long before units were records, and which company
 * owns each name is not derivable: "Shreeji" appears under both companies, and
 * the row counts are evidence of nothing. So the names are listed with their
 * headcount and an administrator says which company owns each. Adopting one
 * creates the record and links the matching users — it never edits the legacy
 * string, because that string is what the scope queries read.
 */
function LegacyUnitsPanel({ rows, companies, busy, onAdopt }) {
  const [choices, setChoices] = useState({});

  if (!rows.length) return null;

  return (
    <Card className="border-amber-200 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-900/10">
      <div className="mb-3 flex items-start gap-2">
        <Link2 size={16} className="mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Unmapped legacy units
          </h3>
          <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
            These unit names exist on user records but have no unit entry. Choose the company that
            owns each one — the counts are not evidence of ownership, and a wrong choice rescopes
            real employees.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {rows.map((row) => {
          const key = `${row.companyCode}|${row.name}`;

          return (
            <div
              key={key}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-white px-3 py-2 dark:border-amber-800/60 dark:bg-gray-800"
            >
              <span className="font-medium text-gray-900 dark:text-white">{row.name}</span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {row.users} user{row.users === 1 ? "" : "s"} · currently scoped to{" "}
                <code className="font-mono">{row.companyCode}</code>
              </span>

              <select
                aria-label={`Company for ${row.name}`}
                className="ml-auto w-48 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                value={choices[key] ?? ""}
                onChange={(e) => setChoices((current) => ({ ...current, [key]: e.target.value }))}
              >
                <option value="">Select company</option>
                {companies.filter((company) => company.isActive).map((company) => (
                  <option key={company.id} value={company.id}>{company.name}</option>
                ))}
              </select>

              <Button
                size="sm"
                disabled={busy || !choices[key]}
                onClick={() => onAdopt(row.name, Number(choices[key]))}
              >
                Adopt
              </Button>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export default function CompanyUnits() {
  const { user } = useAuth();
  const { can } = useAuthorization();
  const token = user?.accessToken;
  const tokenType = user?.tokenType || "Bearer";

  const [tab, setTab] = useState("companies");
  const [companies, setCompanies] = useState([]);
  const [units, setUnits] = useState([]);
  const [legacy, setLegacy] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [companyFilter, setCompanyFilter] = useState("");

  const [companyDialog, setCompanyDialog] = useState(null);
  const [unitDialog, setUnitDialog] = useState(null);

  const reload = useCallback(() => {
    setLoading(true);
    setRefreshKey((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!token) return undefined;

    let active = true;

    Promise.all([
      companyUnitApi.companies({ search, status }, token, tokenType),
      companyUnitApi.units(
        { search, status, companyIds: companyFilter ? [companyFilter] : [] },
        token, tokenType,
      ),
      companyUnitApi.legacyUnits(token, tokenType).catch(() => ({ data: [] })),
    ])
      .then(([companyRes, unitRes, legacyRes]) => {
        if (!active) return;
        setCompanies(companyRes?.data ?? []);
        setUnits(unitRes?.data ?? []);
        setLegacy(legacyRes?.data ?? []);
      })
      .catch((err) => { if (active) toast.error(err.message || "Could not load companies and units"); })
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, [token, tokenType, search, status, companyFilter, refreshKey]);

  // Filters are applied server-side, so the list re-fetches rather than
  // filtering a stale page in the browser.
  const changeFilter = (setter) => (value) => {
    setLoading(true);
    setter(value);
  };

  const run = async (work, message) => {
    setBusy(true);
    try {
      await work();
      toast.success(message);
      setCompanyDialog(null);
      setUnitDialog(null);
      reload();
    } catch (err) {
      toast.error(err.message || "That did not work");
    } finally {
      setBusy(false);
    }
  };

  const saveCompany = (payload) => run(
    () => (companyDialog?.id
      ? companyUnitApi.updateCompany(companyDialog.id, payload, token, tokenType)
      : companyUnitApi.createCompany(payload, token, tokenType)),
    companyDialog?.id ? "Company updated" : "Company created",
  );

  const saveUnit = (payload) => run(
    () => (unitDialog?.id
      ? companyUnitApi.updateUnit(unitDialog.id, payload, token, tokenType)
      : companyUnitApi.createUnit(payload, token, tokenType)),
    unitDialog?.id ? "Unit updated" : "Unit created",
  );

  const companyOptions = useMemo(
    () => companies.map((company) => ({ id: company.id, name: company.name, isActive: company.isActive })),
    [companies],
  );

  const canManageCompanies = can("admin.company.create") || can("admin.company.update");
  const canManageUnits = can("admin.unit.create") || can("admin.unit.update");

  return (
    <div className="min-w-0 max-w-full space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-white">
          <Building2 size={20} /> Company &amp; Unit Management
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Manage companies and the units that belong to them. These records are the source every
          company and unit selector in the product reads from.
        </p>
      </div>

      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {[["companies", "Companies"], ["units", "Units"]].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold transition-colors ${
              tab === key
                ? "border-brand-600 text-brand-600 dark:text-brand-400"
                : "border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              aria-label={tab === "companies" ? "Search companies" : "Search units"}
              className={`${inputClass} w-64 pl-8`}
              placeholder={tab === "companies" ? "Search name or code…" : "Search unit…"}
              value={search}
              onChange={(e) => changeFilter(setSearch)(e.target.value)}
            />
          </div>

          {tab === "units" && (
            <select
              aria-label="Filter by company"
              className={`${inputClass} w-48`}
              value={companyFilter}
              onChange={(e) => changeFilter(setCompanyFilter)(e.target.value)}
            >
              <option value="">All companies</option>
              {companyOptions.map((company) => (
                <option key={company.id} value={company.id}>{company.name}</option>
              ))}
            </select>
          )}

          <select
            aria-label="Filter by status"
            className={`${inputClass} w-36`}
            value={status}
            onChange={(e) => changeFilter(setStatus)(e.target.value)}
          >
            {STATUS_FILTERS.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>

          <div className="ml-auto flex items-center gap-2">
            <Button variant="secondary" onClick={reload}><RefreshCw size={16} /> Refresh</Button>

            {tab === "companies" && can("admin.company.create") && (
              <Button onClick={() => setCompanyDialog({})}><Plus size={16} /> Add Company</Button>
            )}
            {tab === "units" && can("admin.unit.create") && (
              <Button onClick={() => setUnitDialog({})}><Plus size={16} /> Add Unit</Button>
            )}
          </div>
        </div>
      </Card>

      {tab === "units" && can("admin.unit.create") && (
        <LegacyUnitsPanel
          rows={legacy}
          companies={companyOptions}
          busy={busy}
          onAdopt={(name, companyId) => run(
            () => companyUnitApi.adoptLegacyUnit({ name, companyId }, token, tokenType),
            "Legacy unit adopted",
          )}
        />
      )}

      <Card padding={false}>
        {loading && <div className="p-4"><SkeletonTable rows={5} /></div>}

        {!loading && tab === "companies" && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs font-bold uppercase tracking-wider text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                <tr>
                  <Th>Company</Th>
                  <Th>Code</Th>
                  <Th>Units</Th>
                  <Th>Users</Th>
                  <Th>Status</Th>
                  <Th>Created</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                {companies.length === 0 && (
                  <tr><td colSpan={7} className="p-10 text-center text-gray-500 dark:text-gray-400">
                    No companies match these filters.
                  </td></tr>
                )}

                {companies.map((company) => (
                  <tr key={company.id} className="hover:bg-gray-50/70 dark:hover:bg-gray-700/40">
                    <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">{company.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600 dark:text-gray-300">{company.code}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{company.units}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                      <UsageCell assigned={company.assignedUsers} legacy={company.legacyUsers} />
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={company.isActive ? "green" : "yellow"}>
                        {company.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">{formatDate(company.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        {can("admin.company.update") && (
                          <Button size="sm" variant="ghost" aria-label={`Edit ${company.name}`}
                            onClick={() => setCompanyDialog(company)}>
                            <Pencil size={14} />
                          </Button>
                        )}
                        {can("admin.company.status") && (
                          <Button
                            size="sm" variant="ghost"
                            aria-label={`${company.isActive ? "Deactivate" : "Activate"} ${company.name}`}
                            onClick={() => run(
                              () => companyUnitApi.setCompanyStatus(company.id, !company.isActive, token, tokenType),
                              company.isActive ? "Company deactivated" : "Company activated",
                            )}
                          >
                            {company.isActive ? <PowerOff size={14} /> : <Power size={14} />}
                          </Button>
                        )}
                        {can("admin.company.delete") && (
                          <Button
                            size="sm" variant="ghost"
                            aria-label={`Delete ${company.name}`}
                            /*
                             * Disabled, not hidden. A control that vanishes reads
                             * as a missing feature; one that is present and
                             * explains itself tells the administrator what to do
                             * about it. The API refuses independently either way.
                             */
                            disabled={company.units > 0 || company.assignedUsers > 0 || company.legacyUsers > 0}
                            title={company.units > 0 || company.assignedUsers > 0 || company.legacyUsers > 0
                              ? "Cannot delete this company because users or units are assigned to it. Reassign or deactivate them first."
                              : "Delete company"}
                            onClick={() => run(
                              () => companyUnitApi.deleteCompany(company.id, token, tokenType),
                              "Company deleted",
                            )}
                          >
                            <Trash2 size={14} className="text-red-600 dark:text-red-400" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && tab === "units" && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs font-bold uppercase tracking-wider text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                <tr>
                  <Th>Unit</Th>
                  <Th>Company</Th>
                  <Th>Users</Th>
                  <Th>Status</Th>
                  <Th>Created</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                {units.length === 0 && (
                  <tr><td colSpan={6} className="p-10 text-center text-gray-500 dark:text-gray-400">
                    No units match these filters.
                  </td></tr>
                )}

                {units.map((unit) => (
                  <tr key={unit.id} className="hover:bg-gray-50/70 dark:hover:bg-gray-700/40">
                    <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">{unit.name}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{unit.companyName}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                      <UsageCell assigned={unit.assignedUsers} legacy={unit.legacyUsers} />
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={unit.isActive ? "green" : "yellow"}>
                        {unit.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">{formatDate(unit.createdAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        {can("admin.unit.update") && (
                          <Button size="sm" variant="ghost" aria-label={`Edit ${unit.name}`}
                            onClick={() => setUnitDialog(unit)}>
                            <Pencil size={14} />
                          </Button>
                        )}
                        {can("admin.unit.status") && (
                          <Button
                            size="sm" variant="ghost"
                            aria-label={`${unit.isActive ? "Deactivate" : "Activate"} ${unit.name}`}
                            onClick={() => run(
                              () => companyUnitApi.setUnitStatus(unit.id, !unit.isActive, token, tokenType),
                              unit.isActive ? "Unit deactivated" : "Unit activated",
                            )}
                          >
                            {unit.isActive ? <PowerOff size={14} /> : <Power size={14} />}
                          </Button>
                        )}
                        {can("admin.unit.delete") && (
                          <Button
                            size="sm" variant="ghost"
                            aria-label={`Delete ${unit.name}`}
                            disabled={unit.assignedUsers > 0 || unit.legacyUsers > 0}
                            title={unit.assignedUsers > 0 || unit.legacyUsers > 0
                              ? "Cannot delete this unit because users are assigned to it. Reassign users before deleting."
                              : "Delete unit"}
                            onClick={() => run(
                              () => companyUnitApi.deleteUnit(unit.id, token, tokenType),
                              "Unit deleted",
                            )}
                          >
                            <Trash2 size={14} className="text-red-600 dark:text-red-400" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {!canManageCompanies && !canManageUnits && !loading && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          You have read access to this master data. Creating and changing companies is restricted
          because a company code is the tenant key every access check reads.
        </p>
      )}

      {companyDialog && (
        <CompanyModal
          company={companyDialog.id ? companyDialog : null}
          busy={busy}
          onSave={saveCompany}
          onClose={() => setCompanyDialog(null)}
        />
      )}

      {unitDialog && (
        <UnitModal
          unit={unitDialog.id ? unitDialog : null}
          companies={companyOptions}
          busy={busy}
          onSave={saveUnit}
          onClose={() => setUnitDialog(null)}
        />
      )}
    </div>
  );
}
