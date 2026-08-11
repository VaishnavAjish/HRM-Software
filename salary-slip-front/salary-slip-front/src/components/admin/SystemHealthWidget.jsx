import { useState, useEffect, useCallback } from "react";
import { Cpu, HardDrive, Database, Server, RefreshCw, Activity, ShieldCheck } from "lucide-react";
import { systemHealthApi } from "../../utils/api";
import { useAuth } from "../../context/AuthContext";
import toast from "react-hot-toast";

export default function SystemHealthWidget() {
  const { user } = useAuth();
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchHealth = useCallback(async (isManual = false) => {
    if (!user?.accessToken) return;
    if (isManual) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await systemHealthApi.getHealth(user.accessToken, user.tokenType);
      if (res?.status && res?.data) {
        setHealth(res.data);
      }
    } catch {
      if (isManual) toast.error("Could not refresh system health stats");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    fetchHealth();
    // Poll telemetry every 15 seconds
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && !document.hidden) {
        fetchHealth(false);
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  if (loading && !health) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="skeleton h-5 w-40 rounded" />
          <div className="skeleton h-8 w-8 rounded-lg" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="skeleton h-28 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const cpu = health?.cpu || {};
  const mem = health?.memory || {};
  const storage = health?.storage || {};
  const db = health?.database || {};
  const srv = health?.server || {};

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 shadow-sm transition-all">
      <div className="flex items-center justify-between gap-4 mb-5">
        <div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Activity size={20} className="text-brand-600 dark:text-brand-400" />
            Server Telemetry & Infrastructure Health
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Real-time CPU, Memory, Storage, Database, and OS metrics
          </p>
        </div>
        <button
          onClick={() => fetchHealth(true)}
          disabled={refreshing}
          className="p-2 rounded-xl bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 transition-colors border border-gray-200 dark:border-gray-600"
          title="Refresh server telemetry"
        >
          <RefreshCw size={16} className={refreshing ? "animate-spin text-brand-600" : ""} />
        </button>
      </div>

      {/* 4 Health Gauges */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* CPU Load Gauge */}
        <div className="rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/40 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
              <Cpu size={16} className="text-indigo-500" /> CPU Load
            </span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              cpu.percentage > 85 ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" : "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
            }`}>
              {cpu.percentage ?? 0}%
            </span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 h-2 rounded-full overflow-hidden mb-2">
            <div
              className={`h-full transition-all duration-500 ${
                cpu.percentage > 85 ? "bg-red-500" : cpu.percentage > 60 ? "bg-amber-500" : "bg-indigo-500"
              }`}
              style={{ width: `${Math.min(100, cpu.percentage ?? 0)}%` }}
            />
          </div>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 flex justify-between">
            <span>{cpu.cores ?? 1} Core(s)</span>
            <span>Load Avg: {cpu.load_avg?.[0] ?? "0.0"}</span>
          </p>
        </div>

        {/* Memory RAM Gauge */}
        <div className="rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/40 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
              <Server size={16} className="text-purple-500" /> RAM Memory
            </span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              mem.percentage > 90 ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" : "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
            }`}>
              {mem.percentage ?? 0}%
            </span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 h-2 rounded-full overflow-hidden mb-2">
            <div
              className={`h-full transition-all duration-500 ${
                mem.percentage > 90 ? "bg-red-500" : mem.percentage > 75 ? "bg-amber-500" : "bg-purple-500"
              }`}
              style={{ width: `${Math.min(100, mem.percentage ?? 0)}%` }}
            />
          </div>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 flex justify-between">
            <span>Used: {mem.formatted_used || "—"}</span>
            <span>Total: {mem.formatted_total || "—"}</span>
          </p>
        </div>

        {/* Disk Storage Gauge */}
        <div className="rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/40 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
              <HardDrive size={16} className="text-emerald-500" /> Disk Storage
            </span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              storage.percentage > 85 ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
            }`}>
              {storage.percentage ?? 0}%
            </span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 h-2 rounded-full overflow-hidden mb-2">
            <div
              className={`h-full transition-all duration-500 ${
                storage.percentage > 85 ? "bg-red-500" : storage.percentage > 70 ? "bg-amber-500" : "bg-emerald-500"
              }`}
              style={{ width: `${Math.min(100, storage.percentage ?? 0)}%` }}
            />
          </div>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 flex justify-between">
            <span>Free: {storage.formatted_free || "—"}</span>
            <span>Used: {storage.formatted_used || "—"}</span>
          </p>
        </div>

        {/* Database & Latency Gauge */}
        <div className="rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/40 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
              <Database size={16} className="text-blue-500" /> MySQL Engine
            </span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              db.status === "healthy" ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
            }`}>
              {db.status === "healthy" ? "HEALTHY" : "OFFLINE"}
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs">
            <span className="text-gray-500 dark:text-gray-400">Ping Latency:</span>
            <span className="font-bold text-gray-800 dark:text-gray-200">{db.latency_ms ?? 0} ms</span>
          </div>
          <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2 truncate">
            Driver: {db.connection || "mysql"}
          </p>
        </div>
      </div>

      {/* System OS & Environment Metadata Footer */}
      <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700/60 flex flex-wrap items-center justify-between text-xs text-gray-500 dark:text-gray-400 gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="flex items-center gap-1 font-medium text-gray-700 dark:text-gray-300">
            <ShieldCheck size={14} className="text-green-500" /> OS: {srv.os || "Linux/Ubuntu"}
          </span>
          <span>• PHP: {srv.php_version || "8.3"}</span>
          <span>• Laravel: {srv.laravel_version || "11.x"}</span>
        </div>
        <div>
          <span>Uptime: <strong className="text-gray-800 dark:text-gray-200">{srv.formatted_uptime || "—"}</strong></span>
        </div>
      </div>
    </div>
  );
}
