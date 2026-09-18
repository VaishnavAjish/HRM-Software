import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import { authApi } from "../../../utils/api";
import { getEmployeePhotoUrl } from "../../../pages/admin/AdminModals/employee-helpers";
import { mediclaimApi } from "../services/mediclaimApi";
import MediclaimIdCard from "./MediclaimIdCard";

/**
 * The employee's own Mediclaim cards — one per approved covered member —
 * rendered via the shared `MediclaimIdCard` (photo, QR, member details,
 * "View Card" image popup), the same visual the admin `EmployeesTab.jsx`
 * detail drawer now also uses for the same data.
 *
 * Only the "self" card can show a real photo: `GET /me/cards` returns raw
 * `MediclaimCard`/`MediclaimMember` rows, and dependents (spouse/child/
 * parent) aren't `users` in this system, so they have no photo of their own
 * to fetch. The employee's own photo comes from `GET /profile` (the same
 * call `Profile.jsx` already uses) — a lightweight, independent fetch that
 * degrades to an initials avatar if it fails, without blocking the cards
 * themselves from rendering.
 *
 * `onLoaded` (optional) fires once with the resolved cards array after a
 * successful fetch — `MediclaimInfoTab.jsx`'s dashboard uses it to drive the
 * "Cards" stat tile's count without fetching `myCards()` a second time
 * itself.
 */
export default function CardViewer({ onLoaded }) {
  const { user } = useAuth();
  const accessToken = user?.accessToken;
  const tokenType = user?.tokenType;
  const requestKey = `${accessToken ?? ""}|${tokenType ?? ""}`;
  const [result, setResult] = useState({ key: null, cards: [], error: null });
  const [employeeProfile, setEmployeeProfile] = useState(null);

  useEffect(() => {
    if (!accessToken) return undefined;
    let cancelled = false;

    mediclaimApi.myCards(accessToken, tokenType)
      .then((res) => {
        if (cancelled) return;
        const payload = res?.data;
        const cards = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
        setResult({ key: requestKey, cards, error: null });
        onLoaded?.(cards);
      })
      .catch((err) => {
        if (cancelled) return;
        setResult({ key: requestKey, cards: [], error: err?.message || "Failed to load Mediclaim cards." });
      });

    return () => { cancelled = true; };
    // `onLoaded` is a fire-once-per-fetch callback, not reactive state —
    // including it would re-run the fetch whenever the caller re-renders
    // with a new inline function reference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, tokenType, requestKey]);

  useEffect(() => {
    if (!accessToken) return undefined;
    let cancelled = false;
    authApi.getProfile(accessToken, tokenType)
      .then((res) => {
        if (cancelled) return;
        setEmployeeProfile(res?.data || res?.user || res || null);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [accessToken, tokenType]);

  const state = { loading: result.key !== requestKey, cards: result.cards, error: result.error };

  if (state.loading) {
    return (
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="h-48 animate-pulse rounded-2xl bg-gray-100 dark:bg-gray-700/40" />
        ))}
      </div>
    );
  }

  if (state.error) {
    return <p className="py-16 text-center text-sm text-red-500">{state.error}</p>;
  }

  if (state.cards.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white py-16 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <ShieldCheck size={28} className="mx-auto mb-2 text-gray-300 dark:text-gray-600" />
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No Mediclaim cards issued yet. A card is generated for each approved covered member.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
      {state.cards.map((card) => {
        const id = card.id ?? card.cardId;
        const relationship = card.relationshipType || card.relationship_type
          || card.member?.relationshipType || card.member?.relationship_type || "";
        const isSelf = String(relationship).toLowerCase() === "self";
        const name = card.memberName || card.member_name || card.member?.fullName
          || card.member?.full_name || (isSelf ? employeeProfile?.name : "") || "—";
        const photoUrl = isSelf ? getEmployeePhotoUrl(employeeProfile?.photo) : "";
        // The card's "ID No." is always the sponsoring employee's own code —
        // every family member's card is issued under that same number,
        // since that's what HR/hospitals actually look coverage up by —
        // not just the self card.
        const employeeCode = employeeProfile?.emp_code || employeeProfile?.punching_no
          || employeeProfile?.punching_code || employeeProfile?.employee_code;

        return (
          <MediclaimIdCard
            key={id}
            card={card}
            name={name}
            relationship={relationship}
            photoUrl={photoUrl}
            employeeCode={employeeCode}
            companyCode={employeeProfile?.company_code}
            department={isSelf ? employeeProfile?.department : undefined}
            designation={isSelf ? employeeProfile?.designation : undefined}
          />
        );
      })}
    </div>
  );
}
