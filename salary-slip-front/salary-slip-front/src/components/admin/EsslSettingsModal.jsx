import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Loader2, Save, ShieldCheck, KeyRound, Globe, Gauge } from "lucide-react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import { salaryApi } from "../../utils/api";
import { useAuth } from "../../context/AuthContext";

const EMPTY_FORM = {
  api_url: "",
  username: "",
  password: "",
  namespace: "http://tempuri.org/",
  max_concurrent_fetches: "1",
};

/**
 * eSSL biometric API connection settings (essl_settings table) -- lets an
 * admin rotate the tunnel URL/username/password/namespace/max-concurrent
 * value from the app instead of editing .env on the server. The password
 * field is always shown blank: the backend never sends the stored password
 * back (only `has_password`), and leaving this field blank on save keeps
 * whatever password is already stored.
 */
export default function EsslSettingsModal({ isOpen, onClose }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasPassword, setHasPassword] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const load = async () => {
    setLoading(true);
    try {
      const res = await salaryApi.getEsslSettings(user?.accessToken, user?.tokenType);
      const d = res?.data || {};
      setForm({
        api_url: d.api_url || "",
        username: d.username || "",
        password: "",
        namespace: d.namespace || "http://tempuri.org/",
        max_concurrent_fetches: String(d.max_concurrent_fetches || 1),
      });
      setHasPassword(!!d.has_password);
    } catch (err) {
      toast.error(err.message || "Failed to load eSSL settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleSave = async () => {
    if (!form.api_url.trim() || !form.username.trim()) {
      toast.error("API URL and Username are required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        api_url: form.api_url.trim(),
        username: form.username.trim(),
        namespace: form.namespace.trim() || "http://tempuri.org/",
        max_concurrent_fetches: parseInt(form.max_concurrent_fetches, 10) || 1,
      };
      if (form.password.trim()) {
        payload.password = form.password.trim();
      }
      const res = await salaryApi.updateEsslSettings(payload, user?.accessToken, user?.tokenType);
      if (res?.status) {
        toast.success(res.message || "eSSL settings saved");
        setHasPassword(!!res?.data?.has_password);
        setForm((f) => ({ ...f, password: "" }));
      } else {
        toast.error(res?.message || "Failed to save eSSL settings");
      }
    } catch (err) {
      toast.error(err.message || "Failed to save eSSL settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="eSSL Biometric Connection Settings" size="lg">
      {loading ? (
        <div className="py-16 flex flex-col items-center justify-center text-gray-400 gap-2">
          <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
          <span className="text-xs font-medium">Loading settings...</span>
        </div>
      ) : (
        <div className="flex flex-col gap-4 text-xs text-gray-700 dark:text-gray-300">
          <div className="flex items-start gap-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200/80 dark:border-indigo-900/50 p-3.5">
            <div className="rounded-lg bg-indigo-600 p-2 text-white shrink-0 shadow-sm">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <p className="text-indigo-900 dark:text-indigo-200 text-[11px] leading-relaxed">
              This connection (tunnel URL, username, password) is stored in the database, not in a server
              file — update it here whenever the eSSL relay / ngrok tunnel address changes, with no server
              access needed. The password is never shown after saving.
            </p>
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-gray-400 dark:text-gray-500 mb-1">
              <Globe className="h-3 w-3" /> API URL
            </label>
            <input
              value={form.api_url}
              onChange={(e) => setForm((f) => ({ ...f, api_url: e.target.value }))}
              placeholder="https://your-tunnel.ngrok-free.dev/WebAPIService.asmx"
              className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-3 py-2 text-xs font-mono outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase text-gray-400 dark:text-gray-500 mb-1">
                Username
              </label>
              <input
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-gray-400 dark:text-gray-500 mb-1">
                <KeyRound className="h-3 w-3" /> Password
                <span className={`normal-case font-medium ${hasPassword ? "text-emerald-600" : "text-gray-400"}`}>
                  {hasPassword ? "(configured — leave blank to keep)" : "(not set)"}
                </span>
              </label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder={hasPassword ? "••••••••" : ""}
                className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase text-gray-400 dark:text-gray-500 mb-1">
                SOAP Namespace
              </label>
              <input
                value={form.namespace}
                onChange={(e) => setForm((f) => ({ ...f, namespace: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-3 py-2 text-xs font-mono outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </div>
            <div>
              <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-gray-400 dark:text-gray-500 mb-1">
                <Gauge className="h-3 w-3" /> Max Concurrent Fetches
              </label>
              <input
                type="number"
                min="1"
                max="20"
                value={form.max_concurrent_fetches}
                onChange={(e) => setForm((f) => ({ ...f, max_concurrent_fetches: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </div>
          </div>
          <p className="text-[10px] text-gray-400 -mt-2">
            Most eSSL relays only tolerate one request at a time — leave this at 1 unless you know this
            endpoint handles more.
          </p>

          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-gray-200 dark:border-gray-800">
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              Close
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              icon={saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            >
              {saving ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
