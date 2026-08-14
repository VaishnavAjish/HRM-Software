import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  MapPin, Plus, RefreshCw, Search, Loader2, Pencil, Trash2, Power, PowerOff, Users, Shield,
} from "lucide-react";
import Badge from "../../../components/ui/Badge";
import Button from "../../../components/ui/Button";
import Card from "../../../components/ui/Card";
import CheckboxMultiSelect from "../../../components/ui/CheckboxMultiSelect";
import Drawer from "../../../components/ui/Drawer";
import Modal from "../../../components/ui/Modal";
import { SkeletonTable } from "../../../components/ui/Skeleton";
import { useAuth } from "../../../context/AuthContext";
import { useAuthorization } from "../../../hooks/useAuthorization";
import { adminUserApi, companyUnitApi } from "../../../utils/api";
import { organizationApi } from "../../../features/organization/services/organizationApi";

const inputClass =
  "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";
const labelClass = "mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400";

const STATUS_FILTERS = [
  { value: "ALL", label: "All" },
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
];

const KIND_FILTERS = [
  { value: "ALL", label: "All kinds" },
  { value: "branch", label: "Branch" },
  { value: "site", label: "Site" },
  { value: "warehouse", label: "Warehouse" },
  { value: "office", label: "Office" },
];

const KIND_BADGE = {
  branch: "blue", site: "purple", warehouse: "yellow", office: "green",
};

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

/*
 * The parent picker is built from the same unpaginated list the table shows.
 *
 * Options are indented by how deep they sit in the tree, and on edit the
 * location itself plus everything beneath it is excluded — a node cannot be
 * parked under one of its own descendants.
 */
function useLocationOptions(locations, excludedId) {
  return useMemo(() => {
    const excluded = new Set();

    if (excludedId != null) {
      const descend = (id) => {
        locations.forEach((location) => {
          if (location.parentId === id && !excluded.has(location.id)) {
            excluded.add(location.id);
            descend(location.id);
          }
        });
      };
      descend(excludedId);
      excluded.add(excludedId);
    }

    const byParent = new Map();
    locations.forEach((location) => {
      const key = location.parentId ?? 0;
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key).push(location);
    });

    const options = [];
    const add = (parentId, depth) => {
      (byParent.get(parentId) ?? []).forEach((location) => {
        if (!excluded.has(location.id)) {
          options.push({
            id: location.id,
            label: location.name,
            path: `${"—".repeat(depth)} ${location.name}`.trim(),
          });
          add(location.id, depth + 1);
        }
      });
    };

    add(0, 0);
    return options;
  }, [locations, excludedId]);
}

function LocationModal({ location, companies, options, busy, onSave, onClose }) {
  const isEdit = Boolean(location);
  const [companyId, setCompanyId] = useState(location?.companyId ?? "");
  const [parentId, setParentId] = useState(location?.parentId ?? "");
  const [name, setName] = useState(location?.name ?? "");
  const [code, setCode] = useState(location?.code ?? "");
  const [codeTouched, setCodeTouched] = useState(isEdit);
  const [kind, setKind] = useState(location?.kind ?? "branch");
  const [address, setAddress] = useState(location?.address ?? "");
  const [city, setCity] = useState(location?.city ?? "");
  const [state, setState] = useState(location?.state ?? "");
  const [countryCode, setCountryCode] = useState(location?.countryCode ?? "IN");
  const [postalCode, setPostalCode] = useState(location?.postalCode ?? "");
  const [latitude, setLatitude] = useState(location?.latitude ?? "");
  const [longitude, setLongitude] = useState(location?.longitude ?? "");
  const [contactEmail, setContactEmail] = useState(location?.contactEmail ?? "");
  const [contactPhone, setContactPhone] = useState(location?.contactPhone ?? "");

  const selectableCompanies = companies.filter((company) => company.id === location?.companyId || company.isActive);
  const lockedCompany = isEdit && location?.memberCount > 0;

  const canSave = name.trim() && code.trim() && companyId;

  const changeName = (value) => {
    setName(value);
    if (!codeTouched && !isEdit) setCode(slugify(value));
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={isEdit ? `Edit ${location.name}` : "Add location"}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            disabled={busy || !canSave}
            onClick={() => onSave({
              companyId: Number(companyId),
              parentId: parentId === "" ? null : Number(parentId),
              code: code.trim(),
              name: name.trim(),
              kind,
              address: address.trim(),
              city: city.trim(),
              state: state.trim(),
              countryCode: countryCode.trim().toUpperCase(),
              postalCode: postalCode.trim(),
              latitude: latitude === "" ? null : Number(latitude),
              longitude: longitude === "" ? null : Number(longitude),
              contactEmail: contactEmail.trim(),
              contactPhone: contactPhone.trim(),
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
              {selectableCompanies.map((company) => (
                <option key={company.id} value={company.id}>{company.name}</option>
              ))}
            </select>
            {lockedCompany && (
              <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
                Users are assigned here, so this location cannot be moved to another company.
              </span>
            )}
          </label>
          <label className="block">
            <span className={labelClass}>Parent location</span>
            <select
              className={inputClass}
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
            >
              <option value="">No parent</option>
              {options.map((option) => (
                <option key={option.id} value={option.id}>{option.path}</option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">
              Sub-locations sit under a location in the same company.
            </span>
          </label>
          <label className="block">
            <span className={labelClass}>Location name *</span>
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
            <span className={labelClass}>Kind *</span>
            <select className={inputClass} value={kind} onChange={(e) => setKind(e.target.value)}>
              {KIND_FILTERS.filter((item) => item.value !== "ALL").map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
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
            <span className={labelClass}>City</span>
            <input className={inputClass} value={city} onChange={(e) => setCity(e.target.value)} />
          </label>
          <label className="block">
            <span className={labelClass}>State</span>
            <input className={inputClass} value={state} onChange={(e) => setState(e.target.value)} />
          </label>
          <label className="block">
            <span className={labelClass}>Postal code</span>
            <input className={inputClass} value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className={labelClass}>Latitude</span>
              <input className={inputClass} value={latitude} onChange={(e) => setLatitude(e.target.value)} />
            </label>
            <label className="block">
              <span className={labelClass}>Longitude</span>
              <input className={inputClass} value={longitude} onChange={(e) => setLongitude(e.target.value)} />
            </label>
          </div>
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
          <span className={labelClass}>Address</span>
          <textarea className={inputClass} rows={2} value={address} onChange={(e) => setAddress(e.target.value)} />
        </label>
      </div>
    </Modal>
  );
}

function MembersDrawer({ location, members, candidates, canManage, busy, onAssign, onRemove, onClose }) {
  const [selected, setSelected] = useState([]);

  const assignedIds = useMemo(() => new Set(members.map((member) => member.userId)), [members]);
  const selectable = useMemo(
    () => candidates.filter((user) => !assignedIds.has(user.id)),
    [candidates, assignedIds],
  );

  const assign = () => {
    if (selected.length === 0) return;
    onAssign([...new Set(selected.map(Number))]);
    setSelected([]);
  };

  return (
    <Drawer
      isOpen
      onClose={onClose}
      title={`${location.name} — Members`}
      subtitle={`User assignments for this location (${members.length})`}
      size="md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
      }
    >
      <div className="space-y-4">
        {canManage && (
          <Card>
            <span className={labelClass}>Add members</span>
            <CheckboxMultiSelect
              ariaLabel="Users to add to this location"
              id="location-member-pick"
              options={selectable.map((user) => ({
                value: user.id,
                label: `${user.name}${user.empCode ? ` (${user.empCode})` : ""}`,
              }))}
              value={selected}
              onChange={setSelected}
              placeholder={selectable.length ? "Choose users…" : "No unassigned users"}
              emptyMessage="Everyone already belongs here."
            />
            <div className="mt-2 flex justify-end">
              <Button size="sm" disabled={busy || selected.length === 0} onClick={assign}>
                {busy && <Loader2 size={14} className="animate-spin" />}
                Update members ({selected.length})
              </Button>
            </div>
          </Card>
        )}

        <div className="space-y-2">
          {members.length === 0 && (
            <p className="rounded-lg border border-dashed border-gray-300 py-8 text-center text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
              No users assigned to this location yet.
            </p>
          )}

          {members.map((member) => (
            <div
              key={member.userId}
              className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-gray-900 dark:text-white">
                  {member.name || "—"}
                  <span className="ml-2 font-mono text-xs text-gray-500 dark:text-gray-400">{member.empCode || ""}</span>
                </div>
                <div className="truncate text-xs text-gray-500 dark:text-gray-400">{member.email || ""}</div>
              </div>
              {canManage && (
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Remove ${member.name || member.userId} from ${location.name}`}
                  onClick={() => onRemove(member.userId)}
                >
                  <Trash2 size={14} className="text-red-600 dark:text-red-400" />
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>
    </Drawer>
  );
}

export default function Locations() {
  const { user } = useAuth();
  const { can } = useAuthorization();
  const token = user?.accessToken;
  const tokenType = user?.tokenType || "Bearer";

  const [locations, setLocations] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [companyFilter, setCompanyFilter] = useState("");
  const [kindFilter, setKindFilter] = useState("ALL");

  const [dialog, setDialog] = useState(null);
  const [membersFor, setMembersFor] = useState(null);

  const reload = useCallback(() => {
    setLoading(true);
    setRefreshKey((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!token) return undefined;

    let active = true;

    Promise.all([
      organizationApi.locations(
        { search, status, company_id: companyFilter, kind: kindFilter },
        token, tokenType,
      ),
      companyUnitApi.companies({}, token, tokenType).catch(() => ({ data: [] })),
      adminUserApi.list({ page: 1, limit: 500 }, token, tokenType).catch(() => ({ data: [] })),
    ])
      .then(([locationsRes, companiesRes, usersRes]) => {
        if (!active) return;
        setLocations(locationsRes?.data ?? []);
        setCompanies(companiesRes?.data ?? []);
        setCandidates(usersRes?.data ?? []);
      })
      .catch((err) => { if (active) toast.error(err.message || "Could not load locations"); })
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, [token, tokenType, search, status, companyFilter, kindFilter, refreshKey]);

  useEffect(() => {
    if (!membersFor?.id || !token) return undefined;

    let active = true;

    organizationApi.locationMembers(membersFor.id, token, tokenType)
      .then((res) => { if (active) setMembers(res?.data ?? []); })
      .catch((err) => { if (active) toast.error(err.message || "Could not load members"); });

    return () => { active = false; };
  }, [membersFor?.id, token, tokenType, refreshKey]);

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
      ? organizationApi.updateLocation(dialog.id, payload, token, tokenType)
      : organizationApi.createLocation(payload, token, tokenType)),
    dialog?.id ? "Location updated" : "Location created",
  );

  const companyOptions = useMemo(
    () => companies.map((company) => ({ id: company.id, name: company.name, isActive: company.isActive })),
    [companies],
  );

  const parentOptions = useLocationOptions(locations, dialog?.id ?? null);

  const canManageLocations = can("org.location.create") || can("org.location.update");

  return (
    <div className="min-w-0 max-w-full space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-white">
          <MapPin size={20} /> Locations
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          The physical business structure — branches, sites, warehouses and offices — and which
          users are assigned to each.
        </p>
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              aria-label="Search locations"
              className={`${inputClass} w-64 pl-8`}
              placeholder="Search name, code or city…"
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
            aria-label="Filter by kind"
            className={`${inputClass} w-36`}
            value={kindFilter}
            onChange={(e) => changeFilter(setKindFilter)(e.target.value)}
          >
            {KIND_FILTERS.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
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
            {can("org.location.create") && (
              <Button onClick={() => setDialog({})}><Plus size={16} /> Add Location</Button>
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
                  <Th>Company</Th>
                  <Th>Parent</Th>
                  <Th>Kind</Th>
                  <Th>City</Th>
                  <Th>Members</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                {locations.length === 0 && (
                  <tr><td colSpan={8} className="p-10 text-center text-gray-500 dark:text-gray-400">
                    No locations match these filters.
                  </td></tr>
                )}

                {locations.map((location) => (
                  <tr key={location.id} className="hover:bg-gray-50/70 dark:hover:bg-gray-700/40">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-900 dark:text-white">{location.name}</div>
                      <div className="font-mono text-xs text-gray-500 dark:text-gray-400">{location.code}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{location.companyName}</td>
                    <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300">{location.parentName || "—"}</td>
                    <td className="px-4 py-3">
                      <Badge variant={KIND_BADGE[location.kind] || "gray"}>
                        {location.kind}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{location.city || "—"}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{location.memberCount}</td>
                    <td className="px-4 py-3">
                      <Badge variant={location.isActive ? "green" : "yellow"}>
                        {location.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" aria-label={`Members of ${location.name}`}
                          onClick={() => { setMembers([]); setMembersFor(location); }}>
                          <Users size={14} />
                        </Button>
                        {can("org.location.update") && (
                          <Button size="sm" variant="ghost" aria-label={`Edit ${location.name}`}
                            onClick={() => setDialog(location)}>
                            <Pencil size={14} />
                          </Button>
                        )}
                        {can("org.location.status") && (
                          <Button
                            size="sm" variant="ghost"
                            aria-label={`${location.isActive ? "Deactivate" : "Activate"} ${location.name}`}
                            onClick={() => run(
                              () => organizationApi.setLocationStatus(location.id, !location.isActive, token, tokenType),
                              location.isActive ? "Location deactivated" : "Location activated",
                            )}
                          >
                            {location.isActive ? <PowerOff size={14} /> : <Power size={14} />}
                          </Button>
                        )}
                        {can("org.location.delete") && (
                          <Button
                            size="sm" variant="ghost"
                            aria-label={`Delete ${location.name}`}
                            disabled={location.hasChildren || location.memberCount > 0}
                            title={location.hasChildren || location.memberCount > 0
                              ? "Cannot delete this location while sub-locations or users exist under it."
                              : "Delete location"}
                            onClick={() => run(
                              () => organizationApi.deleteLocation(location.id, token, tokenType),
                              "Location deleted",
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

      {!canManageLocations && !loading && (
        <p className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          <Shield size={13} className="text-gray-400" />
          You have read access to this master data. Creating and changing locations is restricted
          to administrators.
        </p>
      )}

      {dialog && (
        <LocationModal
          location={dialog.id ? dialog : null}
          companies={companyOptions}
          options={parentOptions}
          busy={busy}
          onSave={save}
          onClose={() => setDialog(null)}
        />
      )}

      {membersFor && (
        <MembersDrawer
          location={membersFor}
          members={members}
          candidates={candidates}
          canManage={can("org.location.update")}
          busy={busy}
          onAssign={(userIds) => run(
            () => organizationApi.assignLocationMembers(membersFor.id, userIds, token, tokenType),
            "Members assigned",
          )}
          onRemove={(userId) => run(
            () => organizationApi.removeLocationMember(membersFor.id, userId, token, tokenType),
            "Member removed",
          )}
          onClose={() => setMembersFor(null)}
        />
      )}
    </div>
  );
}