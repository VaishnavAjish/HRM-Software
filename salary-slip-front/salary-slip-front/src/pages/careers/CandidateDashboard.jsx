import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FileText, Calendar, Briefcase, AlertCircle } from "lucide-react";
import toast from "react-hot-toast";
import { candidateApi } from "../../utils/api";
import { useCandidateAuth } from "../../context/CandidateAuthContext";

export default function CandidateDashboard() {
  const { candidate, token } = useCandidateAuth();
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    candidateApi.getApplications(token)
      .then((res) => {
        if (res.status) {
          setApplications(res.data || []);
        }
      })
      .catch((err) => toast.error(err.message || "Failed to load applications"))
      .finally(() => setLoading(false));
  }, [token]);

  const getStatusBadge = (statusLabel) => {
    switch (statusLabel) {
      case "Submitted":
        return "bg-blue-500/10 text-blue-400 border-blue-500/30";
      case "Under Review":
        return "bg-yellow-500/10 text-yellow-400 border-yellow-500/30";
      case "Assessment":
      case "Interview":
        return "bg-indigo-500/10 text-indigo-400 border-indigo-500/30";
      case "Offer":
      case "Hired":
        return "bg-green-500/10 text-green-400 border-green-500/30";
      default:
        return "bg-slate-500/10 text-slate-400 border-slate-500/30";
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 space-y-8">
      {/* Account Profile Header */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-full bg-brand-600/20 border border-brand-500/40 flex items-center justify-center text-brand-400 font-bold text-lg">
            {candidate?.name?.charAt(0) || "C"}
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">{candidate?.name}</h1>
            <p className="text-xs text-slate-400">{candidate?.email} · {candidate?.phone || "No phone added"}</p>
          </div>
        </div>

        {!candidate?.email_verified_at && (
          <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 rounded-xl">
            <AlertCircle size={15} /> Email verification pending
          </div>
        )}
      </div>

      {/* Applications List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <FileText size={20} className="text-brand-400" /> My Job Applications ({applications.length})
          </h2>
          <Link to="/careers" className="text-xs font-semibold text-brand-400 hover:underline">
            Browse More Openings
          </Link>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div key={i} className="h-28 rounded-2xl bg-slate-800/40 animate-pulse border border-slate-800" />
            ))}
          </div>
        ) : applications.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-12 text-center">
            <Briefcase size={36} className="mx-auto text-slate-600 mb-2" />
            <h3 className="text-base font-semibold text-slate-300">No Applications Submitted</h3>
            <p className="text-xs text-slate-500 mt-1 mb-4">You have not applied for any positions yet.</p>
            <Link to="/careers" className="px-4 py-2 rounded-xl bg-brand-600 text-white text-xs font-bold">
              Explore Jobs & Apply
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {applications.map((app) => (
              <div key={app.id} className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    {app.department_name || "General Department"}
                  </span>
                  <h3 className="text-lg font-bold text-white">{app.job_title}</h3>
                  <div className="flex items-center gap-4 text-xs text-slate-400 mt-2">
                    <span className="flex items-center gap-1">
                      <Calendar size={14} className="text-slate-500" />
                      Applied: {new Date(app.applied_at).toLocaleDateString()}
                    </span>
                    {app.resume_name && (
                      <span className="flex items-center gap-1 text-slate-300">
                        <FileText size={14} className="text-slate-500" />
                        {app.resume_name}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${getStatusBadge(app.status_label)}`}>
                    {app.status_label}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
