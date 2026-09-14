import { useMemo, useState } from "react";
import { Search, MapPin, Phone, Mail, Copy, Navigation, ShieldCheck, CircleDollarSign } from "lucide-react";
import toast from "react-hot-toast";
import Badge from "../../../components/ui/Badge";
import { SkeletonTable } from "../../../components/ui/Skeleton";

const smallInputClass = "rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2.5 py-1.5 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

/**
 * Searchable/filterable directory over the hospitals `useMediclaimLookups`
 * preloads once per workspace mount — this component takes them as props
 * rather than fetching its own copy, so switching tabs never re-fetches.
 *
 * Contact rows (`hospital.contacts`) are seeded empty per the backend
 * plan's B2 seed data ("HR enters those" post-launch) — every contact
 * action degrades to a plain "No contact on file yet" line instead of
 * crashing or rendering broken call/email/copy/directions controls.
 */
export default function HospitalDirectory({ hospitals = [], loading = false, error = null }) {
  const [search, setSearch] = useState("");
  const [networkOnly, setNetworkOnly] = useState(false);
  const [cashlessOnly, setCashlessOnly] = useState(false);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return hospitals.filter((h) => {
      if (networkOnly && !(h.isNetworkHospital ?? h.is_network_hospital)) return false;
      if (cashlessOnly && !(h.cashlessAvailable ?? h.cashless_available)) return false;
      if (!term) return true;
      const specialties = h.specialties || h.specialities || [];
      const haystack = [h.name, h.city, h.state, ...specialties].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(term);
    });
  }, [hospitals, search, networkOnly, cashlessOnly]);

  const copyToClipboard = async (value, label) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error(`Could not copy ${label.toLowerCase()}`);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] max-w-sm flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, city, specialty…"
            className={`${smallInputClass} w-full pl-9`}
          />
        </div>
        <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-300">
          <input type="checkbox" checked={networkOnly} onChange={(e) => setNetworkOnly(e.target.checked)} /> Network only
        </label>
        <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-300">
          <input type="checkbox" checked={cashlessOnly} onChange={(e) => setCashlessOnly(e.target.checked)} /> Cashless only
        </label>
      </div>

      {loading ? (
        <SkeletonTable rows={4} />
      ) : error ? (
        <p className="py-10 text-center text-sm text-red-500">{error}</p>
      ) : filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
          {hospitals.length === 0 ? "No hospitals have been added yet." : "No hospitals match these filters."}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {filtered.map((hospital) => (
            <HospitalCard key={hospital.id ?? hospital.hospitalId} hospital={hospital} onCopy={copyToClipboard} />
          ))}
        </div>
      )}
    </div>
  );
}

function HospitalCard({ hospital, onCopy }) {
  const contacts = hospital.contacts || hospital.hospitalContacts || [];
  const specialties = hospital.specialties || hospital.specialities || [];
  const isNetwork = hospital.isNetworkHospital ?? hospital.is_network_hospital;
  const cashless = hospital.cashlessAvailable ?? hospital.cashless_available;
  const address = [hospital.address, hospital.city, hospital.state, hospital.pincode || hospital.pinCode].filter(Boolean).join(", ");

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-gray-900 dark:text-white">{hospital.name}</p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
            <MapPin size={12} /> {address || "—"}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {isNetwork && (
            <Badge variant="blue">
              <ShieldCheck size={11} className="mr-1 inline" />Network
            </Badge>
          )}
          {cashless && (
            <Badge variant="green">
              <CircleDollarSign size={11} className="mr-1 inline" />Cashless
            </Badge>
          )}
        </div>
      </div>

      {specialties.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {specialties.map((s) => (
            <span key={s} className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600 dark:bg-gray-700 dark:text-gray-300">
              {s}
            </span>
          ))}
        </div>
      )}

      <div className="mt-3 border-t border-gray-100 pt-3 dark:border-gray-700">
        {contacts.length === 0 ? (
          <p className="text-xs text-gray-400">No contact on file yet.</p>
        ) : (
          <div className="space-y-2">
            {contacts.map((contact) => (
              <div key={contact.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div>
                  <p className="font-medium text-gray-700 dark:text-gray-200">{contact.designation || "Contact"}</p>
                  <p className="text-gray-500 dark:text-gray-400">{contact.phone || contact.email || "—"}</p>
                </div>
                <div className="flex items-center gap-1">
                  {contact.phone && (
                    <>
                      <a title="Call" href={`tel:${contact.phone}`} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
                        <Phone size={13} />
                      </a>
                      <button title="Copy phone" onClick={() => onCopy(contact.phone, "Phone number")} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
                        <Copy size={13} />
                      </button>
                    </>
                  )}
                  {contact.email && (
                    <a title="Email" href={`mailto:${contact.email}`} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
                      <Mail size={13} />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {address && (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400"
          >
            <Navigation size={12} /> Directions
          </a>
        )}
      </div>
    </div>
  );
}
