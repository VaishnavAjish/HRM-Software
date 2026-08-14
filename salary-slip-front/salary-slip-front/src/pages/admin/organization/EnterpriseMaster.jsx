import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  Building2, MapPin, CalendarDays, RefreshCw, Search, Loader2, Pencil, Shield,
} from "lucide-react";
import Badge from "../../../components/ui/Badge";
import Button from "../../../components/ui/Button";
import Card from "../../../components/ui/Card";
import { StatCard } from "../../../components/ui/Card";
import Modal from "../../../components/ui/Modal";
import { SkeletonTable } from "../../../components/ui/Skeleton";
import { useAuth } from "../../../context/AuthContext";
import { useAuthorization } from "../../../hooks/useAuthorization";
import { organizationApi } from "../../../features/organization/services/organizationApi";

const inputClass =
  "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";
const labelClass = "mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400";

function Th({ children, className = "" }) {
  return (
    <th scope="col" className={`px-4 py-3 whitespace-nowrap ${className}`}>{children}</th>
  );
}

function EnterpriseModal({ company, busy, onSave, onClose }) {
  const [legalName, setLegalName] = useState(company?.legalName ?? "");
  const [registrationNumber, setRegistrationNumber] = useState(company?.registrationNumber ?? "");
  const [taxIdentification, setTaxIdentification] = useState(company?.taxIdentification ?? "");
  const [incorporationDate, setIncorporationDate] = useState(company?.incorporationDate?.slice(0, 10) ?? "");
  const [countryCode, setCountryCode] = useState(company?.countryCode ?? "IN");
  const [timezone, setTimezone] = useState(company?.timezone ?? "Asia/Kolkata");
  const [primaryAddress, setPrimaryAddress] = useState(company?.primaryAddress ?? "");
  const [contactEmail, setContactEmail] = useState(company?.contactEmail ?? "");
  const [contactPhone, setContactPhone] = useState(company?.contactPhone ?? "");
  const [fiscalYearStart, setFiscalYearStart] = useState(company?.fiscalYearStart ?? "04-01");
  const [currency, setCurrency] = useState(company?.currency ?? "INR");

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`${company.name} — Enterprise details`}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            disabled={busy}
            onClick={() => onSave({
              legalName: legalName.trim(),
              registrationNumber: registrationNumber.trim(),
              taxIdentification: taxIdentification.trim(),
              incorporationDate: incorporationDate || null,
              countryCode: countryCode.trim().toUpperCase(),
              timezone: timezone.trim(),
              primaryAddress: primaryAddress.trim(),
              contactEmail: contactEmail.trim(),
              contactPhone: contactPhone.trim(),
              fiscalYearStart: fiscalYearStart.trim(),
              currency: currency.trim().toUpperCase(),
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
            <span className={labelClass}>Legal name</span>
            <input className={inputClass} value={legalName} onChange={(e) => setLegalName(e.target.value)} />
          </label>
          <label className="block">
            <span className={labelClass}>Registration number</span>
            <input className={inputClass} value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value)} />
          </label>
          <label className="block">
            <span className={labelClass}>Tax identification (PAN / TIN / GST)</span>
            <input className={inputClass} value={taxIdentification} onChange={(e) => setTaxIdentification(e.target.value)} />
          </label>
          <label className="block">
            <span className={labelClass}>Incorporation date</span>
            <input type="date" className={inputClass} value={incorporationDate} onChange={(e) => setIncorporationDate(e.target.value)} />
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
            <span className={labelClass}>Timezone</span>
            <input className={inputClass} value={timezone} onChange={(e) => setTimezone(e.target.value)} />
          </label>
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
      </div>
    </Modal>
  );
}

export default function EnterpriseMaster() {
  const { user } = useAuth();
  const { can } = useAuthorization();
  const token = user?.accessToken;
  const tokenType = user?.tokenType || "Bearer";

  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState(null);

  const reload = useCallback(() => {
    setLoading(true);
    setRefreshKey((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!token) return undefined;

    let active = true;

    organizationApi.enterpriseList({ search }, token, tokenType)
      .then((res) => { if (active) setCompanies(res?.data ?? []); })
      .catch((err) => { if (active) toast.error(err.message || "Could not load enterprise details"); })
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, [token, tokenType, search, refreshKey]);

  const run = async (work, message) => {
    setBusy(true);
    try {
      await work();
      toast.success(message);
      setDialog(null);
      reload();
    } catch (err) {
      toast.error(err.message || "That did not work");
    } finally {
      setBusy(false);
    }
  };

  const totalCompanies = companies.length;
  const totalLegalEntities = companies.reduce((sum, company) => sum + (company.legalEntityCount || 0), 0);
  const totalLocations = companies.reduce((sum, company) => sum + (company.locationCount || 0), 0);
  const totalCalendars = companies.reduce((sum, company) => sum + (company.calendarCount || 0), 0);

  return (
    <div className="min-w-0 max-w-full space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-white">
          <Building2 size={20} /> Enterprise Master
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          The company-wide records that anchor legal entities, locations and calendars.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard title="Companies" value={totalCompanies} icon={<Building2 size={20} />} color="blue" />
        <StatCard title="Legal entities" value={totalLegalEntities} icon={<Shield size={20} />} color="purple" />
        <StatCard title="Locations" value={totalLocations} icon={<MapPin size={20} />} color="green" />
        <StatCard title="Calendars" value={totalCalendars} icon={<CalendarDays size={20} />} color="yellow" />
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              aria-label="Search companies"
              className={`${inputClass} w-64 pl-8`}
              placeholder="Search name or code…"
              value={search}
              onChange={(e) => {
                setLoading(true);
                setSearch(e.target.value);
              }}
            />
          </div>

          <div className="ml-auto">
            <Button variant="secondary" onClick={reload}><RefreshCw size={16} /> Refresh</Button>
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
                  <Th>Company</Th>
                  <Th>Legal name</Th>
                  <Th>Country</Th>
                  <Th>Timezone</Th>
                  <Th>Legal entities</Th>
                  <Th>Locations</Th>
                  <Th>Calendars</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                {companies.length === 0 && (
                  <tr><td colSpan={9} className="p-10 text-center text-gray-500 dark:text-gray-400">
                    No companies match this search.
                  </td></tr>
                )}

                {companies.map((company) => (
                  <tr key={company.id} className="hover:bg-gray-50/70 dark:hover:bg-gray-700/40">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-900 dark:text-white">{company.name}</div>
                      <div className="font-mono text-xs text-gray-500 dark:text-gray-400">{company.code}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{company.legalName || "—"}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{company.countryCode || "—"}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{company.timezone || "—"}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{company.legalEntityCount || 0}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{company.locationCount || 0}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{company.calendarCount || 0}</td>
                    <td className="px-4 py-3">
                      <Badge variant={company.isActive ? "green" : "yellow"}>
                        {company.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {can("org.master.update") && (
                        <Button size="sm" variant="ghost" aria-label={`Edit ${company.name} enterprise details`}
                          onClick={() => setDialog(company)}>
                          <Pencil size={14} />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {!can("org.master.update") && !loading && (
        <p className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          <Shield size={13} className="text-gray-400" />
          You have read access to the enterprise master. Editing these attributes is restricted
          to administrators.
        </p>
      )}

      {dialog && (
        <EnterpriseModal
          company={dialog}
          busy={busy}
          onSave={(payload) => run(
            () => organizationApi.updateEnterprise(dialog.id, payload, token, tokenType),
            "Enterprise details updated",
          )}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}