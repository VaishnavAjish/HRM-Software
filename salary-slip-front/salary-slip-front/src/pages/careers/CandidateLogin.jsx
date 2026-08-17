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
    if (loading) return;
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
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-nx-paper px-4 py-16 sm:px-6">
      <div className="w-full max-w-md rounded-lg border border-nx-line bg-nx-surface p-8 shadow-[0_12px_28px_-18px_rgba(33,29,23,0.3)] sm:p-10">
        <div className="text-center">
          <h1 className="text-2xl font-black tracking-[-0.01em] text-nx-ink">Sign In</h1>
          <p className="mt-2 text-sm text-nx-muted">Sign in to apply for jobs and manage your applications.</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5 text-sm">
          <div>
            <label className="mb-1.5 block text-xs font-bold text-nx-body">Email Address *</label>
            <div className="relative">
              <Mail size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-nx-faint" />
              <input
                type="email"
                required
                disabled={loading}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-nx-line bg-nx-paper py-3 pl-10 pr-4 text-nx-ink placeholder-nx-faint outline-none transition-colors focus:border-brand-500 focus:bg-white disabled:opacity-60"
                placeholder="john@example.com"
                autoFocus
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold text-nx-body">Password *</label>
            <div className="relative">
              <Lock size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-nx-faint" />
              <input
                type="password"
                required
                disabled={loading}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-nx-line bg-nx-paper py-3 pl-10 pr-4 text-nx-ink placeholder-nx-faint outline-none transition-colors focus:border-brand-500 focus:bg-white disabled:opacity-60"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-brand-600 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-brand-300"
          >
            {loading ? "Signing In…" : "Sign In"} <ArrowRight size={17} />
          </button>

          <div className="text-center">
            <Link to="/careers/forgot-password" className="text-xs font-bold text-nx-muted transition-colors hover:text-brand-700">
              Forgot your password?
            </Link>
          </div>
        </form>

        <div className="mt-8 border-t border-nx-line pt-6 text-center text-sm text-nx-muted">
          Don't have an account?{" "}
          <Link to={`/careers/register?redirect=${encodeURIComponent(redirect)}`} className="font-bold text-brand-700 transition-colors hover:text-brand-800">
            Create Account
          </Link>
        </div>
      </div>
    </div>
  );
}
