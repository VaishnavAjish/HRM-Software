import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  Loader2, Tag, RefreshCw, Plus, Pencil, Trash2, Save, X, Info, SlidersHorizontal,
} from "lucide-react";
import { ticketApi } from "../../utils/api";
import { useAuth } from "../../context/AuthContext";
import { priorityMeta, PRIORITY_ORDER } from "./ticketMeta";

const EMPTY_CATEGORY = { name: "", description: "", default_department: "", is_active: true };

/**
 * Helpdesk settings: categories and the workflow rules that govern tickets.
 *
 * Both halves used to be read-only prose. Categories were a list you could look
 * at, and the workflow rules were five hard-coded bullet points — the 7-day
 * reopen window in particular was a class constant, so changing it meant a
 * deploy. Everything on this screen now reads and writes real configuration.
 */
export default function TicketSettingsView() {
  const { user } = useAuth();
  const accessToken = user?.accessToken;
  const tokenType = user?.tokenType;

  const [categories, setCategories] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsDirty, setSettingsDirty] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(EMPTY_CATEGORY);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  const requestAll = async () => {
    try {
      const [categoryRes, settingsRes] = await Promise.all([
        ticketApi.getManagedCategories(accessToken, tokenType),
        ticketApi.getSettings(accessToken, tokenType),
      ]);

      if (categoryRes?.status) setCategories(categoryRes.data || []);
      if (settingsRes?.status) {
        const raw = settingsRes.data?.settings || {};
        setSettings({
          reopen_window_days: Number(raw["helpdesk.reopen_window_days"] ?? 7),
          auto_close_resolved_days: Number(raw["helpdesk.auto_close_resolved_days"] ?? 0),
          default_priority: raw["helpdesk.default_priority"] ?? "medium",
          allow_manager_assignment: String(raw["helpdesk.allow_manager_assignment"] ?? "true") === "true",
        });
        setSettingsDirty(false);
      }
    } finally {
      setLoading(false);
    }
  };

  const load = () =>
    requestAll().catch((err) => toast.error(err.message || "Failed to load helpdesk settings"));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const updateSetting = (field, value) => {
    setSettingsDirty(true);
    setSettings((prev) => ({ ...prev, [field]: value }));
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      const res = await ticketApi.updateSettings(
        {
          reopen_window_days: Number(settings.reopen_window_days),
          auto_close_resolved_days: Number(settings.auto_close_resolved_days),
          default_priority: settings.default_priority,
          allow_manager_assignment: Boolean(settings.allow_manager_assignment),
        },
        accessToken,
        tokenType,
      );
      res?.status
        ? (toast.success(res.message || "Settings saved"), setSettingsDirty(false))
        : toast.error(res?.message || "Failed to save settings");
    } catch (err) {
      toast.error(err.message || "Failed to save settings");
    } finally {
      setSavingSettings(false);
    }
  };

  const startCreate = () => {
    setCreating(true);
    setEditingId(null);
    setDraft(EMPTY_CATEGORY);
  };

  const startEdit = (category) => {
    setCreating(false);
    setEditingId(category.id);
    setDraft({
      name: category.name ?? "",
      description: category.description ?? "",
      default_department: category.default_department ?? "",
      is_active: Boolean(category.is_active),
    });
  };

  const cancelEdit = () => {
    setCreating(false);
    setEditingId(null);
    setDraft(EMPTY_CATEGORY);
  };

  const saveCategory = async () => {
    if (!draft.name.trim()) {
      toast.error("A category needs a name");
      return;
    }

    setBusy(true);
    try {
      const payload = {
        name: draft.name.trim(),
        description: draft.description?.trim() || null,
        default_department: draft.default_department?.trim() || null,
        is_active: draft.is_active,
      };

      const res = creating
        ? await ticketApi.createCategory(payload, accessToken, tokenType)
        : await ticketApi.updateCategory(editingId, payload, accessToken, tokenType);

      if (res?.status) {
        toast.success(res.message || "Category saved");
        cancelEdit();
        await load();
      } else {
        toast.error(res?.message || "Failed to save category");
      }
    } catch (err) {
      toast.error(err.message || "Failed to save category");
    } finally {
      setBusy(false);
    }
  };

  /**
   * The server deactivates instead of deleting when tickets exist, so the
   * prompt says which will happen rather than promising a delete it will not do.
   */
  const removeCategory = async (category) => {
    const used = (category.tickets_count ?? 0) > 0;
    const message = used
      ? `${category.name} has ${category.tickets_count} ticket(s). It will be deactivated and hidden from the raise form; its history stays intact. Continue?`
      : `Delete ${category.name}? It has never been used, so it will be removed entirely.`;

    if (!window.confirm(message)) return;

    setBusy(true);
    try {
      const res = await ticketApi.deleteCategory(category.id, accessToken, tokenType);
      res?.status ? toast.success(res.message) : toast.error(res?.message || "Failed");
      if (res?.status) await load();
    } catch (err) {
      toast.error(err.message || "Failed to remove category");
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (category) => {
    setBusy(true);
    try {
      const res = await ticketApi.updateCategory(
        category.id,
        { is_active: !category.is_active },
        accessToken,
        tokenType,
      );
      if (res?.status) await load();
      else toast.error(res?.message || "Failed to update category");
    } catch (err) {
      toast.error(err.message || "Failed to update category");
    } finally {
      setBusy(false);
    }
  };

  const activeCount = categories.filter((c) => c.is_active).length;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 pb-4 dark:border-white/10">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Helpdesk Settings</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Ticket categories and the workflow rules that govern them.
          </p>
        </div>
        <button onClick={load} disabled={loading} className={btnGhost} title="Reload">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </header>

      {loading ? (
        <div className="flex h-40 items-center justify-center rounded-2xl border border-gray-200 dark:border-white/10">
          <Loader2 className="animate-spin text-brand-500" size={20} />
        </div>
      ) : (
        <>
          {/* ── Workflow rules ── */}
          <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-[#0b0f1a]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3 dark:border-white/10">
              <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                <SlidersHorizontal size={14} className="text-brand-500" /> Workflow Rules
              </h3>
              <button
                onClick={saveSettings}
                disabled={savingSettings || !settingsDirty}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {savingSettings ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {savingSettings ? "Saving…" : settingsDirty ? "Save changes" : "Saved"}
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <SettingField
                label="Reopen window (days)"
                hint="How long a resolved ticket stays reopenable by the employee who raised it."
              >
                <input
                  type="number" min="1" max="365"
                  value={settings.reopen_window_days}
                  onChange={(e) => updateSetting("reopen_window_days", e.target.value)}
                  className={numberCls}
                />
              </SettingField>

              <SettingField
                label="Auto-close resolved after (days)"
                hint="Closes resolved tickets the employee never came back to. 0 disables it."
              >
                <input
                  type="number" min="0" max="365"
                  value={settings.auto_close_resolved_days}
                  onChange={(e) => updateSetting("auto_close_resolved_days", e.target.value)}
                  className={numberCls}
                />
              </SettingField>

              <SettingField label="Default priority" hint="Pre-selected on the raise form.">
                <select
                  value={settings.default_priority}
                  onChange={(e) => updateSetting("default_priority", e.target.value)}
                  className={selectCls}
                >
                  {PRIORITY_ORDER.map((p) => (
                    <option key={p} value={p}>{priorityMeta(p).label}</option>
                  ))}
                </select>
              </SettingField>

              <SettingField
                label="Allow manager assignment"
                hint="Whether tickets may be assigned to managers as well as admins."
              >
                <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={settings.allow_manager_assignment}
                    onChange={(e) => updateSetting("allow_manager_assignment", e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                  Enabled
                </label>
              </SettingField>
            </div>

            {/* Rules that are enforced in code and not configurable — stated so
                nobody looks for a switch that does not exist. */}
            <div className="rounded-xl bg-gray-50 p-3 dark:bg-white/5">
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                Always enforced
              </p>
              <ul className="space-y-1 text-[11px] leading-relaxed text-gray-600 dark:text-gray-400">
                <li>• A closed ticket is read-only: no replies, status changes or reassignment.</li>
                <li>• Internal notes are visible to admins and managers only, never to the employee.</li>
                <li>• Company, branch and department are taken from the employee raising the ticket.</li>
                <li>• Ticket history is append-only and is never deleted.</li>
              </ul>
            </div>
          </section>

          {/* ── Categories ── */}
          <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-white/10 dark:bg-[#0b0f1a]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-3 dark:border-white/10">
              <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                <Tag size={14} className="text-brand-500" /> Ticket Categories
              </h3>
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-gray-400">
                  {activeCount} active · {categories.length} total
                </span>
                <button
                  onClick={startCreate}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-700"
                >
                  <Plus size={13} /> Add category
                </button>
              </div>
            </div>

            {creating && (
              <CategoryForm
                draft={draft}
                setDraft={setDraft}
                onSave={saveCategory}
                onCancel={cancelEdit}
                busy={busy}
                title="New category"
              />
            )}

            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 uppercase tracking-wider text-gray-500 dark:bg-slate-900">
                <tr>
                  <th className="p-3.5 font-bold">Category</th>
                  <th className="p-3.5 font-bold">Routes To</th>
                  <th className="p-3.5 font-bold">Description</th>
                  <th className="p-3.5 font-bold">Tickets</th>
                  <th className="p-3.5 font-bold">Status</th>
                  <th className="p-3.5 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-white/10">
                {categories.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                      No categories yet.
                    </td>
                  </tr>
                ) : (
                  categories.map((category) =>
                    editingId === category.id ? (
                      <tr key={category.id}>
                        <td colSpan={6} className="p-0">
                          <CategoryForm
                            draft={draft}
                            setDraft={setDraft}
                            onSave={saveCategory}
                            onCancel={cancelEdit}
                            busy={busy}
                            title={`Editing ${category.name}`}
                          />
                        </td>
                      </tr>
                    ) : (
                      <tr key={category.id} className={`hover:bg-gray-50/60 dark:hover:bg-white/[0.02] ${category.is_active ? "" : "opacity-60"}`}>
                        <td className="p-3.5 font-bold text-gray-900 dark:text-white">{category.name}</td>
                        <td className="p-3.5">
                          {category.default_department ? (
                            <span className="inline-flex rounded-md bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-700 dark:bg-brand-900/30 dark:text-brand-400">
                              {category.default_department}
                            </span>
                          ) : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="p-3.5 text-gray-600 dark:text-gray-300">{category.description || "—"}</td>
                        <td className="p-3.5 text-gray-600 dark:text-gray-300">{category.tickets_count ?? 0}</td>
                        <td className="p-3.5">
                          <button
                            onClick={() => toggleActive(category)}
                            disabled={busy}
                            className={`rounded-md px-2 py-0.5 text-[10px] font-bold transition ${
                              category.is_active
                                ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400"
                                : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400"
                            }`}
                            title="Click to toggle"
                          >
                            {category.is_active ? "Active" : "Inactive"}
                          </button>
                        </td>
                        <td className="p-3.5">
                          <div className="flex justify-end gap-1">
                            <button onClick={() => startEdit(category)} className={iconBtn} title="Edit">
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => removeCategory(category)}
                              disabled={busy}
                              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-40 dark:hover:bg-red-900/20"
                              title={(category.tickets_count ?? 0) > 0 ? "Deactivate (has tickets)" : "Delete"}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ),
                  )
                )}
              </tbody>
            </table>
          </section>

          <p className="flex items-start gap-2 rounded-xl bg-blue-50 p-3 text-[11px] leading-relaxed text-blue-800 dark:bg-blue-950/30 dark:text-blue-300">
            <Info size={14} className="mt-px shrink-0" />
            A category that has tickets is deactivated rather than deleted — removing it would
            strip the category from tickets that were filed under it and rewrite their history.
            SLA targets live under Department SLA Rules.
          </p>
        </>
      )}
    </div>
  );
}

function CategoryForm({ draft, setDraft, onSave, onCancel, busy, title }) {
  return (
    <div className="space-y-3 border-b border-gray-100 bg-gray-50/60 p-4 dark:border-white/10 dark:bg-white/5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{title}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <input
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="Category name"
          className={inputCls}
        />
        <input
          value={draft.default_department}
          onChange={(e) => setDraft({ ...draft, default_department: e.target.value })}
          placeholder="Routes to (department)"
          className={inputCls}
        />
        <input
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          placeholder="Short description"
          className={inputCls}
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={draft.is_active}
            onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })}
            className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          />
          Active — shown on the raise form
        </label>
        <div className="ml-auto flex gap-2">
          <button onClick={onCancel} className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5">
            <X size={13} /> Cancel
          </button>
          <button
            onClick={onSave}
            disabled={busy || !draft.name.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-40"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingField({ label, hint, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">{label}</label>
      <p className="mb-1.5 text-[11px] leading-relaxed text-gray-400">{hint}</p>
      {children}
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-900 outline-none focus:border-brand-500 dark:border-white/10 dark:bg-slate-900 dark:text-white";

const numberCls =
  "w-28 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs text-gray-900 outline-none focus:border-brand-500 dark:border-white/10 dark:bg-slate-900 dark:text-white";

const selectCls =
  "rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-700 outline-none dark:border-white/10 dark:bg-slate-900 dark:text-gray-200";

const btnGhost =
  "inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-40 dark:border-white/10 dark:bg-slate-900 dark:text-gray-200";

const iconBtn =
  "rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-brand-900/20";
