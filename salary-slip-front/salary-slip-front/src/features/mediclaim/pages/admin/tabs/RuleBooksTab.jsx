import { useEffect, useState } from "react";
import { UploadCloud } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../../../../../context/AuthContext";
import { documentV1Api } from "../../../../../utils/api";
import Drawer from "../../../../../components/ui/Drawer";
import Button from "../../../../../components/ui/Button";
import Badge from "../../../../../components/ui/Badge";
import { useMediclaimAuthorization } from "../../../hooks/useMediclaimAuthorization";
import { mediclaimApi } from "../../../services/mediclaimApi";
import RuleBookViewer from "../../../components/RuleBookViewer";
import { DECLARATION_LANGUAGE_ORDER } from "../../../models/declarationText";
import { formatClaimDate } from "../../../utils/formatters";

const inputClass =
  "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

const LANGUAGE_LABEL = { en: "English", hi: "हिन्दी", gu: "ગુજરાતી" };

// The rule-book PDF's document-type catalogue slug, added to
// `DocumentType::CATEGORIES['Medical']` per the backend plan's B2 section.
// Not part of `models/documentTypes.js` (that file is specifically the
// Section F claim-document checklist), so it's named locally here.
const RULE_BOOK_DOCUMENT_TYPE = "RULE_BOOK";

const EMPTY_FORM = { language: DECLARATION_LANGUAGE_ORDER[0], title: "", effectiveFrom: "", file: null };

/**
 * Wraps the existing, unmodified `RuleBookViewer` (read-only) with upload/
 * publish management. The PDF upload itself goes through the same generic
 * document-upload plumbing `DocumentChecklist.jsx` (F4) uses for claim
 * documents (`documentV1Api.upload` -> a document id, `DocumentViewerModal`
 * to view it) rather than a bespoke mechanism — there is no
 * `/rule-books/{id}/documents` sub-route in the backend plan's route table,
 * so the resulting `documentId` is passed straight into
 * `createRuleBook`/`updateRuleBook`'s payload, and the server is expected to
 * link it via the same `mediclaim_document_links` polymorphic table the plan
 * describes for every other Mediclaim document (reconciliation #4).
 */
export default function RuleBooksTab() {
  const { user } = useAuth();
  const { can } = useMediclaimAuthorization();

  const [state, setState] = useState({ loading: true, ruleBooks: [], error: null });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [publishingId, setPublishingId] = useState(null);

  const canCreate = can("mediclaim.rule_book.create");
  const canUpdate = can("mediclaim.rule_book.update");
  const canPublish = can("mediclaim.rule_book.publish");

  const load = () => {
    if (!user?.accessToken) return;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    mediclaimApi.ruleBooks({}, user.accessToken, user.tokenType)
      .then((res) => {
        const payload = res?.data;
        const ruleBooks = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
        setState({ loading: false, ruleBooks, error: null });
      })
      .catch((err) => {
        setState({ loading: false, ruleBooks: [], error: err?.message || "Failed to load rule books." });
      });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setDrawerOpen(true);
  };

  const openEdit = (ruleBook) => {
    setEditingId(ruleBook.id ?? ruleBook.ruleBookId);
    setForm({
      language: ruleBook.language || ruleBook.languageCode || ruleBook.language_code || DECLARATION_LANGUAGE_ORDER[0],
      title: ruleBook.title || "",
      effectiveFrom: ruleBook.effectiveFrom || ruleBook.effective_from || "",
      file: null,
    });
    setFormError(null);
    setDrawerOpen(true);
  };

  const submit = async () => {
    if (!form.title.trim()) {
      setFormError("Title is required.");
      return;
    }
    if (!editingId && !form.file) {
      setFormError("Select the rule book PDF to upload.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      let documentId;
      if (form.file) {
        const uploadRes = await documentV1Api.upload(
          { file: form.file, documentType: RULE_BOOK_DOCUMENT_TYPE, description: form.title.trim() },
          user?.accessToken,
          user?.tokenType,
        );
        documentId = uploadRes?.data?.documentId ?? uploadRes?.data?.id;
      }

      const payload = {
        language: form.language,
        title: form.title.trim(),
        effectiveFrom: form.effectiveFrom || undefined,
        ...(documentId ? { documentId } : {}),
      };

      if (editingId) {
        await mediclaimApi.updateRuleBook(editingId, payload, user?.accessToken, user?.tokenType);
        toast.success("Rule book updated");
      } else {
        await mediclaimApi.createRuleBook(payload, user?.accessToken, user?.tokenType);
        toast.success("Rule book uploaded as draft");
      }
      setDrawerOpen(false);
      load();
    } catch (err) {
      setFormError(err?.message || "Failed to save the rule book.");
    } finally {
      setSaving(false);
    }
  };

  const publish = async (ruleBook) => {
    const id = ruleBook.id ?? ruleBook.ruleBookId;
    setPublishingId(id);
    try {
      await mediclaimApi.publishRuleBook(id, user?.accessToken, user?.tokenType);
      toast.success("Rule book published");
      load();
    } catch (err) {
      toast.error(err?.message || "Failed to publish this rule book.");
    } finally {
      setPublishingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-500 dark:text-gray-400">Upload and publish the trilingual Mediclaim rule book.</p>
        {canCreate && <Button size="sm" icon={<UploadCloud size={14} />} onClick={openCreate}>Upload Rule Book</Button>}
      </div>

      {(canUpdate || canPublish) && (
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          {state.loading ? (
            <p className="py-8 text-center text-sm text-gray-400">Loading…</p>
          ) : state.ruleBooks.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">No rule books uploaded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-700/50 dark:text-gray-400">
                  <tr>
                    <th className="px-4 py-3 text-left">Title</th>
                    <th className="px-4 py-3 text-left">Language</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Effective From</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {state.ruleBooks.map((rb) => {
                    const id = rb.id ?? rb.ruleBookId;
                    const language = rb.language || rb.languageCode || rb.language_code;
                    const status = String(rb.status || "").toLowerCase();
                    return (
                      <tr key={id}>
                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{rb.title || "—"}</td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{LANGUAGE_LABEL[language] || language || "—"}</td>
                        <td className="px-4 py-3"><Badge variant={status === "published" ? "green" : status === "archived" ? "gray" : "yellow"}>{rb.status || "—"}</Badge></td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{formatClaimDate(rb.effectiveFrom || rb.effective_from)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-3">
                            {canUpdate && (
                              <button type="button" onClick={() => openEdit(rb)} className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400">Edit</button>
                            )}
                            {canPublish && status === "draft" && (
                              <button type="button" disabled={publishingId === id} onClick={() => publish(rb)} className="text-xs font-semibold text-emerald-600 hover:underline disabled:opacity-50 dark:text-emerald-400">
                                {publishingId === id ? "Publishing…" : "Publish"}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div>
        <p className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">Published View</p>
        <RuleBookViewer ruleBooks={state.ruleBooks} loading={state.loading} error={state.error} />
      </div>

      <Drawer
        isOpen={drawerOpen}
        onClose={() => !saving && setDrawerOpen(false)}
        title={editingId ? "Edit Rule Book" : "Upload Rule Book"}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDrawerOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field label="Language" required>
            <select className={inputClass} value={form.language} onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}>
              {DECLARATION_LANGUAGE_ORDER.map((code) => (
                <option key={code} value={code}>{LANGUAGE_LABEL[code] || code}</option>
              ))}
            </select>
          </Field>
          <Field label="Title" required>
            <input className={inputClass} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Mediclaim Rule Book" />
          </Field>
          <Field label="Effective From">
            <input type="date" className={inputClass} value={form.effectiveFrom} onChange={(e) => setForm((f) => ({ ...f, effectiveFrom: e.target.value }))} />
          </Field>
          <Field label={editingId ? "Replace PDF (optional)" : "Rule Book PDF"} required={!editingId}>
            <input
              type="file"
              accept="application/pdf"
              className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-gray-700 dark:text-gray-300 dark:file:bg-gray-700 dark:file:text-gray-200"
              onChange={(e) => setForm((f) => ({ ...f, file: e.target.files?.[0] || null }))}
            />
          </Field>
          {formError && <p className="text-xs text-red-500">{formError}</p>}
        </div>
      </Drawer>
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">
        {label}{required && <span className="text-red-500"> *</span>}
      </label>
      {children}
    </div>
  );
}
