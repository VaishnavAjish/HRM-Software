import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  Building2, Plus, RefreshCw, Search, Loader2, Pencil, Trash2,
  Power, PowerOff, Link2, AlertTriangle, Users, UserCheck, Check,
} from "lucide-react";
import Badge from "../../../components/ui/Badge";
import Button from "../../../components/ui/Button";
import Card from "../../../components/ui/Card";
import Modal from "../../../components/ui/Modal";
import { SkeletonTable } from "../../../components/ui/Skeleton";
import { useAuth } from "../../../context/AuthContext";
import { useAuthorization } from "../../../hooks/useAuthorization";
import { companyUnitApi, departmentApi } from "../../../utils/api";

const inputClass =
  "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";
const labelClass = "mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400";

const STATUS_FILTERS = [
  { value: "ALL", label: "All Statuses" },
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
];

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
              The code is locked because users or units already depend on it.
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
              This unit cannot be moved while users are assigned to it.
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

function DepartmentModal({ department, companies, busy, onSave, onClose }) {
  const isEdit = Boolean(department?.id);
  const [name, setName] = useState(department?.name ?? "");
  const [selectedCompanies, setSelectedCompanies] = useState(() => {
    if (!department?.company_code) return [];
    return department.company_code.split(",").filter(Boolean);
  });

  const toggleCompany = (code) => {
    setSelectedCompanies(prev => 
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={isEdit ? `Edit Department: ${department.name}` : "Add Department"}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            disabled={busy || !name.trim()}
            onClick={() => onSave({ name: name.trim(), company_code: selectedCompanies.length > 0 ? selectedCompanies.join(",") : null })}
          >
            {busy && <Loader2 size={16} className="animate-spin" />}
            Save
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className={labelClass}>Companies (Select one or multiple, or leave empty for Global)</span>
          <div className="mt-2 space-y-1 max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg p-2 bg-gray-50 dark:bg-gray-800/50">
            {companies.map((company) => (
              <label key={company.id} className="flex items-center gap-3 p-2 hover:bg-white dark:hover:bg-gray-700/50 rounded-md cursor-pointer transition-colors">
                <input 
                  type="checkbox"
                  checked={selectedCompanies.includes(company.code)}
                  onChange={() => toggleCompany(company.code)}
                  className="w-4 h-4 text-brand-600 rounded border-gray-300 dark:border-gray-600 focus:ring-brand-500"
                />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {company.name} <span className="text-xs text-gray-500">({company.code})</span>
                </span>
              </label>
            ))}
          </div>
        </label>

        <label className="block">
          <span className={labelClass}>Department name *</span>
          <input
            className={inputClass}
            placeholder="e.g. Engineering, Sales, Polish-01..."
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
      </div>
    </Modal>
  );
}

function AssignManagerModal({ managerData, allDepartments, eligibleUsers, busy, onSave, onClose }) {
  const isEdit = Boolean(managerData?.id);
  const [selectedUserId, setSelectedUserId] = useState(managerData?.id ? String(managerData.id) : "");
  const [selectedDeptIds, setSelectedDeptIds] = useState(
    managerData?.departments ? managerData.departments.map((d) => d.id) : []
  );
  const [deptSearch, setDeptSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");

  const toggleDept = (id) => {
    setSelectedDeptIds((prev) =>
      prev.includes(id) ? prev.filter((dId) => dId !== id) : [...prev, id]
    );
  };

  const filteredDepts = useMemo(() => {
    if (!deptSearch.trim()) return allDepartments;
    const term = deptSearch.toLowerCase();
    return allDepartments.filter((d) =>
      d.name?.toLowerCase().includes(term) || d.company_code?.toLowerCase().includes(term)
    );
  }, [allDepartments, deptSearch]);

  const filteredUsers = useMemo(() => {
    if (!userSearch.trim()) return eligibleUsers;
    const term = userSearch.toLowerCase();
    return eligibleUsers.filter(
      (u) =>
        u.name?.toLowerCase().includes(term) ||
        u.emp_code?.toLowerCase().includes(term) ||
        u.email?.toLowerCase().includes(term)
    );
  }, [eligibleUsers, userSearch]);

  const selectAll = () => {
    const allFilteredIds = filteredDepts.map((d) => d.id);
    setSelectedDeptIds((prev) => Array.from(new Set([...prev, ...allFilteredIds])));
  };

  const deselectAll = () => {
    const allFilteredIds = new Set(filteredDepts.map((d) => d.id));
    setSelectedDeptIds((prev) => prev.filter((id) => !allFilteredIds.has(id)));
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={isEdit ? `Edit Manager Departments: ${managerData.name}` : "Assign Department Manager"}
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {selectedDeptIds.length} department{selectedDeptIds.length === 1 ? "" : "s"} selected
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button
              disabled={busy || !selectedUserId || selectedDeptIds.length === 0}
              onClick={() =>
                onSave({
                  user_id: Number(selectedUserId),
                  department_ids: selectedDeptIds,
                })
              }
            >
              {busy && <Loader2 size={16} className="animate-spin" />}
              Save Assignments
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block">
            <span className={labelClass}>Select Manager / User *</span>
            {isEdit ? (
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-3">
                <div className="font-semibold text-gray-900 dark:text-white">{managerData.name}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {managerData.emp_code ? `ID: ${managerData.emp_code} · ` : ""}{managerData.email}
                  {managerData.designation ? ` · ${managerData.designation}` : ""}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    className={`${inputClass} pl-8 text-xs`}
                    placeholder="Search user by name, employee code, or email..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                  />
                </div>
                <select
                  className={inputClass}
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                >
                  <option value="">-- Choose Employee / Manager --</option>
                  {filteredUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} {u.emp_code ? `(${u.emp_code})` : ""} {u.designation ? `[${u.designation}]` : ""} {u.company_code ? `- ${u.company_code}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </label>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className={labelClass}>
              Assign Departments (One manager can manage multiple departments) *
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={selectAll}
                className="text-xs font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400"
              >
                Select All
              </button>
              <span className="text-gray-300 dark:text-gray-600">|</span>
              <button
                type="button"
                onClick={deselectAll}
                className="text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400"
              >
                Deselect All
              </button>
            </div>
          </div>

          <div className="relative mb-2">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className={`${inputClass} pl-8 text-xs`}
              placeholder="Search departments..."
              value={deptSearch}
              onChange={(e) => setDeptSearch(e.target.value)}
            />
          </div>

          <div className="max-h-60 overflow-y-auto space-y-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 p-2">
            {filteredDepts.length === 0 ? (
              <p className="p-4 text-center text-xs text-gray-500 dark:text-gray-400">
                No departments found.
              </p>
            ) : (
              filteredDepts.map((dept) => {
                const checked = selectedDeptIds.includes(dept.id);
                return (
                  <div
                    key={dept.id}
                    onClick={() => toggleDept(dept.id)}
                    className={`flex items-center justify-between gap-2 p-2 rounded-md cursor-pointer text-xs transition-colors ${
                      checked
                        ? "bg-brand-50 border border-brand-200 text-brand-900 dark:bg-brand-900/30 dark:border-brand-800 dark:text-brand-100 font-medium"
                        : "hover:bg-gray-100 dark:hover:bg-gray-700/50 text-gray-800 dark:text-gray-200"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
                          checked
                            ? "bg-brand-600 border-brand-600 text-white"
                            : "border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                        }`}
                      >
                        {checked && <Check size={12} strokeWidth={3} />}
                      </div>
                      <span>{dept.name}</span>
                    </div>
                    {dept.company_code && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200/70 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-mono">
                        {dept.company_code}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

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
            owns each one.
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
  const [departments, setDepartments] = useState([]);
  const [departmentManagers, setDepartmentManagers] = useState([]);
  const [eligibleUsers, setEligibleUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [companyFilter, setCompanyFilter] = useState("");

  const [companyDialog, setCompanyDialog] = useState(null);
  const [unitDialog, setUnitDialog] = useState(null);
  const [departmentDialog, setDepartmentDialog] = useState(null);
  const [managerDialog, setManagerDialog] = useState(null);

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
      departmentApi.departments({ company_code: companyFilter, search }, token, tokenType).catch(() => ({ data: [] })),
      departmentApi.departmentManagers({ company_code: companyFilter, search }, token, tokenType).catch(() => ({ data: [] })),
      departmentApi.eligibleUsers({}, token, tokenType).catch(() => ({ data: [] })),
    ])
      .then(([companyRes, unitRes, legacyRes, deptRes, managersRes, usersRes]) => {
        if (!active) return;
        setCompanies(companyRes?.data ?? []);
        setUnits(unitRes?.data ?? []);
        setLegacy(legacyRes?.data ?? []);
        setDepartments(deptRes?.data ?? []);
        setDepartmentManagers(managersRes?.data ?? []);
        setEligibleUsers(usersRes?.data ?? []);
      })
      .catch((err) => { if (active) toast.error(err.message || "Could not load data"); })
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, [token, tokenType, search, status, companyFilter, refreshKey]);

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
      setDepartmentDialog(null);
      setManagerDialog(null);
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

  const saveDepartment = (payload) => run(
    () => (departmentDialog?.id
      ? departmentApi.updateDepartment(departmentDialog.id, payload, token, tokenType)
      : departmentApi.createDepartment(payload, token, tokenType)),
    departmentDialog?.id ? "Department updated" : "Department created",
  );

  const saveManagerAssignment = (payload) => run(
    () => departmentApi.assignManager(payload, token, tokenType),
    "Department manager assigned successfully",
  );

  const removeManagerAssignment = (userId, deptId = null) => run(
    () => departmentApi.removeManager(userId, deptId, token, tokenType),
    "Department manager assignment removed",
  );

  const companyOptions = useMemo(
    () => companies.map((company) => ({ id: company.id, name: company.name, code: company.code, isActive: company.isActive })),
    [companies],
  );

  const canManage = can("admin.company.create") || can("admin.company.update") || can("admin.company.manage");

  return (
    <div className="min-w-0 max-w-full space-y-5">
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {[
          ["companies", "Companies"],
          ["units", "Units"],
          ["departments", "Departments"],
          ["department_managers", "Department Managers"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => { setTab(key); setSearch(""); }}
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
          <div className="relative flex-1 min-w-[220px] max-w-xs">
            <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              aria-label="Search records"
              className={`${inputClass} pl-8`}
              placeholder={
                tab === "companies"
                  ? "Search name or code…"
                  : tab === "units"
                  ? "Search unit…"
                  : tab === "departments"
                  ? "Search department name…"
                  : "Search manager name, emp code, or email…"
              }
              value={search}
              onChange={(e) => changeFilter(setSearch)(e.target.value)}
            />
          </div>

          {(tab === "units" || tab === "departments" || tab === "department_managers") && (
            <select
              aria-label="Filter by company"
              className={`${inputClass} w-48`}
              value={companyFilter}
              onChange={(e) => changeFilter(setCompanyFilter)(e.target.value)}
            >
              <option value="">All companies</option>
              {companyOptions.map((company) => (
                <option key={company.id} value={company.code || company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          )}

          {(tab === "companies" || tab === "units") && (
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
          )}

          <div className="ml-auto flex items-center gap-2">
            <Button variant="secondary" onClick={reload}><RefreshCw size={16} /> Refresh</Button>

            {tab === "companies" && can("admin.company.create") && (
              <Button onClick={() => setCompanyDialog({})}><Plus size={16} /> Add Company</Button>
            )}
            {tab === "units" && can("admin.unit.create") && (
              <Button onClick={() => setUnitDialog({})}><Plus size={16} /> Add Unit</Button>
            )}
            {tab === "departments" && canManage && (
              <Button onClick={() => setDepartmentDialog({})}><Plus size={16} /> Add Department</Button>
            )}
            {tab === "department_managers" && canManage && (
              <Button onClick={() => setManagerDialog({})}><Plus size={16} /> Assign Department Manager</Button>
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

        {/* Companies Table */}
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
                            disabled={company.units > 0 || company.assignedUsers > 0 || company.legacyUsers > 0}
                            title={company.units > 0 || company.assignedUsers > 0 || company.legacyUsers > 0
                              ? "Cannot delete this company because users or units are assigned to it."
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

        {/* Units Table */}
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
                              ? "Cannot delete this unit because users are assigned to it."
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

        {/* Departments Table */}
        {!loading && tab === "departments" && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs font-bold uppercase tracking-wider text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                <tr>
                  <Th>Department Name</Th>
                  <Th>Company</Th>
                  <Th>Assigned Managers</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                {departments.length === 0 && (
                  <tr><td colSpan={4} className="p-10 text-center text-gray-500 dark:text-gray-400">
                    No departments match these filters.
                  </td></tr>
                )}
                {departments.map((dept) => (
                  <tr key={dept.id} className="hover:bg-gray-50/70 dark:hover:bg-gray-700/40">
                    <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">
                      {dept.name}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                      {dept.company_code ? (
                        <div className="flex flex-wrap gap-1">
                          {dept.company_code.split(",").filter(Boolean).map(code => (
                            <span key={code} className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                              {code}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400 italic">All Companies (Global)</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                      {dept.managers && dept.managers.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {dept.managers.map((m) => (
                            <span
                              key={m.id}
                              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-brand-50 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 border border-brand-200 dark:border-brand-800"
                            >
                              <UserCheck size={11} /> {m.name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400 italic">No manager assigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        {canManage && (
                          <Button size="sm" variant="ghost" aria-label={`Edit ${dept.name}`} onClick={() => setDepartmentDialog(dept)}>
                            <Pencil size={14} />
                          </Button>
                        )}
                        {canManage && (
                          <Button size="sm" variant="ghost" aria-label={`Delete ${dept.name}`}
                            onClick={() => run(() => departmentApi.deleteDepartment(dept.id, token, tokenType), "Department deleted")}
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

        {/* Department Managers Table */}
        {!loading && tab === "department_managers" && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs font-bold uppercase tracking-wider text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                <tr>
                  <Th>Manager</Th>
                  <Th>Company / Designation</Th>
                  <Th>Managed Departments (Multiple)</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                {departmentManagers.length === 0 && (
                  <tr><td colSpan={4} className="p-10 text-center text-gray-500 dark:text-gray-400">
                    <div className="flex flex-col items-center justify-center gap-2 py-4">
                      <Users size={32} className="text-gray-400" />
                      <p className="font-medium text-gray-700 dark:text-gray-300">No Department Managers assigned yet</p>
                      <p className="text-xs text-gray-500">Click &quot;Assign Department Manager&quot; above to assign managers to one or multiple departments.</p>
                    </div>
                  </td></tr>
                )}
                {departmentManagers.map((mgr) => (
                  <tr key={mgr.id} className="hover:bg-gray-50/70 dark:hover:bg-gray-700/40">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900/50 flex items-center justify-center font-bold text-xs text-brand-700 dark:text-brand-300">
                          {mgr.name?.charAt(0)?.toUpperCase() || "M"}
                        </div>
                        <div>
                          <div className="font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
                            {mgr.name}
                            {mgr.emp_code && (
                              <span className="text-[11px] font-mono font-normal text-gray-500 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.2 rounded">
                                {mgr.emp_code}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">{mgr.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 text-xs">
                      <div className="font-medium text-gray-800 dark:text-gray-200">{mgr.designation || "—"}</div>
                      <div className="text-gray-500 font-mono text-[11px]">{mgr.company_code || "All Companies"}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {mgr.departments?.map((dept) => (
                          <span
                            key={dept.id}
                            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 font-medium"
                          >
                            {dept.name}
                            {dept.company_code && (
                              <span className="text-[9px] text-blue-500 opacity-75">({dept.company_code})</span>
                            )}
                          </span>
                        ))}
                        <span className="text-xs text-gray-400 font-medium ml-1">
                          ({mgr.departments?.length || 0} dept{mgr.departments?.length === 1 ? "" : "s"})
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        {canManage && (
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`Edit departments for ${mgr.name}`}
                            onClick={() => setManagerDialog(mgr)}
                          >
                            <Pencil size={14} />
                          </Button>
                        )}
                        {canManage && (
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`Remove manager assignments for ${mgr.name}`}
                            title="Remove all department assignments for this manager"
                            onClick={() => removeManagerAssignment(mgr.id)}
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

      {!canManage && !loading && (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          You have read access to this master data. Creating and editing companies, units, and departments requires administrator privileges.
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

      {departmentDialog && (
        <DepartmentModal
          department={departmentDialog.id ? departmentDialog : null}
          companies={companies}
          busy={busy}
          onSave={saveDepartment}
          onClose={() => setDepartmentDialog(null)}
        />
      )}

      {managerDialog && (
        <AssignManagerModal
          managerData={managerDialog.id ? managerDialog : null}
          allDepartments={departments}
          eligibleUsers={eligibleUsers}
          busy={busy}
          onSave={saveManagerAssignment}
          onClose={() => setManagerDialog(null)}
        />
      )}
    </div>
  );
}
