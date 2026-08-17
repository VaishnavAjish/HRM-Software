import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { User, Mail, Lock, Phone, ArrowRight } from "lucide-react";
import toast from "react-hot-toast";
import { useCandidateAuth } from "../../context/CandidateAuthContext";

export default function CandidateRegister() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get("redirect") || "/careers";
  const { register } = useCandidateAuth();

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    password_confirmation: "",
    phone: "",
  });
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password !== form.password_confirmation) {
      toast.error("Passwords do not match.");
      return;
    }
    if (!agreed) {
      toast.error("Please agree to the Terms & Privacy Policy to continue.");
      return;
    }

    setLoading(true);
    try {
      const res = await register(form);
      if (res.status) {
        toast.success("Account created! Please check your inbox to verify your email.");
        navigate(redirect);
      }
    } catch (err) {
      toast.error(err.message || "Registration failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-nx-paper px-4 py-16 sm:px-6">
      <div className="w-full max-w-md rounded-lg border border-nx-line bg-nx-surface p-8 shadow-[0_12px_28px_-18px_rgba(33,29,23,0.3)] sm:p-10">
        <div className="text-center">
          <h1 className="text-2xl font-black tracking-[-0.01em] text-nx-ink">Create Your Career Profile</h1>
          <p className="mt-2 text-sm text-nx-muted">Start your journey with us.</p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5 text-sm">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-bold text-nx-body">First Name *</label>
              <div className="relative">
                <User size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-nx-faint" />
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-md border border-nx-line bg-nx-paper py-3 pl-10 pr-4 text-nx-ink placeholder-nx-faint outline-none transition-colors focus:border-brand-500 focus:bg-white"
                  placeholder="Jane Doe"
                  autoFocus
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-bold text-nx-body">Phone</label>
              <div className="relative">
                <Phone size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-nx-faint" />
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full rounded-md border border-nx-line bg-nx-paper py-3 pl-10 pr-4 text-nx-ink placeholder-nx-faint outline-none transition-colors focus:border-brand-500 focus:bg-white"
                  placeholder="+91 98765 43210"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold text-nx-body">Email Address *</label>
            <div className="relative">
              <Mail size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-nx-faint" />
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full rounded-md border border-nx-line bg-nx-paper py-3 pl-10 pr-4 text-nx-ink placeholder-nx-faint outline-none transition-colors focus:border-brand-500 focus:bg-white"
                placeholder="jane@example.com"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-bold text-nx-body">Password *</label>
              <div className="relative">
                <Lock size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-nx-faint" />
                <input
                  type="password"
                  required
                  minLength={8}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full rounded-md border border-nx-line bg-nx-paper py-3 pl-10 pr-4 text-nx-ink placeholder-nx-faint outline-none transition-colors focus:border-brand-500 focus:bg-white"
                  placeholder="At least 8 characters"
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
                  value={form.password_confirmation}
                  onChange={(e) => setForm({ ...form, password_confirmation: e.target.value })}
                  className="w-full rounded-md border border-nx-line bg-nx-paper py-3 pl-10 pr-4 text-nx-ink placeholder-nx-faint outline-none transition-colors focus:border-brand-500 focus:bg-white"
                  placeholder="Repeat password"
                />
              </div>
            </div>
          </div>

          <label className="flex cursor-pointer items-start gap-2.5 text-xs text-nx-muted">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 rounded border-nx-line2 text-brand-600 focus:ring-brand-500"
            />
            I agree to the Terms of Service and Privacy Policy.
          </label>

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-brand-600 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-brand-300"
          >
            {loading ? "Creating Account…" : "Create Account"} <ArrowRight size={17} />
          </button>
        </form>

        <div className="mt-8 border-t border-nx-line pt-6 text-center text-sm text-nx-muted">
          Already have an account?{" "}
          <Link to={`/careers/login?redirect=${encodeURIComponent(redirect)}`} className="font-bold text-brand-700 transition-colors hover:text-brand-800">
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
