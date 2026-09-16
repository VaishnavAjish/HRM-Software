import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { ShieldCheck, ShieldAlert, Building2, MapPin, Phone, CalendarClock } from "lucide-react";
import Card from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import { SkeletonCard } from "../../components/ui/Skeleton";
import { mediclaimApi } from "../../features/mediclaim/services/mediclaimApi";
import { formatClaimDate } from "../../features/mediclaim/utils/formatters";

/*
 * Public, unauthenticated landing page for a Mediclaim card's QR code.
 *
 * `CardViewer.jsx` (F3) encodes `${origin}/mediclaim/verify/{verifyToken}`
 * into the QR it shows for each card — this is that route's target. It is
 * reached by a phone camera, not by navigating the app, so it deliberately
 * has no sidebar, no AppLayout and no useAuth() dependency — it must render
 * correctly for a visitor who has never logged in. Matches the isolation
 * pattern of `CandidateQuiz.jsx` / `AboutNiss.jsx`.
 *
 * Renders exactly the whitelisted fields the backend's public verify
 * response is designed to return (plan B6: valid, member_name,
 * member_number_masked, policy_number_masked, company, insurer_name,
 * valid_from, valid_to, approved_hospitals[], emergency_contact) — nothing
 * else. On any failure this shows one fixed, generic message and never the
 * underlying error detail: the backend deliberately returns an identical
 * response for "token never existed" vs "card revoked" so an unauthenticated
 * caller can't tell the two apart, and a diagnostic message here would leak
 * that distinction right back.
 */
export default function MediclaimCardVerify() {
  const { token } = useParams();
  const [result, setResult] = useState({ token: null, card: null, invalid: false });

  useEffect(() => {
    let cancelled = false;

    mediclaimApi.verifyCard(token)
      .then((res) => {
        if (cancelled) return;
        // Every other single-object endpoint in this client wraps its
        // payload as `{ data: {...} }` (see MyCoverageTab's `res?.data`
        // convention for `myCoverage()`) — fall back to the bare object in
        // case this endpoint's response isn't wrapped the same way.
        const payload = res?.data ?? res;
        if (payload?.valid) {
          setResult({ token, card: payload, invalid: false });
        } else {
          setResult({ token, card: null, invalid: true });
        }
      })
      .catch(() => {
        if (cancelled) return;
        setResult({ token, card: null, invalid: true });
      });

    return () => { cancelled = true; };
  }, [token]);

  const state = result.token === token
    ? { loading: false, card: result.card, invalid: result.invalid }
    : { loading: true, card: null, invalid: false };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-sm">
        <p className="mb-4 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
          NISS HRMS &middot; Mediclaim Card Verification
        </p>

        {state.loading ? (
          <SkeletonCard />
        ) : state.invalid ? (
          <InvalidCard />
        ) : (
          <ValidCard card={state.card} />
        )}
      </div>
    </div>
  );
}

function InvalidCard() {
  return (
    <Card className="text-center">
      <ShieldAlert size={40} className="mx-auto text-red-500" />
      <h1 className="mt-3 text-lg font-semibold text-gray-900 dark:text-white">
        This card could not be verified
      </h1>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
        This QR code does not correspond to an active Mediclaim card. If you believe this is an
        error, please contact your HR / Mediclaim coordinator.
      </p>
    </Card>
  );
}

function ValidCard({ card }) {
  const hospitals = Array.isArray(card?.approved_hospitals) ? card.approved_hospitals : [];
  const contact = card?.emergency_contact || null;
  const hasContact = Boolean(contact?.designation || contact?.phone);

  return (
    <div className="space-y-4">
      <Card className="text-center">
        <ShieldCheck size={36} className="mx-auto text-emerald-500" />
        <Badge variant="green" className="mt-2">Verified Mediclaim Card</Badge>
        <h1 className="mt-2 text-xl font-bold text-gray-900 dark:text-white break-words">
          {card?.member_name || "—"}
        </h1>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{card?.company || "—"}</p>

        <dl className="mt-4 grid grid-cols-2 gap-3 text-left">
          <Field label="Member No." value={card?.member_number_masked} />
          <Field label="Policy No." value={card?.policy_number_masked} />
          <Field label="Insurer" value={card?.insurer_name} />
        </dl>

        {(card?.valid_from || card?.valid_to) && (
          <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <CalendarClock size={13} className="shrink-0" />
            <span>
              Valid {formatClaimDate(card?.valid_from)} – {formatClaimDate(card?.valid_to)}
            </span>
          </p>
        )}
      </Card>

      {hospitals.length > 0 && (
        <Card>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-white">
            <Building2 size={15} /> Approved Hospitals
          </h2>
          <ul className="mt-3 space-y-2.5">
            {hospitals.map((h, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                <MapPin size={14} className="mt-0.5 shrink-0 text-gray-400" />
                <span className="break-words">
                  {h?.name || "—"}
                  {h?.city && <span className="text-gray-400"> &middot; {h.city}</span>}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {hasContact && (
        <Card>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-white">
            <Phone size={15} /> Emergency Contact
          </h2>
          {contact.designation && (
            <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">{contact.designation}</p>
          )}
          {contact.phone && (
            <a
              href={`tel:${contact.phone}`}
              className="mt-1 inline-block text-sm font-semibold text-brand-600 dark:text-brand-400"
            >
              {contact.phone}
            </a>
          )}
        </Card>
      )}
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-wide text-gray-400">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-semibold text-gray-900 dark:text-white">
        {value || "—"}
      </dd>
    </div>
  );
}
