import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Plus, RefreshCw, Search, Loader2, Pencil, Trash2, Power, PowerOff, Shield } from "lucide-react";
import Badge from "../../../components/ui/Badge";
import Button from "../../../components/ui/Button";
import Card from "../../../components/ui/Card";
import Modal from "../../../components/ui/Modal";
import { SkeletonTable } from "../../../components/ui/Skeleton";
import { useAuth } from "../../../context/AuthContext";
import { useAuthorization } from "../../../hooks/useAuthorization";

const inputClass =
  "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";
const labelClass = "mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400";

const DEFAULT_STATUS_FILTERS = [
  { value: "ALL", label: "All" },
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

function Th({ children, className = "" }) {
  return <th scope="col" className={`px-4 py-3 whitespace-nowrap ${className}`}>{children}</th>;
}

function DefaultFormField({ field, value, onChange, options = [], disabled = false, labelClass: lc = labelClass, inputClass: ic = inputClass }) {
  const { type = "text", label, required = false, maxLength, rows = 1, placeholder, helper, transform, disabled: fieldDisabled } = field;
  const isDisabled = disabled || fieldDisabled;

  if (type === "select") {
    return (
      <label className="block">
        <span className={lc}>{label} {required && <span className="text-red-500">*</span>}</span>
        <select className={ic} value={value} onChange={(e) => onChange(transform ? transform(e.target.value) : e.target.value)} disabled={isDisabled}>
          <option value="">Select...</option>
          {options.map((opt) => (
            <option key={opt.id ?? opt.value} value={opt.id ?? opt.value}>{opt.label ?? opt.name}</option>
          ))}
        </select>
        {helper && <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">{helper}</span>}
      </label>
    );
  }

  if (type === "textarea") {
    return (
      <label className="block">
        <span className={lc}>{label} {required && <span className="text-red-500">*</span>}</span>
        <textarea className={ic} rows={rows} value={value} onChange={(e) => onChange(transform ? transform(e.target.value) : e.target.value)} placeholder={placeholder} disabled={isDisabled} maxLength={maxLength} />
        {helper && <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">{helper}</span>}
      </label>
    );
  }

  if (type === "checkbox") {
    return (
      <label className="flex items-center gap-2">
        <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" checked={value} onChange={(e) => onChange(e.target.checked)} disabled={isDisabled} />
        <span className="text-sm text-gray-700 dark:text-gray-200">{label}</span>
      </label>
    );
  }

  if (type === "number") {
    return (
      <label className="block">
        <span className={lc}>{label} {required && <span className="text-red-500">*</span>}</span>
        <input type="number" className={ic} value={value} onChange={(e) => onChange(transform ? transform(e.target.value) : (e.target.value === "" ? null : Number(e.target.value)))} placeholder={placeholder} disabled={isDisabled} maxLength={maxLength} />
        {helper && <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">{helper}</span>}
      </label>
    );
  }

  return (
    <label className="block">
      <span className={lc}>{label} {required && <span className="text-red-500">*</span>}</span>
      <input type={type} className={ic} value={value} onChange={(e) => onChange(transform ? transform(e.target.value) : e.target.value)} placeholder={placeholder} disabled={isDisabled} maxLength={maxLength} />
      {helper && <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">{helper}</span>}
    </label>
  );
}

export function OrgResourceManager({
  title,
  description,
  icon: Icon,
  api: {
    list,
    create,
    update,
    remove: del,
    setStatus,
    fetchOptions,
    fetchCompanies,
    fetchExtra,
  },
  columns,
  formFields,
  filters = {},
  permissions = {},
  statusFilters = DEFAULT_STATUS_FILTERS,
  kindFilters,
  lockedCompanyLogic = false,
  companyFilterKey = "company_id",
  statusFilterKey = "status",
  searchFilterKey = "search",
  extraFilterKeys = {},
  transformListItem = (item) => item,
  canManageChecker = () => false,
  customModal,
  modalSize = "lg",
  customModalProps = {},
  getFormValues = (state) => state,
  initialFormState = {},
  formStateToPayload = (state) => state,
  onSaveSuccess,
  onDeleteSuccess,
  onStatusToggleSuccess,
} = {}) {
  const { user } = useAuth();
  const { can } = useAuthorization();
  const token = user?.accessToken;
  const tokenType = user?.tokenType || "Bearer";

  const [items, setItems] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [options, setOptions] = useState([]);
  const [extraData, setExtraData] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const filterState = useMemo(() => ({}), []);
  const [search, setSearch] = useState("");
  const [status, setStatusFilter] = useState("ALL");
  const [kind, setKind] = useState("ALL");
  const [companyFilter, setCompanyFilter] = useState("");
  const [customFilters, setCustomFilters] = useState({});

  const [dialog, setDialog] = useState(null);

  const reload = useCallback(() => {
    setLoading(true);
    setRefreshKey((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!token) return undefined;

    let active = true;

    const loadData = async () => {
      try {
        const listParams = {
          [searchFilterKey]: search || undefined,
          [statusFilterKey]: status === "ALL" ? undefined : status,
          [companyFilterKey]: companyFilter || undefined,
          ...customFilters,
        };

        const [listRes, companiesRes] = await Promise.all([
          list(listParams, token, tokenType),
          fetchCompanies ? fetchCompanies({}, token, tokenType).catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
        ]);

        if (!active) return;
        setItems((listRes?.data ?? []).map(transformListItem));
        setCompanies(companiesRes?.data ?? []);

        if (fetchOptions) {
          const optionsRes = await fetchOptions({}, token, tokenType);
          if (active) setOptions(optionsRes?.data ?? []);
        }

        if (fetchExtra) {
          const extraRes = await fetchExtra({}, token, tokenType);
          if (active) setExtraData(extraRes?.data ?? {});
        }
      } catch (err) {
        if (active) toast.error(err.message || `Could not load ${title.toLowerCase()}`);
      } finally {
        if (active) setLoading(false);
      }
    };

    loadData();

    return () => { active = false; };
  }, [token, tokenType, search, status, kind, companyFilter, customFilters, refreshKey, list, fetchCompanies, fetchOptions, fetchExtra, searchFilterKey, statusFilterKey, companyFilterKey, transformListItem]);

  const changeFilter = (setter) => (value) => {
    setLoading(true);
    setter(value);
  };

  const run = async (work, message, after = () => {}) => {
    setBusy(true);
    try {
      await work();
      toast.success(message);
      after();
      reload();
    } catch (err) {
      toast.error(err.message || "That did not work");
    } finally {
      setBusy(false);
    }
  };

  const save = (formState) => run(
    () => (dialog?.id
      ? update(dialog.id, formStateToPayload(formState), token, tokenType)
      : create(formStateToPayload(formState), token, tokenType)),
    dialog?.id ? `${title} updated` : `${title} created`,
    () => onSaveSuccess?.(formState),
  );

  const companyOptions = useMemo(
    () => companies.map((company) => ({ id: company.id, name: company.name })),
    [companies],
  );

  const canManage = canManageChecker(can);

  const handleStatusToggle = (item) => run(
    () => setStatus(item.id, !item.isActive, token, tokenType),
    item.isActive ? `${title} deactivated` : `${title} activated`,
    () => onStatusToggleSuccess?.(item),
  );

  const handleDelete = (item) => run(
    () => del(item.id, token, tokenType),
    `${title} deleted`,
    () => onDeleteSuccess?.(item),
  );

  const defaultModalTitle = dialog?.id ? `Edit ${dialog.name ?? dialog.title ?? "record"}` : `Add ${title}`;

  return (
    <div className="min-w-0 max-w-full space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-white">
          <Icon size={20} /> {title}
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              aria-label={`Search ${title.toLowerCase()}`}
              className={`${inputClass} w-64 pl-8`}
              placeholder={`Search ${filters.searchPlaceholder ?? "name or code"}…`}
              value={search}
              onChange={(e) => changeFilter(setSearch)(e.target.value)}
            />
          </div>

          {companyFilterKey && (
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

          {statusFilterKey && (
            <select
              aria-label="Filter by status"
              className={`${inputClass} w-36`}
              value={status}
              onChange={(e) => changeFilter(setStatusFilter)(e.target.value)}
            >
              {statusFilters.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          )}

          {kindFilters && (
            <select
              aria-label="Filter by kind"
              className={`${inputClass} w-36`}
              value={kind}
              onChange={(e) => changeFilter(setKind)(e.target.value)}
            >
              {kindFilters.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          )}

          {Object.entries(extraFilterKeys).map(([key, config]) => (
            <select
              key={key}
              aria-label={`Filter by ${config.label}`}
              className={`${inputClass} w-40`}
              value={customFilters[key] || ""}
              onChange={(e) => changeFilter((v) => setCustomFilters({ ...customFilters, [key]: v }))(e.target.value)}
            >
              <option value="">{config.allLabel ?? `All ${config.label}`}</option>
              {config.options?.map((opt) => (
                <option key={opt.id ?? opt.value} value={opt.id ?? opt.value}>{opt.label ?? opt.name}</option>
              ))}
            </select>
          ))}

          <div className="ml-auto flex items-center gap-2">
            <Button variant="secondary" onClick={reload}><RefreshCw size={16} /> Refresh</Button>
            {permissions.create && can(permissions.create) && (
              <Button onClick={() => setDialog(initialFormState)}><Plus size={16} /> Add {title}</Button>
            )}
          </div>
        </div>
      </Card>

      <Card padding={false}>
        {loading && <div className="p-4"><SkeletonTable rows={5} /></div>}

        {!loading && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs font-bold uppercase tracking-wider text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                <tr>
                  {columns.map((col) => (
                    <Th key={col.key} className={col.className}>{col.header}</Th>
                  ))}
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                {items.length === 0 && (
                  <tr><td colSpan={columns.length + 1} className="p-10 text-center text-gray-500 dark:text-gray-400">
                    No {title.toLowerCase()} match these filters.
                  </td></tr>
                )}

                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50/70 dark:hover:bg-gray-700/40">
                    {columns.map((col) => (
                      <td key={col.key} className={`px-4 py-3 ${col.className ?? ""}`}>
                        {col.render ? col.render(item) : item[col.key]}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        {permissions.update && can(permissions.update) && (
                          <Button size="sm" variant="ghost" aria-label={`Edit ${item.name ?? item.title ?? item.code}`}
                            onClick={() => setDialog(item)}>
                            <Pencil size={14} />
                          </Button>
                        )}
                        {permissions.status && can(permissions.status) && item.isActive !== undefined && (
                          <Button
                            size="sm" variant="ghost"
                            aria-label={`${item.isActive ? "Deactivate" : "Activate"} ${item.name ?? item.title ?? item.code}`}
                            onClick={() => handleStatusToggle(item)}
                          >
                            {item.isActive ? <PowerOff size={14} /> : <Power size={14} />}
                          </Button>
                        )}
                        {permissions.delete && can(permissions.delete) && (
                          <Button
                            size="sm" variant="ghost"
                            aria-label={`Delete ${item.name ?? item.title ?? item.code}`}
                            disabled={item.isPrimary ?? item.locked ?? false}
                            title={item.isPrimary ?? item.locked ? "This record cannot be deleted." : `Delete ${title.toLowerCase()}`}
                            onClick={() => handleDelete(item)}
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
        <p className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          <Shield size={13} className="text-gray-400" />
          You have read access to this master data. Creating and changing {title.toLowerCase()} is restricted to administrators.
        </p>
      )}

      {dialog && (
        customModal ? (
          customModal({
            entity: dialog.id ? dialog : null,
            companies: companyOptions,
            options,
            busy,
            onSave: (payload) => save(payload),
            onClose: () => setDialog(null),
            extraData,
            ...customModalProps,
          })
        ) : (
          <DefaultModal
            entity={dialog.id ? dialog : null}
            fields={formFields}
            companies={companyOptions}
            options={options}
            busy={busy}
            onSave={save}
            onClose={() => setDialog(null)}
            title={defaultModalTitle}
            size={modalSize}
            lockedCompany={lockedCompanyLogic && companyOptions.length <= 1}
            initialFormState={initialFormState}
            getFormValues={getFormValues}
            formStateToPayload={formStateToPayload}
          />
        )
      )}
    </div>
  );
}

function DefaultModal({
  entity,
  fields = [],
  companies = [],
  options = [],
  busy,
  onSave,
  onClose,
  title,
  size = "lg",
  lockedCompany = false,
  initialFormState = {},
  getFormValues,
  formStateToPayload,
}) {
  const isEdit = Boolean(entity);
  const [formState, setFormState] = useState(() => ({
    ...initialFormState,
    ...(entity || {}),
  }));

  useEffect(() => {
    if (entity) {
      setFormState({ ...initialFormState, ...entity });
    } else {
      setFormState(initialFormState);
    }
  }, [entity, initialFormState]);

  const handleChange = (fieldName) => (value) => {
    setFormState((prev) => ({ ...prev, [fieldName]: value }));
    const field = fields.find((f) => f.name === fieldName);
    if (field?.onChange) field.onChange(value, formState);
  };

  const canSave = fields
    .filter((f) => f.required)
    .every((f) => {
      const val = formState[f.name];
      return val !== undefined && val !== null && val !== "";
    });

  const payload = formStateToPayload(formState);

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={title}
      size={size}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            disabled={busy || !canSave}
            onClick={() => onSave(payload)}
          >
            {busy && <Loader2 size={16} className="animate-spin" />}
            Save
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {fields.map((field) => {
            const FieldComponent = field.component || DefaultFormField;
            return (
              <FieldComponent
                key={field.name}
                field={field}
                value={formState[field.name] ?? field.defaultValue ?? ""}
                onChange={handleChange(field.name)}
                options={field.options === "companies" ? companies : field.options === "tree" ? options : field.options ?? []}
                disabled={field.lockedCompany ? lockedCompany : field.disabled}
                labelClass={labelClass}
                inputClass={inputClass}
              />
            );
          })}
        </div>
      </div>
    </Modal>
  );
}

export default OrgResourceManager;