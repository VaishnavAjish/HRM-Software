import React, { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { authApi } from "../../utils/api";
import toast from "react-hot-toast";
import {
  Shield,
  Smartphone,
  Key,
  Fingerprint,
  LogOut,
  Eye,
  EyeOff,
  Copy,
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock,
  MapPin,
  Globe,
  Loader2,
  Trash2,
  Edit2,
  Plus,
  Download,
  RefreshCw,
  MessageSquare,
  Mail,
  Monitor,
  Tablet,
} from "lucide-react";

export default function SecurityCenter() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("sessions");
  const [sessions, setSessions] = useState([]);
  const [devices, setDevices] = useState([]);
  const [mfaMethods, setMfaMethods] = useState([]);
  const [backupCodes, setBackupCodes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showBackupCodes, setShowBackupCodes] = useState(false);
  const [totpSecret, setTotpSecret] = useState(null);
  const [totpQrCode, setTotpQrCode] = useState(null);
  const [enrollingTotp, setEnrollingTotp] = useState(false);

  const tabs = [
    { id: "sessions", label: "Active Sessions", icon: Smartphone },
    { id: "devices", label: "Trusted Devices", icon: Globe },
    { id: "mfa", label: "Two-Factor Auth", icon: Shield },
    { id: "backup", label: "Backup Codes", icon: Key },
  ];

  useEffect(() => {
    loadSessions();
    loadDevices();
    loadMfaMethods();
  }, []);

  const loadSessions = async () => {
    try {
      const res = await authApi.get("/api/v1/authorization/sessions");
      if (res.data.status) {
        setSessions(res.data.data);
      }
    } catch (error) {
      console.error("Failed to load sessions:", error);
    }
  };

  const loadDevices = async () => {
    try {
      const res = await authApi.get("/api/v1/authorization/devices");
      if (res.data.status) {
        setDevices(res.data.data);
      }
    } catch (error) {
      console.error("Failed to load devices:", error);
    }
  };

  const loadMfaMethods = async () => {
    try {
      const res = await authApi.get("/api/v1/authorization/mfa");
      if (res.data.status) {
        setMfaMethods(res.data.data);
      }
    } catch (error) {
      console.error("Failed to load MFA methods:", error);
    }
  };

  const revokeSession = async (sessionId) => {
    try {
      await authApi.delete(`/api/v1/authorization/sessions/${sessionId}`);
      toast.success("Session revoked");
      loadSessions();
    } catch (error) {
      toast.error("Failed to revoke session");
    }
  };

  const revokeAllOtherSessions = async () => {
    try {
      await authApi.post("/api/v1/authorization/sessions/revoke-all-others");
      toast.success("All other sessions revoked");
      loadSessions();
    } catch (error) {
      toast.error("Failed to revoke sessions");
    }
  };

  const trustDevice = async (deviceId) => {
    try {
      await authApi.post(`/api/v1/authorization/devices/${deviceId}/trust`);
      toast.success("Device marked as trusted");
      loadDevices();
    } catch (error) {
      toast.error("Failed to trust device");
    }
  };

  const blockDevice = async (deviceId) => {
    try {
      await authApi.post(`/api/v1/authorization/devices/${deviceId}/block`);
      toast.success("Device blocked");
      loadDevices();
    } catch (error) {
      toast.error("Failed to block device");
    }
  };

  const unblockDevice = async (deviceId) => {
    try {
      await authApi.post(`/api/v1/authorization/devices/${deviceId}/unblock`);
      toast.success("Device unblocked");
      loadDevices();
    } catch (error) {
      toast.error("Failed to unblock device");
    }
  };

  const initiateTotpEnrollment = async () => {
    setEnrollingTotp(true);
    try {
      const res = await authApi.post("/api/v1/authorization/mfa/totp/initiate");
      if (res.data.status) {
        setTotpSecret(res.data.data.secret);
        setTotpQrCode(res.data.data.qr_code_url);
      }
    } catch (error) {
      toast.error("Failed to initiate TOTP enrollment");
      setEnrollingTotp(false);
    }
  };

  const completeTotpEnrollment = async (code) => {
    try {
      const res = await authApi.post("/api/v1/authorization/mfa/totp/complete", {
        secret: totpSecret,
        code,
      });
      if (res.data.status) {
        toast.success("Authenticator app enrolled successfully");
        setEnrollingTotp(false);
        setTotpSecret(null);
        setTotpQrCode(null);
        loadMfaMethods();
      }
    } catch (error) {
      toast.error("Invalid code. Please try again.");
    }
  };

  const generateBackupCodes = async () => {
    try {
      const res = await authApi.post("/api/v1/authorization/mfa/backup-codes");
      if (res.data.status) {
        setBackupCodes(res.data.data.codes);
        setShowBackupCodes(true);
        toast.success("Backup codes generated. Save them securely!");
      }
    } catch (error) {
      toast.error("Failed to generate backup codes");
    }
  };

  const revokeMfaMethod = async (methodId) => {
    if (!window.confirm("Are you sure you want to remove this MFA method?")) return;

    try {
      await authApi.delete(`/api/v1/authorization/mfa/${methodId}`);
      toast.success("MFA method removed");
      loadMfaMethods();
    } catch (error) {
      toast.error("Failed to remove MFA method");
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const formatDate = (dateString) => {
    if (!dateString) return "Never";
    return new Date(dateString).toLocaleString();
  };

  const getTimeAgo = (dateString) => {
    if (!dateString) return "Unknown";
    const diff = Date.now() - new Date(dateString).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  const renderSessionsTab = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Active Sessions</h3>
        {sessions.length > 1 && (
          <button
            onClick={revokeAllOtherSessions}
            className="text-sm text-red-600 hover:text-red-700 dark:text-red-400"
          >
            Revoke All Other Sessions
          </button>
        )}
      </div>

      {sessions.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          No active sessions
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={`rounded-xl border p-4 ${
                session.is_current
                  ? "border-brand-200 bg-brand-50 dark:border-brand-800 dark:bg-brand-900/30"
                  : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700">
                    <Smartphone className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{session.device_name || "Unknown Device"}</span>
                      {session.is_current && (
                        <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                          Current
                        </span>
                      )}
                      {session.is_trusted && (
                        <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                          Trusted
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {session.browser} on {session.os} • {session.location || "Unknown location"}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right text-sm text-gray-500 dark:text-gray-400">
                    <div>Last active: {getTimeAgo(session.last_activity_at)}</div>
                    <div>Expires: {formatDate(session.expires_at)}</div>
                    <div>IP: {session.ip_address}</div>
                  </div>
                  {!session.is_current && (
                    <button
                      onClick={() => revokeSession(session.id)}
                      className="p-2 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      title="Revoke session"
                    >
                      <LogOut className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderDevicesTab = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Trusted Devices</h3>

      {devices.length === 0 ? (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          No registered devices
        </div>
      ) : (
        <div className="space-y-3">
          {devices.map((device) => (
            <div
              key={device.id}
              className={`rounded-xl border p-4 ${
                device.is_blocked
                  ? "border-red-200 bg-red-50 dark:border-red-900/30 dark:bg-red-900/20"
                  : device.is_trusted
                  ? "border-green-200 bg-green-50 dark:border-green-900/30 dark:bg-green-900/20"
                  : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700">
                    {device.device_type === "mobile" ? (
                      <Smartphone className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                    ) : device.device_type === "tablet" ? (
                      <Tablet className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                    ) : (
                      <Monitor className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{device.device_name || "Unknown Device"}</span>
                      {device.is_trusted && (
                        <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                          Trusted
                        </span>
                      )}
                      {device.is_blocked && (
                        <span className="px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
                          Blocked
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {device.browser} on {device.os} • {device.login_count} logins
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      First seen: {formatDate(device.first_seen_at)} • Last seen: {formatDate(device.last_seen_at)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!device.is_trusted && !device.is_blocked && (
                    <button
                      onClick={() => trustDevice(device.device_id)}
                      className="px-3 py-1.5 text-sm rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors"
                    >
                      Trust
                    </button>
                  )}
                  {!device.is_blocked && (
                    <button
                      onClick={() => blockDevice(device.device_id)}
                      className="px-3 py-1.5 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
                    >
                      Block
                    </button>
                  )}
                  {device.is_blocked && (
                    <button
                      onClick={() => unblockDevice(device.device_id)}
                      className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                    >
                      Unblock
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderMfaTab = () => (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold">Two-Factor Authentication</h3>

      {enrollingTotp && totpQrCode && (
        <div className="rounded-xl border border-brand-200 bg-brand-50 p-6 dark:border-brand-800 dark:bg-brand-900/30">
          <h4 className="font-medium mb-4">Scan QR Code with Authenticator App</h4>
          <div className="flex flex-col items-center gap-4">
            <img src={totpQrCode} alt="TOTP QR Code" className="bg-white p-4 rounded-lg" />
            <div className="text-center">
              <p className="text-sm text-gray-600 dark:text-gray-400">Or enter manually:</p>
              <code className="text-lg font-mono tracking-wider">{totpSecret}</code>
            </div>
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="Enter 6-digit code"
                maxLength={6}
                className="px-4 py-2 border rounded-lg text-center w-40"
                onKeyDown={(e) => e.key === "Enter" && completeTotpEnrollment(e.target.value)}
              />
              <button
                onClick={() => completeTotpEnrollment(document.querySelector('input[maxLength="6"]')?.value)}
                className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700"
              >
                Verify & Enroll
              </button>
              <button
                onClick={() => setEnrollingTotp(false)}
                className="px-4 py-2 border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {mfaMethods.map((method) => (
          <div
            key={method.id}
            className="rounded-xl border p-4 bg-white dark:bg-gray-800"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-brand-100 dark:bg-brand-900/30">
                {method.type === "totp" && <Fingerprint className="w-5 h-5 text-brand-600 dark:text-brand-400" />}
                {method.type === "sms" && <MessageSquare className="w-5 h-5 text-brand-600 dark:text-brand-400" />}
                {method.type === "email" && <Mail className="w-5 h-5 text-brand-600 dark:text-brand-400" />}
                {method.type === "backup_codes" && <Key className="w-5 h-5 text-brand-600 dark:text-brand-400" />}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{method.type_label}</span>
                  {method.is_primary && (
                    <span className="px-2 py-0.5 text-xs rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300">
                      Primary
                    </span>
                  )}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {method.phone_number && `Phone: ${method.phone_number}`}
                  {method.email && `Email: ${method.email}`}
                  {method.backup_codes_count !== null && `${method.backup_codes_count} codes remaining`}
                  <div>Enrolled: {formatDate(method.enrolled_at)}</div>
                  <div>Last used: {getTimeAgo(method.last_used_at)}</div>
                </div>
              </div>
              <button
                onClick={() => revokeMfaMethod(method.id)}
                className="p-2 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                title="Remove"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}

        {!mfaMethods.some((m) => m.type === "totp") && (
          <button
            onClick={initiateTotpEnrollment}
            className="rounded-xl border-2 border-dashed border-gray-300 p-6 text-center hover:border-brand-400 dark:border-gray-600 dark:hover:border-brand-600 transition-colors"
          >
            <Fingerprint className="w-10 h-10 mx-auto text-gray-400 dark:text-gray-500 mb-3" />
            <p className="font-medium">Add Authenticator App</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Use Google Authenticator, Authy, or similar</p>
          </button>
        )}

        {!mfaMethods.some((m) => m.type === "sms") && (
          <button
            className="rounded-xl border-2 border-dashed border-gray-300 p-6 text-center hover:border-brand-400 dark:border-gray-600 dark:hover:border-brand-600 transition-colors"
          >
            <MessageSquare className="w-10 h-10 mx-auto text-gray-400 dark:text-gray-500 mb-3" />
            <p className="font-medium">Add SMS Authentication</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Receive codes via text message</p>
          </button>
        )}

        {!mfaMethods.some((m) => m.type === "email") && (
          <button
            className="rounded-xl border-2 border-dashed border-gray-300 p-6 text-center hover:border-brand-400 dark:border-gray-600 dark:hover:border-brand-600 transition-colors"
          >
            <Mail className="w-10 h-10 mx-auto text-gray-400 dark:text-gray-500 mb-3" />
            <p className="font-medium">Add Email Authentication</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Receive codes via email</p>
          </button>
        )}
      </div>
    </div>
  );

  const renderBackupTab = () => (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Backup Codes</h3>
        {backupCodes.length === 0 && mfaMethods.some((m) => m.type === "backup_codes") && (
          <button
            onClick={generateBackupCodes}
            className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700"
          >
            Regenerate Codes
          </button>
        )}
      </div>

      {backupCodes.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-900/30 dark:bg-amber-900/20">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200 mb-4">
            <AlertCircle className="w-5 h-5" />
            <span className="font-medium">Save these codes securely. They will not be shown again.</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {backupCodes.map((code, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg"
              >
                <code className="font-mono text-lg tracking-wider">{code}</code>
                <button
                  onClick={() => copyToClipboard(code)}
                  className="p-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={() => {
              const text = backupCodes.join("\n");
              const blob = new Blob([text], { type: "text/plain" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "backup-codes.txt";
              a.click();
              URL.revokeObjectURL(url);
            }}
            className="mt-4 px-4 py-2 border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <Download className="w-4 h-4 inline mr-2" />
            Download as File
          </button>
        </div>
      )}

      {backupCodes.length === 0 && !mfaMethods.some((m) => m.type === "backup_codes") && (
        <div className="text-center py-12">
          <Key className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
          <h4 className="text-lg font-medium mb-2">No Backup Codes</h4>
          <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto">
            Generate backup codes to use when you can't access your authenticator app. Each code can only be used once.
          </p>
          <button
            onClick={generateBackupCodes}
            className="px-6 py-3 bg-brand-600 text-white rounded-lg hover:bg-brand-700"
          >
            Generate Backup Codes
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Security Center</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Manage your sessions, devices, and authentication methods
        </p>
      </div>

      <div className="rounded-xl border bg-white dark:bg-gray-800 overflow-hidden">
        <div className="border-b bg-gray-50 dark:bg-gray-900/50">
          <nav className="flex overflow-x-auto" role="tablist">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? "border-brand-600 text-brand-600 dark:text-brand-400"
                    : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                }`}
                role="tab"
                aria-selected={activeTab === tab.id}
              >
                <tab.icon className="w-4 h-4 inline mr-2" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {activeTab === "sessions" && renderSessionsTab()}
          {activeTab === "devices" && renderDevicesTab()}
          {activeTab === "mfa" && renderMfaTab()}
          {activeTab === "backup" && renderBackupTab()}
        </div>
      </div>
    </div>
  );
}