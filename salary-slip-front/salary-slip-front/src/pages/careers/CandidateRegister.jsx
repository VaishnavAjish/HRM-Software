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
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password !== form.password_confirmation) {
      toast.error("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await register(form);
      if (res.status) {
        toast.success("Account created successfully! Please verify your email.");
        navigate(redirect);
      }
    } catch (err) {
      toast.error(err.message || "Registration failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <div className="rounded-3xl border border-slate-100 bg-white p-8 sm:p-10 shadow-2xl shadow-slate-200/50 space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Create Candidate Account</h1>
          <p className="text-sm font-medium text-slate-500">Join our talent network to apply for open positions.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 text-sm">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Full Name *</label>
            <div className="relative group">
              <User size={18} className="absolute left-4 top-3 text-slate-400 group-focus-within:text-brand-500 transition-colors" />
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full pl-11 pr-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 font-medium focus:bg-white focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10 transition-all"
                placeholder="John Doe"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Email Address *</label>
            <div className="relative group">
              <Mail size={18} className="absolute left-4 top-3 text-slate-400 group-focus-within:text-brand-500 transition-colors" />
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full pl-11 pr-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 font-medium focus:bg-white focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10 transition-all"
                placeholder="john@example.com"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Phone Number</label>
            <div className="relative group">
              <Phone size={18} className="absolute left-4 top-3 text-slate-400 group-focus-within:text-brand-500 transition-colors" />
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full pl-11 pr-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 font-medium focus:bg-white focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10 transition-all"
                placeholder="+91 98765 43210"
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
                minLength={8}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full pl-11 pr-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 font-medium focus:bg-white focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10 transition-all"
                placeholder="At least 8 characters"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">Confirm Password *</label>
            <div className="relative group">
              <Lock size={18} className="absolute left-4 top-3 text-slate-400 group-focus-within:text-brand-500 transition-colors" />
              <input
                type="password"
                required
                value={form.password_confirmation}
                onChange={(e) => setForm({ ...form, password_confirmation: e.target.value })}
                className="w-full pl-11 pr-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-400 font-medium focus:bg-white focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10 transition-all"
                placeholder="Repeat password"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-bold text-sm transition-all shadow-lg shadow-brand-500/20 hover:-translate-y-0.5 flex items-center justify-center gap-2 mt-2"
          >
            {loading ? "Creating Account..." : "Create Account"} <ArrowRight size={18} />
          </button>
        </form>

        <div className="text-center text-sm font-medium text-slate-500 pt-6 border-t border-slate-100">
          Already have an account?{" "}
          <Link to={`/careers/login?redirect=${encodeURIComponent(redirect)}`} className="font-bold text-brand-600 hover:text-brand-500 transition-colors">
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
