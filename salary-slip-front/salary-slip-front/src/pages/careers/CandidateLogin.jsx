import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Mail, Lock, ArrowRight } from "lucide-react";
import toast from "react-hot-toast";
import { useCandidateAuth } from "../../context/CandidateAuthContext";

export default function CandidateLogin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get("redirect") || "/careers";
  const { login } = useCandidateAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await login(email, password);
      if (res.status) {
        toast.success("Welcome back!");
        navigate(redirect);
      }
    } catch (err) {
      toast.error(err.message || "Invalid login credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <div className="rounded-3xl border border-slate-100 bg-white p-8 sm:p-10 shadow-2xl shadow-slate-200/50 space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Candidate Sign In</h1>
          <p className="text-sm font-medium text-slate-500">Sign in to apply for jobs and manage your applications.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 text-sm">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Email Address *</label>
            <div className="relative group">
              <Mail size={18} className="absolute left-4 top-3 text-slate-400 group-focus-within:text-brand-500 transition-colors" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-11 pr-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 font-medium focus:bg-white focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10 transition-all"
                placeholder="john@example.com"
                autoFocus
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Password *</label>
            <div className="relative group">
              <Lock size={18} className="absolute left-4 top-3 text-slate-400 group-focus-within:text-brand-500 transition-colors" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-11 pr-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 font-medium focus:bg-white focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10 transition-all"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-bold text-sm transition-all shadow-lg shadow-brand-500/20 hover:-translate-y-0.5 flex items-center justify-center gap-2"
          >
            {loading ? "Signing In..." : "Sign In"} <ArrowRight size={18} />
          </button>
        </form>

        <div className="text-center text-sm font-medium text-slate-500 pt-6 border-t border-slate-100">
          Don't have a candidate account?{" "}
          <Link to={`/careers/register?redirect=${encodeURIComponent(redirect)}`} className="font-bold text-brand-600 hover:text-brand-500 transition-colors">
            Create Account
          </Link>
        </div>
      </div>
    </div>
  );
}
