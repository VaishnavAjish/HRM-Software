import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { Search, MapPin, Phone, Mail, Copy, Navigation, ShieldCheck, CircleDollarSign } from "lucide-react";
import toast from "react-hot-toast";
import Badge from "../../../components/ui/Badge";
import { SkeletonTable } from "../../../components/ui/Skeleton";
import { getHospitalContactPhotoUrl } from "../utils/formatters";
const smallInputClass = "rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2.5 py-1.5 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";
export default function HospitalDirectory({ hospitals = [], loading = false, error = null }) {
  const [search, setSearch] = useState("");
  const [networkOnly, setNetworkOnly] = useState(false);
  const [cashlessOnly, setCashlessOnly] = useState(false);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return hospitals.filter((h) => {
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
  return /* @__PURE__ */ jsxs("div", { className: "space-y-4", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [
      /* @__PURE__ */ jsxs("div", { className: "relative min-w-[220px] max-w-sm flex-1", children: [
        /* @__PURE__ */ jsx(Search, { size: 15, className: "absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" }),
        /* @__PURE__ */ jsx(
          "input",
          {
            value: search,
            onChange: (e) => setSearch(e.target.value),
            placeholder: "Search name, city, specialty\u2026",
            className: `${smallInputClass} w-full pl-9`
          }
        )
      ] }),
      /* @__PURE__ */ jsxs("label", { className: "flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-300", children: [
        /* @__PURE__ */ jsx("input", { type: "checkbox", checked: networkOnly, onChange: (e) => setNetworkOnly(e.target.checked) }),
        " Network only"
      ] }),
      /* @__PURE__ */ jsxs("label", { className: "flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-300", children: [
        /* @__PURE__ */ jsx("input", { type: "checkbox", checked: cashlessOnly, onChange: (e) => setCashlessOnly(e.target.checked) }),
        " Cashless only"
      ] })
    ] }),
    loading ? /* @__PURE__ */ jsx(SkeletonTable, { rows: 4 }) : error ? /* @__PURE__ */ jsx("p", { className: "py-10 text-center text-sm text-red-500", children: error }) : filtered.length === 0 ? /* @__PURE__ */ jsx("p", { className: "py-10 text-center text-sm text-gray-500 dark:text-gray-400", children: hospitals.length === 0 ? "No hospitals have been added yet." : "No hospitals match these filters." }) : /* @__PURE__ */ jsx("div", { className: "grid grid-cols-1 gap-3 md:grid-cols-2", children: filtered.map((hospital) => /* @__PURE__ */ jsx(HospitalCard, { hospital, onCopy: copyToClipboard }, hospital.id ?? hospital.hospitalId)) })
  ] });
}
function HospitalCard({ hospital, onCopy }) {
  const contacts = hospital.contacts || hospital.hospitalContacts || [];
  const specialties = hospital.specialties || hospital.specialities || [];
  const isNetwork = hospital.isNetworkHospital ?? hospital.is_network_hospital ?? true;
  const cashless = hospital.cashlessAvailable ?? hospital.cashless_available ?? hospital.is_cashless ?? false;
  const address = [hospital.address, hospital.city, hospital.state, hospital.pincode || hospital.pinCode].filter(Boolean).join(", ");
  const latitude = hospital.latitude ?? hospital.lat;
  const longitude = hospital.longitude ?? hospital.lng;
  const hasCoordinates = latitude !== null && latitude !== void 0 && longitude !== null && longitude !== void 0 && latitude !== "" && longitude !== "";
  const mapQuery = hasCoordinates ? `${latitude},${longitude}` : address;
  const mapEmbedSrc = mapQuery ? `https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&z=16&output=embed` : null;
  const googleMapsUrl = hospital.googleMapsUrl || hospital.google_maps_url;
  const directionsHref = googleMapsUrl || (mapQuery ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(mapQuery)}` : null);
  return /* @__PURE__ */ jsxs("div", { className: "rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex items-start justify-between gap-2", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("p", { className: "font-semibold text-gray-900 dark:text-white", children: hospital.name }),
        directionsHref ? /* @__PURE__ */ jsxs(
          "a",
          {
            href: directionsHref,
            target: "_blank",
            rel: "noopener noreferrer",
            title: "Open this hospital's location",
            className: "mt-0.5 flex items-center gap-1 text-xs text-brand-600 hover:underline dark:text-brand-400",
            children: [
              /* @__PURE__ */ jsx(MapPin, { size: 12 }),
              " ",
              address || "View location"
            ]
          }
        ) : /* @__PURE__ */ jsxs("p", { className: "mt-0.5 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400", children: [
          /* @__PURE__ */ jsx(MapPin, { size: 12 }),
          " ",
          address || "\u2014"
        ] })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex flex-col items-end gap-1", children: [
        isNetwork && /* @__PURE__ */ jsxs(Badge, { variant: "blue", children: [
          /* @__PURE__ */ jsx(ShieldCheck, { size: 11, className: "mr-1 inline" }),
          "Network"
        ] }),
        cashless && /* @__PURE__ */ jsxs(Badge, { variant: "green", children: [
          /* @__PURE__ */ jsx(CircleDollarSign, { size: 11, className: "mr-1 inline" }),
          "Cashless"
        ] })
      ] })
    ] }),
    specialties.length > 0 && /* @__PURE__ */ jsx("div", { className: "mt-2 flex flex-wrap gap-1", children: specialties.map((s) => /* @__PURE__ */ jsx("span", { className: "rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600 dark:bg-gray-700 dark:text-gray-300", children: s }, s)) }),
    /* @__PURE__ */ jsxs("div", { className: "mt-3 border-t border-gray-100 pt-3 dark:border-gray-700", children: [
      contacts.length === 0 ? /* @__PURE__ */ jsx("p", { className: "text-xs text-gray-400", children: "No contact on file yet." }) : /* @__PURE__ */ jsx("div", { className: "space-y-2", children: contacts.map((contact) => {
        const photoUrl = getHospitalContactPhotoUrl(contact.photo);
        return /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center justify-between gap-2 text-xs", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
            photoUrl ? /* @__PURE__ */ jsx(
              "img",
              {
                src: photoUrl,
                alt: contact.name || "Contact",
                className: "h-8 w-8 rounded-full object-cover",
                onError: (e) => {
                  e.currentTarget.style.display = "none";
                }
              }
            ) : /* @__PURE__ */ jsx("div", { className: "flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-[10px] font-semibold text-gray-500 dark:bg-gray-700 dark:text-gray-300", children: (contact.name || contact.designation || "?").charAt(0).toUpperCase() }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("p", { className: "font-medium text-gray-700 dark:text-gray-200", children: contact.name || contact.designation || "Contact" }),
              /* @__PURE__ */ jsxs("p", { className: "text-gray-500 dark:text-gray-400", children: [
                contact.designation && contact.name ? `${contact.designation} \xB7 ` : "",
                contact.phone || contact.email || "\u2014"
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1", children: [
            contact.phone && /* @__PURE__ */ jsxs(Fragment, { children: [
              /* @__PURE__ */ jsx("a", { title: "Call", href: `tel:${contact.phone}`, className: "rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700", children: /* @__PURE__ */ jsx(Phone, { size: 13 }) }),
              /* @__PURE__ */ jsx("button", { title: "Copy phone", onClick: () => onCopy(contact.phone, "Phone number"), className: "rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700", children: /* @__PURE__ */ jsx(Copy, { size: 13 }) })
            ] }),
            contact.email && /* @__PURE__ */ jsx("a", { title: "Email", href: `mailto:${contact.email}`, className: "rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700", children: /* @__PURE__ */ jsx(Mail, { size: 13 }) })
          ] })
        ] }, contact.id);
      }) }),
      mapEmbedSrc && /* @__PURE__ */ jsx("div", { className: "mt-3 overflow-hidden rounded-lg border border-gray-100 dark:border-gray-700", children: /* @__PURE__ */ jsx(
        "iframe",
        {
          title: `${hospital.name} location`,
          src: mapEmbedSrc,
          className: "h-32 w-full border-0",
          loading: "lazy",
          referrerPolicy: "no-referrer-when-downgrade"
        }
      ) }),
      directionsHref && /* @__PURE__ */ jsxs(
        "a",
        {
          href: directionsHref,
          target: "_blank",
          rel: "noopener noreferrer",
          className: "mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400",
          children: [
            /* @__PURE__ */ jsx(Navigation, { size: 12 }),
            " Directions",
            googleMapsUrl || hasCoordinates ? "" : " (approximate)"
          ]
        }
      )
    ] })
  ] });
}
