import { useState } from "react";
import { Link } from "react-router-dom";
import { Mail, ArrowRight, CheckCircle2 } from "lucide-react";
import toast from "react-hot-toast";
import { candidateApi } from "../../utils/api";

export default function CandidateForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await candidateApi.forgotPassword({ email });
      setSent(true);
    } catch (err) {
      toast.error(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-nx-paper px-4 py-16 sm:px-6">
      <div className="w-full max-w-md rounded-lg border border-nx-line bg-nx-surface p-8 shadow-[0_12px_28px_-18px_rgba(33,29,23,0.3)] sm:p-10">
        <div className="text-center">
          <h1 className="text-2xl font-black tracking-[-0.01em] text-nx-ink">Forgot Password</h1>
          <p className="mt-2 text-sm text-nx-muted">Enter your email and we'll send you instructions to reset your password.</p>
        </div>

        {sent ? (
          <div className="mt-8 space-y-4 py-4 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
              <CheckCircle2 size={26} className="text-emerald-600" />
            </div>
            <p className="text-sm text-nx-body">If that email is registered, a reset link is on its way. Check your inbox.</p>
            <Link
              to="/careers/login"
              className="inline-flex rounded-md bg-brand-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-brand-700"
            >
              Back to Sign In
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 space-y-5 text-sm">
            <div>
              <label className="mb-1.5 block text-xs font-bold text-nx-body">Email Address *</label>
              <div className="relative">
                <Mail size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-nx-faint" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-md border border-nx-line bg-nx-paper py-3 pl-10 pr-4 text-nx-ink placeholder-nx-faint outline-none transition-colors focus:border-brand-500 focus:bg-white"
                  placeholder="jane@example.com"
                  autoFocus
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-brand-600 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-brand-300"
            >
              {loading ? "Sending…" : "Send Reset Link"} <ArrowRight size={17} />
            </button>
          </form>
        )}

        <div className="mt-8 border-t border-nx-line pt-6 text-center text-sm text-nx-muted">
          <Link to="/careers/login" className="font-bold text-brand-700 transition-colors hover:text-brand-800">
            Back to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
