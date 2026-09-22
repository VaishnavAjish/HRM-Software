import { useMemo, useState } from "react";
import { Search, MapPin, Phone, Mail, Copy, Navigation, ShieldCheck, CircleDollarSign } from "lucide-react";
import toast from "react-hot-toast";
import Badge from "../../../components/ui/Badge";
import { SkeletonTable } from "../../../components/ui/Skeleton";
import { getHospitalContactPhotoUrl } from "../utils/formatters";

const smallInputClass = "rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2.5 py-1.5 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

/**
 * Searchable/filterable directory over the hospitals `useMediclaimLookups`
 * preloads once per workspace mount — this component takes them as props
 * rather than fetching its own copy, so switching tabs never re-fetches.
 *
 * Always excludes `status !== 'active'` hospitals regardless of the other
 * filters — `status` is a separate "temporarily hidden, not deleted" flag
 * (see the backend `HospitalController` docblock; an admin's actual Delete
 * is a permanent row removal), and this is the directory an employee
 * actually browses to decide where to go for treatment, so a hospital
 * marked inactive must never show up here as a live option — unlike the
 * admin's own raw management table, which deliberately still lists
 * inactive rows for reference/reactivation.
 *
 * Hospitals are one shared list, not scoped per company — every employee
 * across every company sees the same directory.
 *
 * Contact rows (`hospital.contacts`) are no longer necessarily empty — HR
 * can add a named "concern person" with a phone number and photo through
 * the admin Hospitals tab; a card with no contacts yet still degrades to a
 * plain "No contact on file yet" line.
 *
 * Each card also embeds a small Google Maps iframe (`?q=…&output=embed` —
 * no API key required), preferring the hospital's `latitude`/`longitude`
 * when the admin has set them and falling back to geocoding the free-text
 * address otherwise. Clicking the hospital's location line or the
 * "Directions" link opens `hospital.googleMapsUrl` verbatim when the admin
 * has pasted one (a share link straight from the Maps app/site — exact by
 * definition), falling back to the same lat/lng-or-address resolution the
 * embed uses.
 */
export default function HospitalDirectory({ hospitals = [], loading = false, error = null }) {
  const [search, setSearch] = useState("");
  const [networkOnly, setNetworkOnly] = useState(false);
  const [cashlessOnly, setCashlessOnly] = useState(false);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return hospitals.filter((h) => {
      // Inactive is the "deleted" state (hospitals are never hard-deleted —
      // see the backend HospitalController's docblock — so retired ones
      // stay in the data for old claims/cards to resolve). This directory
      // is what an employee actually browses to decide where to go for
      // treatment, so a retired hospital must never appear here regardless
      // of any other filter, unlike the admin's own raw management table
      // which still shows inactive rows on purpose.
      const status = String(h.status || "").toLowerCase();
      const isActive = !status || status === "active" || status === "1" || status === "true";
      const isNetwork = h.isNetworkHospital ?? h.is_network_hospital ?? true;
      const isCashless = h.cashlessAvailable ?? h.cashless_available ?? h.is_cashless ?? false;

      if (!isActive) return false;
      if (networkOnly && !isNetwork) return false;
      if (cashlessOnly && !isCashless) return false;
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
  const isNetwork = hospital.isNetworkHospital ?? hospital.is_network_hospital ?? true;
  const cashless = hospital.cashlessAvailable ?? hospital.cashless_available ?? hospital.is_cashless ?? false;
  const address = [hospital.address, hospital.city, hospital.state, hospital.pincode || hospital.pinCode].filter(Boolean).join(", ");

  const latitude = hospital.latitude ?? hospital.lat;
  const longitude = hospital.longitude ?? hospital.lng;
  const hasCoordinates = latitude !== null && latitude !== undefined && longitude !== null && longitude !== undefined && latitude !== "" && longitude !== "";
  // Plain `?q=`-based embed — no Maps Embed API key required. Coordinates
  // pin the exact spot the admin set; the address string is a best-effort
  // fallback (Google geocodes it) for a hospital nobody has pinned yet. A
  // pasted `googleMapsUrl` isn't used here — a share link (e.g.
  // `maps.app.goo.gl/…`) isn't embeddable via `output=embed`.
  const mapQuery = hasCoordinates ? `${latitude},${longitude}` : address;
  const mapEmbedSrc = mapQuery ? `https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&z=16&output=embed` : null;

  // What actually opens when the employee clicks the hospital's location.
  // The admin's pasted link — copied straight from the Maps app/site — wins
  // whenever it's set, since it's exactly the page the admin themselves
  // looked at; coordinates/address are only the fallback for a hospital
  // nobody has linked yet.
  const googleMapsUrl = hospital.googleMapsUrl || hospital.google_maps_url;
  const directionsHref = googleMapsUrl
    || (mapQuery ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(mapQuery)}` : null);

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-gray-900 dark:text-white">{hospital.name}</p>
          {directionsHref ? (
            <a
              href={directionsHref}
              target="_blank"
              rel="noopener noreferrer"
              title="Open this hospital's location"
              className="mt-0.5 flex items-center gap-1 text-xs text-brand-600 hover:underline dark:text-brand-400"
            >
              <MapPin size={12} /> {address || "View location"}
            </a>
          ) : (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
              <MapPin size={12} /> {address || "—"}
            </p>
          )}
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
            {contacts.map((contact) => {
              const photoUrl = getHospitalContactPhotoUrl(contact.photo);
              return (
                <div key={contact.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    {photoUrl ? (
                      <img
                        src={photoUrl}
                        alt={contact.name || "Contact"}
                        className="h-8 w-8 rounded-full object-cover"
                        onError={(e) => { e.currentTarget.style.display = "none"; }}
                      />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-[10px] font-semibold text-gray-500 dark:bg-gray-700 dark:text-gray-300">
                        {(contact.name || contact.designation || "?").charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p className="font-medium text-gray-700 dark:text-gray-200">{contact.name || contact.designation || "Contact"}</p>
                      <p className="text-gray-500 dark:text-gray-400">
                        {contact.designation && contact.name ? `${contact.designation} · ` : ""}
                        {contact.phone || contact.email || "—"}
                      </p>
                    </div>
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
              );
            })}
          </div>
        )}

        {mapEmbedSrc && (
          <div className="mt-3 overflow-hidden rounded-lg border border-gray-100 dark:border-gray-700">
            <iframe
              title={`${hospital.name} location`}
              src={mapEmbedSrc}
              className="h-32 w-full border-0"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        )}

        {directionsHref && (
          <a
            href={directionsHref}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400"
          >
            <Navigation size={12} /> Directions{(googleMapsUrl || hasCoordinates) ? "" : " (approximate)"}
          </a>
        )}
      </div>
    </div>
  );
}
