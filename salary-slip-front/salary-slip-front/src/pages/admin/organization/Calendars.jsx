import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  CalendarDays, Plus, Star, RefreshCw, Search, Loader2, Pencil, Trash2, Power, PowerOff, Shield, ChevronLeft, ChevronRight,
} from "lucide-react";
import Badge from "../../../components/ui/Badge";
import Button from "../../../components/ui/Button";
import Card from "../../../components/ui/Card";
import DatePicker from "../../../components/ui/DatePicker";
import Drawer from "../../../components/ui/Drawer";
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

/*
 * The work week is stored as an array of 3-letter keys. A null value on the
 * record means "Mon–Fri by default", which is what a brand new company should
 * get without anyone configuring anything.
 */
const DAYS = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
];

const HOLIDAY_KINDS = [
  { value: "holiday", label: "Holiday" },
  { value: "optional", label: "Optional" },
  { value: "workday", label: "Workday" },
];

const KIND_BADGE = { holiday: "red", optional: "yellow", workday: "green" };

function summarizeWorkWeek(workWeek) {
  if (!workWeek || workWeek.length === 0) return "Mon–Fri (default)";
  if (workWeek.length === 7) return "All days";
  return workWeek.map((key) => DAYS.find((day) => day.key === key)?.label || key).join(", ");
}

function Th({ children, className = "" }) {
  return <th scope="col" className={`px-4 py-3 whitespace-nowrap ${className}`}>{children}</th>;
}

function CalendarModal({ calendar, companies, units, busy, onSave, onClose }) {
  const isEdit = Boolean(calendar);
  const [companyId, setCompanyId] = useState(calendar?.companyId ?? "");
  const [unitId, setUnitId] = useState(calendar?.unitId ?? "");
  const [name, setName] = useState(calendar?.name ?? "");
  const [description, setDescription] = useState(calendar?.description ?? "");
  const [workWeek, setWorkWeek] = useState(
    calendar?.workWeek?.length ? calendar.workWeek : ["mon", "tue", "wed", "thu", "fri"],
  );

  const normalizedUnitId = unitId === "" ? null : Number(unitId);
  const scopeUnits = units.filter((unit) => unit.companyId === Number(companyId));
  const companyLocked = isEdit && Boolean(calendar?.unitId);

  const toggleDay = (key) => {
    setWorkWeek((current) => (
      current.includes(key) ? current.filter((day) => day !== key) : [...current, key]
    ));
  };

  const canSave = name.trim() && companyId;

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={isEdit ? `Edit ${calendar.name}` : "Add calendar"}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            disabled={busy || !canSave}
            onClick={() => onSave({
              companyId: Number(companyId),
              unitId: normalizedUnitId,
              name: name.trim(),
              description: description.trim(),
              workWeek,
            })}
          >
            {busy && <Loader2 size={16} className="animate-spin" />}
            Save
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className={labelClass}>Calendar name *</span>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={labelClass}>Company *</span>
            <select
              className={inputClass}
              value={companyId}
              disabled={companyLocked}
              onChange={(e) => { setCompanyId(e.target.value); setUnitId(""); }}
            >
              <option value="">Select company</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>{company.name}</option>
              ))}
            </select>
            {companyLocked && (
              <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                Per-unit calendars are fixed to their company.
              </span>
            )}
          </label>
          <label className="block">
            <span className={labelClass}>Unit (optional)</span>
            <select
              className={inputClass}
              value={unitId}
              disabled={!companyId}
              onChange={(e) => setUnitId(e.target.value)}
            >
              <option value="">Company default</option>
              {scopeUnits.map((unit) => (
                <option key={unit.id} value={unit.id}>{unit.name}</option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
              Leave blank for a calendar that applies to the whole company.
            </span>
          </label>
        </div>

        <label className="block">
          <span className={labelClass}>Description</span>
          <textarea className={inputClass} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>

        <div>
          <span className={labelClass}>Work week *</span>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((day) => {
              const on = workWeek.includes(day.key);
              return (
                <button
                  key={day.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleDay(day.key)}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors ${
                    on
                      ? "border-brand-600 bg-brand-600 text-white"
                      : "border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                  }`}
                >
                  {day.label}
                </button>
              );
            })}
          </div>
          <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
            Pick the working days. A "workday" holiday can only be added to a weekly pattern that
            does not already work that day.
          </span>
        </div>
      </div>
    </Modal>
  );
}

function HolidaysDrawer({ calendar, year, onYearChange, holidays, busy, onSave, onDelete, onClose }) {
  const [date, setDate] = useState("");
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("holiday");
  const [isHalfDay, setIsHalfDay] = useState(false);
  const [recurring, setRecurring] = useState(false);

  const reset = () => { setDate(""); setTitle(""); setKind("holiday"); setIsHalfDay(false); setRecurring(false); };

  const submit = () => {
    if (!date || !title.trim()) return;
    onSave({ date, title: title.trim(), kind, isHalfDay, recurring: recurring ? "annual" : null });
    reset();
  };

  return (
    <Drawer
      isOpen
      onClose={onClose}
      title={`${calendar.name} — Holidays`}
      subtitle={`Non-working days on this calendar${calendar.unitName ? ` (${calendar.unitName})` : " (company default)"}`}
      size="lg"
      headerExtra={
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" aria-label="Previous year" onClick={() => onYearChange(year - 1)}>
            <ChevronLeft size={15} />
          </Button>
          <span className="min-w-12 text-center text-sm font-semibold text-gray-700 dark:text-gray-200">{year}</span>
          <Button size="sm" variant="ghost" aria-label="Next year" onClick={() => onYearChange(year + 1)}>
            <ChevronRight size={15} />
          </Button>
        </div>
      }
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Card>
          <span className={labelClass}>Add holiday</span>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <DatePicker aria-label="Holiday date" value={date} onChange={setDate} placeholder="Date" />
            <input
              aria-label="Holiday title"
              className={inputClass}
              placeholder="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <select
              aria-label="Holiday kind"
              className={inputClass}
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              {HOLIDAY_KINDS.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  checked={isHalfDay}
                  onChange={(e) => setIsHalfDay(e.target.checked)}
                />
                Half day
              </label>
              <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  checked={recurring}
                  onChange={(e) => setRecurring(e.target.checked)}
                />
                Annual
              </label>
            </div>
          </div>
          <div className="mt-2 flex justify-end">
            <Button size="sm" disabled={busy || !date || !title.trim()} onClick={submit}>
              {busy && <Loader2 size={14} className="animate-spin" />}
              Add holiday
            </Button>
          </div>
        </Card>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 text-xs font-bold uppercase tracking-wider text-gray-600 dark:border-gray-700 dark:text-gray-300">
              <tr>
                <th className="py-2 pr-3">Date</th>
                <th className="py-2 pr-3">Title</th>
                <th className="py-2 pr-3">Kind</th>
                <th className="py-2 pr-3">Type</th>
                <th className="py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
              {holidays.length === 0 && (
                <tr><td colSpan={5} className="py-10 text-center text-gray-500 dark:text-gray-400">
                  No holidays for {year}.
                </td></tr>
              )}

              {holidays.map((holiday) => (
                <tr key={holiday.id} className="hover:bg-gray-50/70 dark:hover:bg-gray-700/40">
                  <td className="py-2.5 pr-3 text-gray-900 dark:text-white">{holiday.date}</td>
                  <td className="py-2.5 pr-3 text-gray-900 dark:text-white">{holiday.title}</td>
                  <td className="py-2.5 pr-3">
                    <Badge variant={KIND_BADGE[holiday.kind] || "gray"}>{holiday.kind}</Badge>
                  </td>
                  <td className="py-2.5 pr-3 text-xs text-gray-600 dark:text-gray-300">
                    {holiday.isHalfDay ? "Half day" : "Full day"}
                    {holiday.recurring ? " · annual" : ""}
                  </td>
                  <td className="py-2.5 text-right">
                    <Button
                      size="sm" variant="ghost"
                      aria-label={`Delete holiday ${holiday.title}`}
                      onClick={() => onDelete(holiday.id)}
                    >
                      <Trash2 size={14} className="text-red-600 dark:text-red-400" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Drawer>
  );
}

export default function Calendars() {
  const { user } = useAuth();
  const { can } = useAuthorization();
  const token = user?.accessToken;
  const tokenType = user?.tokenType || "Bearer";

  const [calendars, setCalendars] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [units, setUnits] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [companyFilter, setCompanyFilter] = useState("");

  const [dialog, setDialog] = useState(null);
  const [holidaysFor, setHolidaysFor] = useState(null);
  const [holidayYear, setHolidayYear] = useState(new Date().getFullYear());

  const reload = useCallback(() => {
    setLoading(true);
    setRefreshKey((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!token) return undefined;

    let active = true;

    Promise.all([
      organizationApi.calendars(
        { search, status, company_id: companyFilter },
        token, tokenType,
      ),
      companyUnitApi.companies({}, token, tokenType).catch(() => ({ data: [] })),
      companyUnitApi.units({ companyIds: companyFilter ? [companyFilter] : [] }, token, tokenType).catch(() => ({ data: [] })),
    ])
      .then(([calendarsRes, companiesRes, unitsRes]) => {
        if (!active) return;
        setCalendars(calendarsRes?.data ?? []);
        setCompanies(companiesRes?.data ?? []);
        setUnits(unitsRes?.data ?? []);
      })
      .catch((err) => { if (active) toast.error(err.message || "Could not load calendars"); })
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, [token, tokenType, search, status, companyFilter, refreshKey]);

  useEffect(() => {
    if (!holidaysFor?.id || !token) return undefined;

    let active = true;

    organizationApi.calendarHolidays(holidaysFor.id, holidayYear, token, tokenType)
      .then((res) => { if (active) setHolidays(res?.data ?? []); })
      .catch((err) => { if (active) toast.error(err.message || "Could not load holidays"); });

    return () => { active = false; };
  }, [holidaysFor?.id, holidayYear, token, tokenType, refreshKey]);

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
      ? organizationApi.updateCalendar(dialog.id, payload, token, tokenType)
      : organizationApi.createCalendar(payload, token, tokenType)),
    dialog?.id ? "Calendar updated" : "Calendar created",
  );

  const companyOptions = useMemo(
    () => companies.map((company) => ({ id: company.id, name: company.name, isActive: company.isActive })),
    [companies],
  );

  const unitOptions = useMemo(
    () => units.map((unit) => ({ id: unit.id, name: unit.name, companyId: unit.companyId })),
    [units],
  );

  const canManageCalendars = can("org.calendar.create") || can("org.calendar.update");

  return (
    <div className="min-w-0 max-w-full space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-white">
          <CalendarDays size={20} /> Calendars
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Working-day calendars per company or unit, and the holidays that break them.
        </p>
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              aria-label="Search calendars"
              className={`${inputClass} w-64 pl-8`}
              placeholder="Search name…"
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
            {can("org.calendar.create") && (
              <Button onClick={() => setDialog({})}><Plus size={16} /> Add Calendar</Button>
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
                  <Th>Scope</Th>
                  <Th>Work week</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                {calendars.length === 0 && (
                  <tr><td colSpan={5} className="p-10 text-center text-gray-500 dark:text-gray-400">
                    No calendars match these filters.
                  </td></tr>
                )}

                {calendars.map((calendar) => (
                  <tr key={calendar.id} className="hover:bg-gray-50/70 dark:hover:bg-gray-700/40">
                    <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">{calendar.name}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                      {calendar.unitName || <Badge variant="blue">Company default</Badge>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300">
                      {summarizeWorkWeek(calendar.workWeek)}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={calendar.isActive ? "green" : "yellow"}>
                        {calendar.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" aria-label={`Holidays of ${calendar.name}`}
                          onClick={() => { setHolidays([]); setHolidaysFor(calendar); }}>
                          <Star size={14} />
                        </Button>
                        {can("org.calendar.update") && (
                          <Button size="sm" variant="ghost" aria-label={`Edit ${calendar.name}`}
                            onClick={() => setDialog(calendar)}>
                            <Pencil size={14} />
                          </Button>
                        )}
                        {can("org.calendar.status") && (
                          <Button
                            size="sm" variant="ghost"
                            aria-label={`${calendar.isActive ? "Deactivate" : "Activate"} ${calendar.name}`}
                            onClick={() => run(
                              () => organizationApi.setCalendarStatus(calendar.id, !calendar.isActive, token, tokenType),
                              calendar.isActive ? "Calendar deactivated" : "Calendar activated",
                            )}
                          >
                            {calendar.isActive ? <PowerOff size={14} /> : <Power size={14} />}
                          </Button>
                        )}
                        {can("org.calendar.delete") && (
                          <Button
                            size="sm" variant="ghost"
                            aria-label={`Delete ${calendar.name}`}
                            /*
                             * Disabled, not hidden. A calendar that owns holidays
                             * cannot be removed while they exist — the balance
                             * printed from it would silently change. The API
                             * refuses independently either way.
                             */
                            disabled={calendar.holidayCount > 0}
                            title={calendar.holidayCount > 0
                              ? "Cannot delete this calendar while holidays exist on it. Delete its holidays first."
                              : "Delete calendar"}
                            onClick={() => run(
                              () => organizationApi.deleteCalendar(calendar.id, token, tokenType),
                              "Calendar deleted",
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

      {!canManageCalendars && !loading && (
        <p className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          <Shield size={13} className="text-gray-400" />
          You have read access to this master data. Creating and changing calendars is restricted
          to administrators.
        </p>
      )}

      {dialog && (
        <CalendarModal
          calendar={dialog.id ? dialog : null}
          companies={companyOptions}
          units={unitOptions}
          busy={busy}
          onSave={save}
          onClose={() => setDialog(null)}
        />
      )}

      {holidaysFor && (
        <HolidaysDrawer
          calendar={holidaysFor}
          year={holidayYear}
          onYearChange={setHolidayYear}
          holidays={holidays}
          busy={busy}
          onSave={(payload) => run(
            () => organizationApi.upsertHoliday(holidaysFor.id, payload, token, tokenType),
            "Holiday saved",
          )}
          onDelete={(holidayId) => run(
            () => organizationApi.deleteHoliday(holidaysFor.id, holidayId, token, tokenType),
            "Holiday deleted",
          )}
          onClose={() => setHolidaysFor(null)}
        />
      )}
    </div>
  );
}