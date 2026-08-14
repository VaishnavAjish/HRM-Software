import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  Landmark, Plus, RefreshCw, Search, Loader2, Pencil, Trash2, Power, PowerOff, Shield, Star,
} from "lucide-react";
import Badge from "../../../components/ui/Badge";
import Button from "../../../components/ui/Button";
import Card from "../../../components/ui/Card";
import Modal from "../../../components/ui/Modal";
import { SkeletonTable } from "../../../components/ui/Skeleton";
import { useAuth } from "../../../context/AuthContext";
import { useAuthorization } from "../../../hooks/useAuthorization";
import { companyUnitApi } from "../../../utils/api";
import { organizationApi } from "../../../features/organization/services/organizationApi";

const inputClass =
  "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";
const labelClass = "mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400";

const STATUS_FILTERS = [
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
  return (
    <th scope="col" className={`px-4 py-3 whitespace-nowrap ${className}`}>{children}</th>
  );
}

function LegalEntityModal({ entity, companies, busy, onSave, onClose }) {
  const isEdit = Boolean(entity);
  const [companyId, setCompanyId] = useState(entity?.companyId ?? "");
  const [code, setCode] = useState(entity?.code ?? "");
  const [codeTouched, setCodeTouched] = useState(isEdit);
  const [name, setName] = useState(entity?.name ?? "");
  const [legalName, setLegalName] = useState(entity?.legalName ?? "");
  const [registrationNumber, setRegistrationNumber] = useState(entity?.registrationNumber ?? "");
  const [countryCode, setCountryCode] = useState(entity?.countryCode ?? "IN");
  const [taxId, setTaxId] = useState(entity?.taxId ?? "");
  const [currency, setCurrency] = useState(entity?.currency ?? "INR");
  const [fiscalYearStart, setFiscalYearStart] = useState(entity?.fiscalYearStart ?? "04-01");
  const [primaryAddress, setPrimaryAddress] = useState(entity?.primaryAddress ?? "");
  const [contactEmail, setContactEmail] = useState(entity?.contactEmail ?? "");
  const [contactPhone, setContactPhone] = useState(entity?.contactPhone ?? "");
  const [isPrimary, setIsPrimary] = useState(entity?.isPrimary ?? false);

  /*
   * A legal entity lives inside exactly one company. When the account is scoped
   * to a single company the picker is pure ceremony, so it is locked to save
   * the operator from implying a choice they are not allowed to make.
   */
  const lockedCompany = companies.length <= 1;

  const canSave = name.trim() && code.trim() && companyId;

  const changeName = (value) => {
    setName(value);
    if (!codeTouched && !isEdit) setCode(slugify(value));
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={isEdit ? `Edit ${entity.name}` : "Add legal entity"}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            disabled={busy || !canSave}
            onClick={() => onSave({
              companyId: Number(companyId),
              code: code.trim(),
              name: name.trim(),
              legalName: legalName.trim(),
              registrationNumber: registrationNumber.trim(),
              countryCode: countryCode.trim().toUpperCase(),
              taxId: taxId.trim(),
              currency: currency.trim().toUpperCase(),
              fiscalYearStart: fiscalYearStart.trim(),
              primaryAddress: primaryAddress.trim(),
              contactEmail: contactEmail.trim(),
              contactPhone: contactPhone.trim(),
              isPrimary,
            })}
          >
            {busy && <Loader2 size={16} className="animate-spin" />}
            Save
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={labelClass}>Company *</span>
            <select
              className={inputClass}
              value={companyId}
              disabled={lockedCompany}
              onChange={(e) => setCompanyId(e.target.value)}
            >
              <option value="">Select company</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>{company.name}</option>
              ))}
            </select>
            {lockedCompany && (
              <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                Your account is scoped to this company.
              </span>
            )}
          </label>
          <label className="block">
            <span className={labelClass}>Entity name *</span>
            <input className={inputClass} value={name} onChange={(e) => changeName(e.target.value)} />
          </label>
          <label className="block">
            <span className={labelClass}>Code *</span>
            <input
              className={inputClass}
              value={code}
              onChange={(e) => { setCodeTouched(true); setCode(slugify(e.target.value)); }}
            />
          </label>
          <label className="block">
            <span className={labelClass}>Legal name</span>
            <input className={inputClass} value={legalName} onChange={(e) => setLegalName(e.target.value)} />
          </label>
          <label className="block">
            <span className={labelClass}>Registration number</span>
            <input className={inputClass} value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value)} />
          </label>
          <label className="block">
            <span className={labelClass}>Tax ID (GST / PAN)</span>
            <input className={inputClass} value={taxId} onChange={(e) => setTaxId(e.target.value)} />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className={labelClass}>Country code</span>
              <input
                className={inputClass}
                value={countryCode}
                maxLength={2}
                onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
              />
            </label>
            <label className="block">
              <span className={labelClass}>Currency</span>
              <input
                className={inputClass}
                value={currency}
                maxLength={3}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              />
            </label>
          </div>
          <label className="block">
            <span className={labelClass}>Fiscal year start (MM-DD)</span>
            <input className={inputClass} value={fiscalYearStart} onChange={(e) => setFiscalYearStart(e.target.value)} />
          </label>
          <label className="block">
            <span className={labelClass}>Contact email</span>
            <input className={inputClass} value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
          </label>
          <label className="block">
            <span className={labelClass}>Contact phone</span>
            <input className={inputClass} value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
          </label>
        </div>

        <label className="block">
          <span className={labelClass}>Primary address</span>
          <textarea className={inputClass} rows={2} value={primaryAddress} onChange={(e) => setPrimaryAddress(e.target.value)} />
        </label>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            checked={isPrimary}
            onChange={(e) => setIsPrimary(e.target.checked)}
          />
          <span className="text-sm text-gray-700 dark:text-gray-200">
            This is the company's primary employing entity
          </span>
        </label>
      </div>
    </Modal>
  );
}

export default function LegalEntities() {
  const { user } = useAuth();
  const { can } = useAuthorization();
  const token = user?.accessToken;
  const tokenType = user?.tokenType || "Bearer";

  const [entities, setEntities] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [companyFilter, setCompanyFilter] = useState("");

  const [dialog, setDialog] = useState(null);

  const reload = useCallback(() => {
    setLoading(true);
    setRefreshKey((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!token) return undefined;

    let active = true;

    Promise.all([
      organizationApi.legalEntities(
        { search, status, company_id: companyFilter },
        token, tokenType,
      ),
      companyUnitApi.companies({}, token, tokenType).catch(() => ({ data: [] })),
    ])
      .then(([entitiesRes, companiesRes]) => {
        if (!active) return;
        setEntities(entitiesRes?.data ?? []);
        setCompanies(companiesRes?.data ?? []);
      })
      .catch((err) => { if (active) toast.error(err.message || "Could not load legal entities"); })
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, [token, tokenType, search, status, companyFilter, refreshKey]);

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

  const save = (payload) => run(
    () => (dialog?.id
      ? organizationApi.updateLegalEntity(dialog.id, payload, token, tokenType)
      : organizationApi.createLegalEntity(payload, token, tokenType)),
    dialog?.id ? "Legal entity updated" : "Legal entity created",
  );

  const companyOptions = useMemo(
    () => companies.map((company) => ({ id: company.id, name: company.name })),
    [companies],
  );

  const canManageEntities = can("org.legal_entity.create") || can("org.legal_entity.update");

  return (
    <div className="min-w-0 max-w-full space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-white">
          <Landmark size={20} /> Legal Entities
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          The employers on record per company — their registration, tax and fiscal identifiers.
        </p>
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              aria-label="Search legal entities"
              className={`${inputClass} w-64 pl-8`}
              placeholder="Search name or code…"
              value={search}
              onChange={(e) => changeFilter(setSearch)(e.target.value)}
            />
          </div>

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
            {can("org.legal_entity.create") && (
              <Button onClick={() => setDialog({})}><Plus size={16} /> Add Legal Entity</Button>
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
                  <Th>Name</Th>
                  <Th>Legal name</Th>
                  <Th>Company</Th>
                  <Th>Country</Th>
                  <Th>Currency</Th>
                  <Th>Primary</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                {entities.length === 0 && (
                  <tr><td colSpan={8} className="p-10 text-center text-gray-500 dark:text-gray-400">
                    No legal entities match these filters.
                  </td></tr>
                )}

                {entities.map((entity) => (
                  <tr key={entity.id} className="hover:bg-gray-50/70 dark:hover:bg-gray-700/40">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-900 dark:text-white">{entity.name}</div>
                      <div className="font-mono text-xs text-gray-500 dark:text-gray-400">{entity.code}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{entity.legalName || "—"}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{entity.companyName}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{entity.countryCode}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{entity.currency}</td>
                    <td className="px-4 py-3">
                      {entity.isPrimary ? <Badge variant="blue"><Star size={11} /> Primary</Badge> : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={entity.isActive ? "green" : "yellow"}>
                        {entity.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        {can("org.legal_entity.update") && (
                          <Button size="sm" variant="ghost" aria-label={`Edit ${entity.name}`}
                            onClick={() => setDialog(entity)}>
                            <Pencil size={14} />
                          </Button>
                        )}
                        {can("org.legal_entity.status") && (
                          <Button
                            size="sm" variant="ghost"
                            aria-label={`${entity.isActive ? "Deactivate" : "Activate"} ${entity.name}`}
                            onClick={() => run(
                              () => organizationApi.setLegalEntityStatus(entity.id, !entity.isActive, token, tokenType),
                              entity.isActive ? "Legal entity deactivated" : "Legal entity activated",
                            )}
                          >
                            {entity.isActive ? <PowerOff size={14} /> : <Power size={14} />}
                          </Button>
                        )}
                        {can("org.legal_entity.delete") && (
                          <Button
                            size="sm" variant="ghost"
                            aria-label={`Delete ${entity.name}`}
                            /*
                             * Disabled, not hidden. The primary employing entity
                             * cannot be deactivated or removed because payroll
                             * records hang off it — the server enforces this
                             * independently, the control just explains it.
                             */
                            disabled={entity.isPrimary}
                            title={entity.isPrimary
                              ? "The primary legal entity is fixed while payroll records reference it."
                              : "Delete legal entity"}
                            onClick={() => run(
                              () => organizationApi.deleteLegalEntity(entity.id, token, tokenType),
                              "Legal entity deleted",
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

      {!canManageEntities && !loading && (
        <p className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          <Shield size={13} className="text-gray-400" />
          You have read access to this master data. Creating and changing legal entities is
          restricted to administrators.
        </p>
      )}

      {dialog && (
        <LegalEntityModal
          entity={dialog.id ? dialog : null}
          companies={companyOptions}
          busy={busy}
          onSave={save}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}