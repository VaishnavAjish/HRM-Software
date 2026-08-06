import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  CheckCircle2, Circle, Download, FileText, Search, Sparkles, ThumbsDown, ThumbsUp, Trash2, Upload,
} from "lucide-react";
import Button from "../../../../components/ui/Button";
import {
  Avatar,
  EmptyState,
  Eyebrow,
  Person,
  SectionCard,
  StatusPill,
} from "../../../../components/onboarding/primitives";
import { hrApi } from "../../../../utils/api";
import { useAuth } from "../../../../context/AuthContext";

const DOCUMENT_TYPES = [
  "Aadhaar Card", "PAN Card", "Passport", "Driving License", "Passport Photo",
  "Education Certificate", "Experience Letter", "Bank Details", "Address Proof", "Other",
];

const STATUS_TONE = { VERIFIED: "ok", PENDING: "warn", REJECTED: "bad" };
const STATUS_LABEL = { VERIFIED: "Verified", PENDING: "Awaiting review", REJECTED: "Rejected" };

function UploadArea({ onFile, compact }) {
  const [dragOver, setDragOver] = useState(false);
  return (
    <label
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) onFile(file);
      }}
      className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[10px] border-[1.5px] border-dashed p-4 text-center transition ${
        dragOver
          ? "border-brand-500 bg-brand-500/5"
          : "border-gray-300 bg-gray-50 hover:border-brand-400 dark:border-gray-700 dark:bg-gray-800/40"
      } ${compact ? "py-3.5" : "py-6"}`}
    >
      <Upload size={compact ? 18 : 24} strokeWidth={1.5} className="text-gray-400" />
      <span className="text-[11.5px] font-medium text-gray-500 dark:text-gray-400">
        Drag &amp; drop, or click to browse
      </span>
      <span className="text-[10.5px] text-gray-400">PDF, JPG or PNG · up to 10 MB</span>
      <input
        type="file"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
      />
    </label>
  );
}

export default function DocumentsTab() {
  const { user } = useAuth();
  const [employees, setEmployees] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);

  const [docs, setDocs] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [activeDoc, setActiveDoc] = useState(null);
  const [remarks, setRemarks] = useState("");

  useEffect(() => {
    if (!user?.accessToken) return;
    hrApi.getCandidates(user.accessToken, user.tokenType, { per_page: 100, stage: "offer_accepted" })
      .then((res) => {
        if (res.status) {
          const rows = res.data?.data || res.data || [];
          setEmployees(rows);
          if (rows.length && !selectedId) setSelectedId(rows[0].id);
        }
      })
      .catch(() => {})
      .finally(() => setEmployeesLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const loadDocs = () => {
    if (!selectedId) { setDocs([]); return; }
    setDocsLoading(true);
    hrApi.getCandidateDocuments(selectedId, user.accessToken, user.tokenType)
      .then((res) => { if (res.status) setDocs(res.data || []); })
      .catch((err) => toast.error(err.message || "Failed to load documents"))
      .finally(() => setDocsLoading(false));
  };

  useEffect(loadDocs, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e) => (e.name || "").toLowerCase().includes(q));
  }, [employees, search]);

  const selectedEmployee = employees.find((e) => e.id === selectedId);

  const docsByType = useMemo(() => {
    const map = {};
    for (const d of docs) {
      (map[d.document_type] ||= []).push(d);
    }
    Object.values(map).forEach((list) => list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
    return map;
  }, [docs]);

  const upload = async (docType, file) => {
    try {
      const formData = new FormData();
      formData.append("document_type", docType);
      formData.append("file", file);
      const res = await hrApi.uploadCandidateDocument(selectedId, formData, user.accessToken, user.tokenType);
      if (!res.status) throw new Error(res.message);
      toast.success(`${docType} uploaded`);
      loadDocs();
    } catch (err) {
      toast.error(err.message || "Failed to upload document");
    }
  };

  const removeDoc = async (id) => {
    if (!window.confirm("Delete this document?")) return;
    try {
      const res = await hrApi.deleteCandidateDocument(id, user.accessToken, user.tokenType);
      if (res.status) {
        toast.success("Document deleted");
        if (activeDoc?.id === id) setActiveDoc(null);
        loadDocs();
      }
    } catch (err) {
      toast.error(err.message || "Failed to delete");
    }
  };

  const review = async (decision) => {
    if (!activeDoc) return;
    if (decision === "reject" && !remarks.trim()) {
      toast.error("Add a remark so HR knows what to fix.");
      return;
    }
    try {
      const res = await hrApi.reviewCandidateDocument(activeDoc.id, decision, remarks || undefined, user.accessToken, user.tokenType);
      if (res.status) {
        toast.success(decision === "approve" ? "Document verified" : "Document rejected");
        setRemarks("");
        loadDocs();
      }
    } catch (err) {
      toast.error(err.message || "Failed to update document status");
    }
  };

  const missingTypes = DOCUMENT_TYPES.filter((t) => !docsByType[t]?.length);
  const presentTypes = DOCUMENT_TYPES.filter((t) => docsByType[t]?.length);

  return (
    <div className="grid grid-cols-12 gap-4">
      {/* Left: employee list */}
      <div className="col-span-12 lg:col-span-3">
        <SectionCard title="Employees">
          <div className="p-2.5">
            <div className="relative mb-2.5">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                className="w-full rounded-lg border border-gray-200 bg-white py-1.5 pl-8 pr-2.5 text-[12.5px] focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900"
              />
            </div>
            <div className="flex max-h-[520px] flex-col gap-1 overflow-y-auto">
              {employeesLoading ? (
                <p className="p-2 text-[12.5px] text-gray-400">Loading…</p>
              ) : filteredEmployees.length === 0 ? (
                <p className="p-2 text-[12.5px] text-gray-400">No one's onboarding yet.</p>
              ) : (
                filteredEmployees.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => { setSelectedId(e.id); setActiveDoc(null); setRemarks(""); }}
                    className={`flex items-center gap-2.5 rounded-lg p-2 text-left transition ${
                      e.id === selectedId
                        ? "bg-brand-500/10 ring-1 ring-brand-400/40"
                        : "hover:bg-gray-50 dark:hover:bg-gray-800/40"
                    }`}
                  >
                    <Person name={e.name} meta={e.email || e.phone || ""} />
                  </button>
                ))
              )}
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Middle: document cards */}
      <div className="col-span-12 lg:col-span-6">
        <SectionCard title={selectedEmployee ? `${selectedEmployee.name}'s documents` : "Documents"}>
          <div className="p-4">
            {!selectedId ? (
              <EmptyState icon={FileText} title="Select an employee" description="Choose someone from the list to review their documents." />
            ) : docsLoading ? (
              <p className="text-[12.5px] text-gray-400">Loading…</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {DOCUMENT_TYPES.map((type) => {
                  const list = docsByType[type] || [];
                  const primary = list[0];
                  return (
                    <div key={type} className="rounded-[10px] border border-gray-200 p-2.5 dark:border-gray-800">
                      <div className="mb-2 flex items-center justify-between">
                        <b className="text-[12.5px] font-semibold">{type}</b>
                        {list.length > 1 ? (
                          <small className="text-[10.5px] text-gray-400">+{list.length - 1} older</small>
                        ) : null}
                      </div>
                      {primary ? (
                        <button
                          type="button"
                          onClick={() => { setActiveDoc(primary); setRemarks(""); }}
                          className={`flex w-full items-center gap-2.5 rounded-lg border p-2 text-left transition ${
                            activeDoc?.id === primary.id
                              ? "border-brand-400 bg-brand-500/5"
                              : "border-gray-200 hover:border-gray-300 dark:border-gray-800 dark:hover:border-gray-700"
                          }`}
                        >
                          <Avatar name={type} size={26} />
                          <div className="min-w-0 flex-1">
                            <small className="block truncate text-[11.5px] font-medium">{primary.original_filename}</small>
                            <small className="block text-[10.5px] text-gray-400">
                              {new Date(primary.created_at).toLocaleDateString()} · {primary.uploaded_by?.name || "—"}
                            </small>
                          </div>
                          <StatusPill tone={STATUS_TONE[primary.status]}>{STATUS_LABEL[primary.status]}</StatusPill>
                        </button>
                      ) : (
                        <UploadArea compact onFile={(file) => upload(type, file)} />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </SectionCard>
      </div>

      {/* Right: verification panel */}
      <div className="col-span-12 lg:col-span-3">
        <SectionCard title="Verification">
          <div className="flex flex-col gap-4 p-4">
            {activeDoc ? (
              <>
                <div>
                  <Eyebrow>Selected document</Eyebrow>
                  <div className="mt-1.5 grid h-28 place-items-center rounded-[10px] border border-gray-200 bg-gray-50 text-gray-400 dark:border-gray-800 dark:bg-gray-800/40">
                    <div className="text-center">
                      <FileText size={22} strokeWidth={1.5} className="mx-auto" />
                      <div className="mt-1.5 text-[11px]">{activeDoc.document_type}</div>
                    </div>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <a href={activeDoc.url} target="_blank" rel="noreferrer" className="flex-1">
                      <Button variant="secondary" size="sm" icon={<Download size={13} />} className="w-full justify-center">View</Button>
                    </a>
                    <Button variant="secondary" size="sm" icon={<Trash2 size={13} />} onClick={() => removeDoc(activeDoc.id)}>
                      Delete
                    </Button>
                  </div>
                </div>

                <div>
                  <label htmlFor="hr-remarks" className="mb-1.5 block text-xs font-semibold">HR notes</label>
                  <textarea
                    id="hr-remarks"
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="Required when rejecting"
                    className="h-20 w-full rounded-lg border border-gray-200 bg-white p-2.5 text-[13px] focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900"
                  />
                  {activeDoc.review_notes ? (
                    <p className="mt-1.5 text-[11px] text-gray-400">Previous note: {activeDoc.review_notes}</p>
                  ) : null}
                </div>

                {activeDoc.status === "PENDING" ? (
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" icon={<ThumbsDown size={13} />} onClick={() => review("reject")} className="flex-1 justify-center">
                      Request re-upload
                    </Button>
                    <Button size="sm" icon={<ThumbsUp size={13} />} onClick={() => review("approve")} className="flex-1 justify-center">
                      Approve
                    </Button>
                  </div>
                ) : (
                  <StatusPill tone={STATUS_TONE[activeDoc.status]}>{STATUS_LABEL[activeDoc.status]}</StatusPill>
                )}
              </>
            ) : (
              <p className="text-[12.5px] text-gray-400">Select a document to review it here.</p>
            )}

            <div className="border-t border-gray-200 pt-3.5 dark:border-gray-800">
              <Eyebrow>Verification checklist</Eyebrow>
              <div className="mt-2 flex flex-col gap-1.5">
                {presentTypes.map((t) => (
                  <div key={t} className="flex items-center gap-1.5 text-[12px] text-gray-600 dark:text-gray-300">
                    <CheckCircle2 size={14} className="text-emerald-600" /> {t}
                  </div>
                ))}
                {missingTypes.map((t) => (
                  <div key={t} className="flex items-center gap-1.5 text-[12px] text-gray-400">
                    <Circle size={14} /> {t}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-xl border border-dashed border-gray-300 bg-gray-50 px-3 py-2.5 text-[11.5px] text-gray-400 dark:border-gray-700 dark:bg-gray-800/30">
              <Sparkles size={14} className="mt-px shrink-0" />
              <span>AI verification (OCR, mismatch alerts, face match) — coming soon.</span>
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
