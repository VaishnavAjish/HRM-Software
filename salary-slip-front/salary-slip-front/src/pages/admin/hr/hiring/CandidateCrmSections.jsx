import { useEffect, useState } from "react";
import {
  Tag as TagIcon, StickyNote, Mail, Plus, Trash2, Send, Loader2, X,
  FileText, Download, FileUp, CheckCircle2, XCircle,
} from "lucide-react";
import toast from "react-hot-toast";
import { CollapsibleSection } from "../../../../components/ui/Drawer";
import Badge from "../../../../components/ui/Badge";
import Button from "../../../../components/ui/Button";
import { hrApi } from "../../../../utils/api";
import { baseUrl } from "../../../../utils/url";
import { useAuth } from "../../../../context/AuthContext";
import { useAuthorization } from "../../../../hooks/useAuthorization";

const inputClass =
  "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";
const smallClass =
  "rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1.5 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

const COMM_STATUS_VARIANT = { sent: "green", failed: "red", queued: "yellow" };
const COMM_TYPE_LABEL = { email: "Email", sms: "SMS", phone: "Phone", other: "Other" };
const DOC_STATUS_VARIANT = { PENDING: "yellow", VERIFIED: "green", REJECTED: "red" };
const DOC_TYPES = [
  { value: "resume", label: "Resume" },
  { value: "id_proof", label: "ID Proof" },
  { value: "address_proof", label: "Address Proof" },
  { value: "education", label: "Education Certificate" },
  { value: "experience", label: "Experience Letter" },
  { value: "offer_letter", label: "Offer Letter" },
  { value: "pay_slips", label: "Pay Slips" },
  { value: "other", label: "Other" },
];
const docTypeLabel = (t) => DOC_TYPES.find((d) => d.value === t)?.label || t;

/**
 * Wave 4 — Candidate CRM sections for the candidate drawer: managed tags,
 * the private recruiter note trail, the outbound communication log, and
 * lightweight candidate documents. Each section is self-loading through the
 * hr.candidate.* API surface; write controls render only when the caller
 * holds the corresponding permission.
 */
export default function CandidateCrmSections({ candidate, loading }) {
  const { user } = useAuth();
  const { can } = useAuthorization();

  const candidateId = candidate?.id;

  const canTags = can("hr.candidate.tag") || can("ui.hr.hiring.candidates.tags");
  const canNotes = can("hr.candidate.note") || can("ui.hr.hiring.candidates.notes");
  const canComm = can("hr.candidate.communication") || can("ui.hr.hiring.candidates.communication");

  const [allTags, setAllTags] = useState([]);
  const [candidateTags, setCandidateTags] = useState([]);
  const [tagBusy, setTagBusy] = useState(false);
  const [tagDraft, setTagDraft] = useState({ name: "", color: "#6366f1", open: false });

  const [notes, setNotes] = useState([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);

  const [comms, setComms] = useState([]);
  const [commDraft, setCommDraft] = useState({ type: "email", subject: "", body: "" });
  const [commBusy, setCommBusy] = useState(false);

  const canDocs = can("hr.candidate.update");
  const [docs, setDocs] = useState([]);
  const [docBusy, setDocBusy] = useState(false);
  const [docDraft, setDocDraft] = useState({ type: "resume", notes: "", file: null });
  const [uploadKey, setUploadKey] = useState(0);

  useEffect(() => {
    if (!candidateId || !user?.accessToken) return;
    let alive = true;
    const { accessToken, tokenType } = user;

    // Each section loads independently — one failing (e.g. no permission for
    // notes) must not stop the others from rendering, but the failure still
    // has to be visible rather than silently leaving that section empty.
    hrApi.getCandidateTags(accessToken, tokenType)
      .then((res) => alive && res.status && setAllTags(res.data || []))
      .catch((err) => alive && toast.error(err.message || "Failed to load tags"));
    hrApi.getCandidateTagsOf(candidateId, accessToken, tokenType)
      .then((res) => alive && res.status && setCandidateTags(res.data || []))
      .catch((err) => alive && toast.error(err.message || "Failed to load candidate tags"));
    hrApi.getCandidateNotes(candidateId, accessToken, tokenType)
      .then((res) => alive && res.status && setNotes(res.data || []))
      .catch((err) => alive && toast.error(err.message || "Failed to load notes"));
    hrApi.getCandidateCommunications(candidateId, accessToken, tokenType)
      .then((res) => alive && res.status && setComms(res.data || []))
      .catch((err) => alive && toast.error(err.message || "Failed to load communications"));
    hrApi.getCandidateDocuments(candidateId, accessToken, tokenType)
      .then((res) => alive && res.status && setDocs(res.data || []))
      .catch((err) => alive && toast.error(err.message || "Failed to load documents"));

    return () => { alive = false; };
  }, [candidateId, user?.accessToken]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── tags ── */
  const toggleTag = async (tagId) => {
    setTagBusy(true);
    try {
      const next = candidateTags.some((t) => String(t.id) === String(tagId))
        ? candidateTags.filter((t) => String(t.id) !== String(tagId))
        : [...candidateTags, allTags.find((t) => String(t.id) === String(tagId))];
      const res = await hrApi.syncCandidateTags(candidateId, next.map((t) => t.id), user.accessToken, user.tokenType);
      if (res.status) setCandidateTags(res.data || []);
    } catch (err) {
      toast.error(err.message || "Failed to update tags");
    } finally {
      setTagBusy(false);
    }
  };

  const createTag = async () => {
    const name = tagDraft.name.trim();
    if (!name) return;
    setTagBusy(true);
    try {
      const res = await hrApi.storeCandidateTag({ name, color: tagDraft.color }, user.accessToken, user.tokenType);
      if (res.status) {
        setAllTags((prev) => [...prev, res.data]);
        setCandidateTags((prev) => [...prev, res.data]);
        setTagDraft({ name: "", color: "#6366f1", open: false });
      }
    } catch (err) {
      toast.error(err.message || "Failed to create tag");
    } finally {
      setTagBusy(false);
    }
  };

  /* ── notes ── */
  const addNote = async () => {
    const text = noteDraft.trim();
    if (!text) return;
    setNoteBusy(true);
    try {
      const res = await hrApi.storeCandidateNote(candidateId, { note: text }, user.accessToken, user.tokenType);
      if (res.status) {
        setNotes((prev) => [res.data, ...prev]);
        setNoteDraft("");
      }
    } catch (err) {
      toast.error(err.message || "Failed to add note");
    } finally {
      setNoteBusy(false);
    }
  };

  const deleteNote = async (noteId) => {
    setNoteBusy(true);
    try {
      const res = await hrApi.deleteCandidateNote(noteId, user.accessToken, user.tokenType);
      if (res.status) setNotes((prev) => prev.filter((n) => String(n.id) !== String(noteId)));
    } catch (err) {
      toast.error(err.message || "Failed to delete note");
    } finally {
      setNoteBusy(false);
    }
  };

  /* ── communication ── */
  const sendComm = async () => {
    if (!commDraft.body.trim()) return;
    setCommBusy(true);
    try {
      const res = await hrApi.storeCandidateCommunication(candidateId, commDraft, user.accessToken, user.tokenType);
      if (res.status) {
        setComms((prev) => [res.data, ...prev]);
        setCommDraft({ type: "email", subject: "", body: "" });
      }
    } catch (err) {
      toast.error(err.message || "Failed to send communication");
    } finally {
      setCommBusy(false);
    }
  };

  const attachableTags = allTags.filter(
    (t) => !candidateTags.some((ct) => String(ct.id) === String(t.id))
  );

  /* ── documents ── */
  const uploadDoc = async () => {
    if (!docDraft.file || !docDraft.type) return;
    setDocBusy(true);
    try {
      const fd = new FormData();
      fd.append("document_type", docDraft.type);
      fd.append("notes", docDraft.notes || "");
      fd.append("file", docDraft.file);
      const res = await hrApi.uploadCandidateDocument(candidateId, fd, user.accessToken, user.tokenType);
      if (res.status) {
        toast.success("Document uploaded");
        setDocs((prev) => [res.data, ...prev]);
        setDocDraft({ type: "resume", notes: "", file: null });
        setUploadKey((k) => k + 1);
      }
    } catch (err) {
      toast.error(err.message || "Failed to upload document");
    } finally {
      setDocBusy(false);
    }
  };

  const deleteDoc = async (doc) => {
    if (!window.confirm(`Delete "${doc.original_filename}"?`)) return;
    try {
      const res = await hrApi.deleteCandidateDocument(doc.id, user.accessToken, user.tokenType);
      if (res.status) {
        toast.success("Document deleted");
        setDocs((prev) => prev.filter((d) => String(d.id) !== String(doc.id)));
      }
    } catch (err) {
      toast.error(err.message || "Failed to delete document");
    }
  };

  const reviewDoc = async (doc, decision) => {
    try {
      const res = await hrApi.reviewCandidateDocument(doc.id, decision, "", user.accessToken, user.tokenType);
      if (res.status) {
        toast.success(decision === "approve" ? "Document verified" : "Document rejected");
        setDocs((prev) => prev.map((d) => (String(d.id) === String(doc.id) ? res.data : d)));
      }
    } catch (err) {
      toast.error(err.message || "Failed to review document");
    }
  };

  const docUrl = (doc) => {
    if (!doc?.url) return "#";
    return doc.url.startsWith("http") ? doc.url : `${baseUrl}${doc.url}`;
  };

  return (
    <>
      {/* ── Tags ── */}
      <CollapsibleSection title="Tags" icon={<TagIcon size={15} />} count={candidateTags.length}>
        {loading ? (
          <p className="text-xs text-gray-400 text-center py-2">Loading…</p>
        ) : (
          <div className="space-y-2">
            {candidateTags.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {candidateTags.map((tag) => (
                  <span
                    key={tag.id}
                    className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full"
                    style={{ backgroundColor: `${tag.color}1f`, color: tag.color }}
                  >
                    {tag.name}
                    {canTags && (
                      <button onClick={() => toggleTag(tag.id)} title="Remove tag" className="hover:opacity-70" disabled={tagBusy}>
                        <X size={11} />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 text-center py-1.5">No tags yet</p>
            )}

            {canTags && (
              <>
                <div className="flex gap-1.5">
                  <select
                    className={smallClass}
                    value=""
                    onChange={(e) => {
                      const id = e.target.value;
                      if (id) toggleTag(id);
                    }}
                  >
                    <option value="">Add tag…</option>
                    {attachableTags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<Plus size={13} />}
                    onClick={() => setTagDraft((d) => ({ ...d, open: !d.open }))}
                  >
                    New
                  </Button>
                </div>
                {tagDraft.open && (
                  <div className="flex gap-1.5 items-center">
                    <input
                      className={smallClass}
                      placeholder="Tag name"
                      value={tagDraft.name}
                      onChange={(e) => setTagDraft((d) => ({ ...d, name: e.target.value }))}
                    />
                    <input
                      type="color"
                      value={tagDraft.color}
                      onChange={(e) => setTagDraft((d) => ({ ...d, color: e.target.value }))}
                      className="h-8 w-8 rounded border border-gray-300 dark:border-gray-600 cursor-pointer flex-shrink-0"
                    />
                    <Button size="sm" icon={<Plus size={13} />} onClick={createTag} disabled={tagBusy || !tagDraft.name.trim()}>
                      Add
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </CollapsibleSection>

      {/* ── Notes ── */}
      <CollapsibleSection title="Notes" icon={<StickyNote size={15} />} count={notes.length}>
        {loading ? (
          <p className="text-xs text-gray-400 text-center py-2">Loading…</p>
        ) : (
          <div className="space-y-3">
            {canNotes && (
              <div className="flex gap-1.5 items-start">
                <textarea
                  rows={2}
                  className={inputClass}
                  placeholder="Add a private note…"
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                />
                <Button size="sm" onClick={addNote} disabled={noteBusy || !noteDraft.trim()}>
                  Add
                </Button>
              </div>
            )}
            {notes.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-1.5">No notes yet</p>
            ) : (
              <div className="space-y-2">
                {notes.map((note) => (
                  <div key={note.id} className="rounded-lg border border-gray-100 dark:border-gray-700 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] text-gray-400">
                        {note.created_by?.name || "Recruiter"} ·{" "}
                        {note.created_at ? new Date(note.created_at).toLocaleString() : ""}
                      </p>
                      {canNotes && (
                        <button onClick={() => deleteNote(note.id)} title="Delete note" className="text-gray-300 hover:text-red-500" disabled={noteBusy}>
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line mt-1">{note.note}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CollapsibleSection>

      {/* ── Communication ── */}
      <CollapsibleSection title="Communication" icon={<Mail size={15} />} count={comms.length}>
        {loading ? (
          <p className="text-xs text-gray-400 text-center py-2">Loading…</p>
        ) : (
          <div className="space-y-3">
            {canComm && (
              <div className="space-y-1.5 rounded-lg border border-gray-100 dark:border-gray-700 p-2.5">
                <div className="flex gap-1.5">
                  <select
                    className={smallClass}
                    value={commDraft.type}
                    onChange={(e) => setCommDraft((d) => ({ ...d, type: e.target.value }))}
                  >
                    <option value="email">Email</option>
                    <option value="sms">SMS</option>
                    <option value="phone">Phone</option>
                    <option value="other">Other</option>
                  </select>
                  {commDraft.type === "email" && (
                    <input
                      className={smallClass}
                      placeholder="Subject"
                      value={commDraft.subject}
                      onChange={(e) => setCommDraft((d) => ({ ...d, subject: e.target.value }))}
                    />
                  )}
                </div>
                <textarea
                  rows={3}
                  className={inputClass}
                  placeholder="Message body…"
                  value={commDraft.body}
                  onChange={(e) => setCommDraft((d) => ({ ...d, body: e.target.value }))}
                />
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    icon={commBusy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                    onClick={sendComm}
                    disabled={commBusy || !commDraft.body.trim()}
                  >
                    {commBusy ? "Sending…" : commDraft.type === "email" ? "Send email" : "Log"}
                  </Button>
                </div>
              </div>
            )}

            {comms.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-1.5">No communication logged</p>
            ) : (
              <div className="space-y-2">
                {comms.map((c) => (
                  <div key={c.id} className="rounded-lg border border-gray-100 dark:border-gray-700 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="gray">{COMM_TYPE_LABEL[c.type] || c.type}</Badge>
                        <Badge variant={COMM_STATUS_VARIANT[c.status] || "gray"}>{c.status}</Badge>
                      </div>
                      <p className="text-[11px] text-gray-400">
                        {c.created_at ? new Date(c.created_at).toLocaleString() : ""}
                      </p>
                    </div>
                    {c.subject && <p className="text-sm font-medium text-gray-900 dark:text-white mt-1.5">{c.subject}</p>}
                    <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-line mt-1">{c.body}</p>
                    {c.sent_by?.name && <p className="text-[11px] text-gray-400 mt-1">by {c.sent_by.name}</p>}
                    {c.error_message && <p className="text-[11px] text-red-400 mt-1">{c.error_message}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CollapsibleSection>

      {/* ── Documents ── */}
      <CollapsibleSection title="Documents" icon={<FileText size={15} />} count={docs.length}>
        {loading ? (
          <p className="text-xs text-gray-400 text-center py-2">Loading…</p>
        ) : (
          <div className="space-y-3">
            {canDocs && (
              <div className="space-y-1.5 rounded-lg border border-gray-100 dark:border-gray-700 p-2.5">
                <div className="flex gap-1.5">
                  <select
                    className={smallClass}
                    value={docDraft.type}
                    onChange={(e) => setDocDraft((d) => ({ ...d, type: e.target.value }))}
                  >
                    {DOC_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <label className="flex-1 flex items-center gap-2 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400 cursor-pointer hover:border-brand-500">
                    <FileUp size={14} />
                    {docDraft.file ? docDraft.file.name : "Choose file…"}
                    <input
                      key={uploadKey}
                      type="file"
                      className="hidden"
                      onChange={(e) => setDocDraft((d) => ({ ...d, file: e.target.files?.[0] || null }))}
                    />
                  </label>
                  <Button
                    size="sm"
                    icon={docBusy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                    onClick={uploadDoc}
                    disabled={docBusy || !docDraft.file}
                  >
                    Upload
                  </Button>
                </div>
                <input
                  className={inputClass}
                  placeholder="Notes (optional)"
                  value={docDraft.notes}
                  onChange={(e) => setDocDraft((d) => ({ ...d, notes: e.target.value }))}
                />
              </div>
            )}

            {docs.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-1.5">No documents uploaded</p>
            ) : (
              <div className="space-y-2">
                {docs.map((doc) => (
                  <div key={doc.id} className="rounded-lg border border-gray-100 dark:border-gray-700 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Badge variant="gray">{docTypeLabel(doc.document_type)}</Badge>
                        <Badge variant={DOC_STATUS_VARIANT[doc.status] || "gray"}>{doc.status}</Badge>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <a
                          href={docUrl(doc)}
                          target="_blank"
                          rel="noreferrer"
                          title="Download"
                          className="text-gray-300 hover:text-brand-600"
                        >
                          <Download size={13} />
                        </a>
                        {doc.status === "PENDING" && canDocs && (
                          <>
                            <button onClick={() => reviewDoc(doc, "approve")} title="Verify" className="text-gray-300 hover:text-green-600">
                              <CheckCircle2 size={13} />
                            </button>
                            <button onClick={() => reviewDoc(doc, "reject")} title="Reject" className="text-gray-300 hover:text-red-500">
                              <XCircle size={13} />
                            </button>
                          </>
                        )}
                        {canDocs && (
                          <button onClick={() => deleteDoc(doc)} title="Delete" className="text-gray-300 hover:text-red-500">
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-sm text-gray-900 dark:text-white mt-1.5 truncate">{doc.original_filename}</p>
                    <p className="text-[11px] text-gray-400">
                      {doc.uploaded_by?.name || ""}
                      {doc.created_at ? ` · ${new Date(doc.created_at).toLocaleString()}` : ""}
                    </p>
                    {doc.notes && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{doc.notes}</p>}
                    {doc.reviewed_by?.name && (
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        Reviewed by {doc.reviewed_by.name}
                        {doc.reviewed_at ? ` · ${new Date(doc.reviewed_at).toLocaleString()}` : ""}
                      </p>
                    )}
                    {doc.review_notes && <p className="text-[11px] text-red-400 mt-0.5">{doc.review_notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CollapsibleSection>
    </>
  );
}