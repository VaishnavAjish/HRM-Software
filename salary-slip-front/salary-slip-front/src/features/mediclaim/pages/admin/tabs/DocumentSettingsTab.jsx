import { useEffect, useState } from "react";
import { Plus, Pencil, RotateCcw, Undo2 } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../../../../../context/AuthContext";
import Modal from "../../../../../components/ui/Modal";
import Button from "../../../../../components/ui/Button";
import Badge from "../../../../../components/ui/Badge";
import { useMediclaimAuthorization } from "../../../hooks/useMediclaimAuthorization";
import { mediclaimApi } from "../../../services/mediclaimApi";

const inputClass = "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

const CONDITIONAL_RULE_LABELS = {
  hospitalized_or_surgery: "Conditional — hospitalized/surgery",
  medico_legal: "Conditional — medico-legal",
};

const EMPTY_FORM = {
  documentType: "",
  label: "",
  requirement: "required", // required | optional | hospitalized_or_surgery | medico_legal
  maxFileSizeMb: "5",
  sortOrder: "",
};

function formToPayload(form) {
  const isConditional = form.requirement === "hospitalized_or_surgery" || form.requirement === "medico_legal";
  return {
    documentType: form.documentType.trim().toUpperCase().replace(/\s+/g, "_"),
    label: form.label.trim(),
    isRequired: form.requirement === "required",
    conditionalRule: isConditional ? form.requirement : null,
    maxFileSizeKb: Math.max(64, Math.round(Number(form.maxFileSizeMb || 5) * 1024)),
    sortOrder: form.sortOrder === "" ? undefined : Number(form.sortOrder),
  };
}

function rowToForm(row) {
  const conditionalRule = row.conditionalRule || row.conditional_rule;
  return {
    documentType: row.documentType || row.document_type || "",
    label: row.label || "",
    requirement: conditionalRule || ((row.isRequired ?? row.is_required) ? "required" : "optional"),
    maxFileSizeMb: String(((row.maxFileSizeKb ?? row.max_file_size_kb ?? 5120) / 1024).toFixed(1)).replace(/\.0$/, ""),
    sortOrder: String(row.sortOrder ?? row.sort_order ?? ""),
  };
}

function requirementLabel(row) {
  const conditionalRule = row.conditionalRule || row.conditional_rule;
  if (conditionalRule) return CONDITIONAL_RULE_LABELS[conditionalRule] || "Conditional";
  return (row.isRequired ?? row.is_required) ? "Required" : "Optional";
}

/**
 * HR's control over the claim document checklist — which document types
 * exist, whether each is required (flat or conditional on treatment
 * type/medico-legal, mirroring the paper form's two "(if...)" rules), and
 * each one's max upload size. Replaces what used to be a hardcoded
 * 8-row constant on the frontend (`documentChecklistRules.js`'s retired
 * `CLAIM_DOCUMENT_CHECKLIST`) — this screen and `DocumentChecklist.jsx`
 * (the employee-facing upload UI) both read `mediclaimApi.documentRequirements()`.
 *
 * "Retire" (not "Delete") mirrors `Admin\DocumentRequirementController::destroy()`'s
 * soft semantics — a document type is never hard-deleted, only hidden from
 * new claims, since an already-submitted claim's uploaded document keeps
 * referencing this type's code regardless. A retired row can always be
 * "Restore"d (`update()` with `isActive: true`) — that's why "Show retired"
 * exists at all, rather than retiring being a one-way action.
 */
export default function DocumentSettingsTab() {
  const { user } = useAuth();
  const { can } = useMediclaimAuthorization();
  const accessToken = user?.accessToken;
  const tokenType = user?.tokenType;

  const canManage = can("mediclaim.document_requirement.create") || can("mediclaim.document_requirement.update");

  const [result, setResult] = useState({ key: null, rows: [], error: null });
  const [showInactive, setShowInactive] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const requestKey = `${accessToken ?? ""}|${tokenType ?? ""}|${showInactive}|${reloadToken}`;

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  useEffect(() => {
    if (!accessToken) return undefined;
    let cancelled = false;

    mediclaimApi.documentRequirements({ includeInactive: showInactive || undefined }, accessToken, tokenType)
      .then((res) => {
        if (cancelled) return;
        const payload = res?.data;
        const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
        setResult({ key: requestKey, rows, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setResult({ key: requestKey, rows: [], error: err?.message || "Failed to load document requirements." });
      });

    return () => { cancelled = true; };
  }, [accessToken, tokenType, showInactive, reloadToken, requestKey]);

  const loading = result.key !== requestKey;
  const reload = () => setReloadToken((n) => n + 1);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setDrawerOpen(true);
  };

  const openEdit = (row) => {
    setEditingId(row.id);
    setForm(rowToForm(row));
    setFormError(null);
    setDrawerOpen(true);
  };

  const submit = async () => {
    if (!form.documentType.trim() || !form.label.trim()) {
      setFormError("Document type code and label are both required.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const payload = formToPayload(form);
      if (editingId) {
        await mediclaimApi.updateDocumentRequirement(editingId, payload, accessToken, tokenType);
        toast.success("Document requirement updated");
      } else {
        await mediclaimApi.createDocumentRequirement(payload, accessToken, tokenType);
        toast.success("Document requirement added");
      }
      setDrawerOpen(false);
      reload();
    } catch (err) {
      setFormError(err?.message || "Failed to save this document requirement.");
    } finally {
      setSaving(false);
    }
  };

  const retire = async (row) => {
    try {
      await mediclaimApi.deleteDocumentRequirement(row.id, accessToken, tokenType);
      toast.success("Document requirement retired");
      reload();
    } catch (err) {
      toast.error(err?.message || "Failed to retire this document requirement.");
    }
  };

  const restore = async (row) => {
    try {
      await mediclaimApi.updateDocumentRequirement(row.id, { isActive: true }, accessToken, tokenType);
      toast.success("Document requirement restored");
      reload();
    } catch (err) {
      toast.error(err?.message || "Failed to restore this document requirement.");
    }
  };

  const rows = [...result.rows].sort((a, b) => (a.sortOrder ?? a.sort_order ?? 0) - (b.sortOrder ?? b.sort_order ?? 0));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Document Requirements</p>
          <p className="text-xs text-gray-400">Which documents employees must submit with a claim, and each one's max upload size.</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            Show retired
          </label>
          {canManage && (
            <Button size="sm" icon={<Plus size={14} />} onClick={openCreate}>Add Document Type</Button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        {loading ? (
          <p className="py-10 text-center text-sm text-gray-400">Loading…</p>
        ) : result.error ? (
          <p className="py-10 text-center text-sm text-red-500">{result.error}</p>
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">No document requirements yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-700/50 dark:text-gray-400">
              <tr>
                <th className="px-4 py-3 text-left">Label</th>
                <th className="px-4 py-3 text-left">Type Code</th>
                <th className="px-4 py-3 text-left">Requirement</th>
                <th className="px-4 py-3 text-left">Max Size</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {rows.map((row) => {
                const isActive = row.isActive ?? row.is_active;
                return (
                  <tr key={row.id}>
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{row.label}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">{row.documentType || row.document_type}</td>
                    <td className="px-4 py-3">
                      <Badge variant={(row.conditionalRule || row.conditional_rule) ? "blue" : (row.isRequired ?? row.is_required) ? "red" : "gray"}>
                        {requirementLabel(row)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{((row.maxFileSizeKb ?? row.max_file_size_kb ?? 5120) / 1024).toFixed(1)} MB</td>
                    <td className="px-4 py-3"><Badge variant={isActive ? "green" : "gray"}>{isActive ? "Active" : "Retired"}</Badge></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {canManage && (
                          <button title="Edit" onClick={() => openEdit(row)} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
                            <Pencil size={14} />
                          </button>
                        )}
                        {canManage && isActive && (
                          <button title="Retire" onClick={() => retire(row)} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
                            <RotateCcw size={14} />
                          </button>
                        )}
                        {canManage && !isActive && (
                          <button title="Restore" onClick={() => restore(row)} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-500/10">
                            <Undo2 size={14} /> Restore
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        isOpen={drawerOpen}
        onClose={() => !saving && setDrawerOpen(false)}
        title={editingId ? "Edit Document Requirement" : "Add Document Type"}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDrawerOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field label="Label" required>
            <input className={inputClass} value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="e.g. Hospital Main Bill & Break-up" />
          </Field>
          <Field label="Document Type Code" required>
            <input
              className={inputClass}
              value={form.documentType}
              onChange={(e) => setForm((f) => ({ ...f, documentType: e.target.value.toUpperCase().replace(/\s+/g, "_") }))}
              placeholder="e.g. HOSPITAL_BILL"
              disabled={Boolean(editingId)}
            />
            <p className="mt-1 text-[11px] text-gray-400">Uppercase letters, numbers and underscores only. Cannot be changed once set.</p>
          </Field>
          <Field label="Requirement">
            <select className={inputClass} value={form.requirement} onChange={(e) => setForm((f) => ({ ...f, requirement: e.target.value }))}>
              <option value="required">Always required</option>
              <option value="optional">Always optional</option>
              <option value="hospitalized_or_surgery">Required only if hospitalized/surgery</option>
              <option value="medico_legal">Required only if medico-legal</option>
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Max File Size (MB)">
              <input type="number" min="0.1" step="0.1" className={inputClass} value={form.maxFileSizeMb} onChange={(e) => setForm((f) => ({ ...f, maxFileSizeMb: e.target.value }))} />
            </Field>
            <Field label="Sort Order">
              <input type="number" min="0" className={inputClass} value={form.sortOrder} onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))} placeholder="auto" />
            </Field>
          </div>
          {formError && <p className="text-xs text-red-500">{formError}</p>}
        </div>
      </Modal>
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
