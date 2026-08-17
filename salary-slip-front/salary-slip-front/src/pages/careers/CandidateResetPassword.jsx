import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Lock, ArrowRight, AlertCircle } from "lucide-react";
import toast from "react-hot-toast";
import { candidateApi } from "../../utils/api";

export default function CandidateResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const email = searchParams.get("email");
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [loading, setLoading] = useState(false);

  if (!email || !token) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-nx-paper px-4 py-16 sm:px-6">
        <div className="w-full max-w-md rounded-lg border border-nx-line bg-nx-surface p-8 text-center shadow-[0_12px_28px_-18px_rgba(33,29,23,0.3)] sm:p-10">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
            <AlertCircle size={26} className="text-red-500" />
          </div>
          <h2 className="mt-5 text-xl font-bold text-nx-ink">Invalid Reset Link</h2>
          <p className="mt-2 text-sm text-nx-muted">This password reset link is invalid or has expired.</p>
          <Link
            to="/careers/forgot-password"
            className="mt-6 inline-flex rounded-md bg-brand-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-brand-700"
          >
            Request a New Link
          </Link>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await candidateApi.resetPassword({
        email,
        token,
        password,
        password_confirmation: passwordConfirmation,
      });
      if (res.status) {
        toast.success("Password reset successfully. Please sign in.");
        navigate("/careers/login");
      } else {
        toast.error(res.message || "Password reset failed.");
      }
    } catch (err) {
      toast.error(err.message || "Password reset failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-nx-paper px-4 py-16 sm:px-6">
      <div className="w-full max-w-md rounded-lg border border-nx-line bg-nx-surface p-8 shadow-[0_12px_28px_-18px_rgba(33,29,23,0.3)] sm:p-10">
        <div className="text-center">
          <h1 className="text-2xl font-black tracking-[-0.01em] text-nx-ink">Reset Password</h1>
          <p className="mt-2 text-sm text-nx-muted">Choose a new password for {email}.</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5 text-sm">
          <div>
            <label className="mb-1.5 block text-xs font-bold text-nx-body">New Password *</label>
            <div className="relative">
              <Lock size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-nx-faint" />
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-nx-line bg-nx-paper py-3 pl-10 pr-4 text-nx-ink placeholder-nx-faint outline-none transition-colors focus:border-brand-500 focus:bg-white"
                placeholder="••••••••"
                autoFocus
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold text-nx-body">Confirm Password *</label>
            <div className="relative">
              <Lock size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-nx-faint" />
              <input
                type="password"
                required
                minLength={8}
                value={passwordConfirmation}
                onChange={(e) => setPasswordConfirmation(e.target.value)}
                className="w-full rounded-md border border-nx-line bg-nx-paper py-3 pl-10 pr-4 text-nx-ink placeholder-nx-faint outline-none transition-colors focus:border-brand-500 focus:bg-white"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-brand-600 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-brand-300"
          >
            {loading ? "Resetting…" : "Reset Password"} <ArrowRight size={17} />
          </button>
        </form>
      </div>
    </div>
  );
}
