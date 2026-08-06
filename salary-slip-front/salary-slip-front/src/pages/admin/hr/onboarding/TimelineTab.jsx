import { useEffect, useMemo, useState } from "react";
import { Users } from "lucide-react";
import Timeline from "../../../../components/onboarding/Timeline";
import { EmptyState, SectionCard } from "../../../../components/onboarding/primitives";
import { hrApi } from "../../../../utils/api";
import { useAuth } from "../../../../context/AuthContext";

/** Builds a real, chronological timeline from a candidate's actual document
 *  upload/review timestamps — the same construction EmployeeDrawer uses, so
 *  picking someone here and opening them from Employees shows the same story. */
function buildTimeline(docs, joiningDate) {
  const items = docs.flatMap((d) => {
    const out = [{
      tone: "brand",
      title: `${d.document_type} uploaded`,
      description: d.uploaded_by?.name ? `by ${d.uploaded_by.name}` : undefined,
      at: d.created_at ? new Date(d.created_at).toLocaleString() : "",
      ts: d.created_at ? new Date(d.created_at).getTime() : 0,
    }];
    if (d.reviewed_at) {
      out.push({
        tone: d.status === "VERIFIED" ? "ok" : "bad",
        title: `${d.document_type} ${d.status === "VERIFIED" ? "verified" : "rejected"}`,
        description: d.reviewed_by?.name ? `by ${d.reviewed_by.name}` : undefined,
        at: new Date(d.reviewed_at).toLocaleString(),
        ts: new Date(d.reviewed_at).getTime(),
      });
    }
    return out;
  }).sort((a, b) => b.ts - a.ts);
  if (joiningDate && joiningDate !== "TBD") {
    items.push({ tone: "idle", title: "Joining scheduled", at: joiningDate, ts: -1 });
  }
  return items;
}

export default function TimelineTab({ activity }) {
  const { user } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user?.accessToken) return;
    hrApi.getCandidates(user.accessToken, user.tokenType, { per_page: 100, stage: "offer_accepted" })
      .then((res) => {
        if (res.status) {
          const rows = res.data?.data || res.data || [];
          setEmployees(rows);
          if (rows.length) setSelectedId(String(rows[0].id));
        }
      })
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!selectedId) { setDocs([]); return; }
    setLoading(true);
    hrApi.getCandidateDocuments(selectedId, user.accessToken, user.tokenType)
      .then((res) => { if (res.status) setDocs(res.data || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedId, user]);

  const selectedEmployee = employees.find((e) => String(e.id) === selectedId);
  const timelineItems = useMemo(() => buildTimeline(docs, null), [docs]);

  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-12 xl:col-span-7">
        <SectionCard
          title="Employee timeline"
          action={
            employees.length ? (
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[12.5px] focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900"
              >
                {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            ) : null
          }
        >
          <div className="p-4">
            {employees.length === 0 ? (
              <EmptyState icon={Users} title="No one's onboarding yet" description="Timelines fill in automatically once a candidate's offer is accepted." />
            ) : loading ? (
              <p className="text-[12.5px] text-gray-400">Loading…</p>
            ) : timelineItems.length === 0 ? (
              <p className="text-[12.5px] text-gray-400">
                {selectedEmployee?.name || "This employee"} hasn't uploaded any documents yet.
              </p>
            ) : (
              <Timeline items={timelineItems} />
            )}
          </div>
        </SectionCard>
      </div>

      <div className="col-span-12 xl:col-span-5">
        <SectionCard title="Recent activity — everyone">
          <div className="p-4">
            <Timeline items={activity || []} />
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
