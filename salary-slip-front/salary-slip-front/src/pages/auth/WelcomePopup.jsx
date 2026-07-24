/* global __APP_LABEL__ */
const APP_LABEL =
  typeof __APP_LABEL__ !== "undefined" ? __APP_LABEL__ : "Master Admin";

import { useState } from "react";
import {
  X,
  ClipboardList,
  Building2,
  Users,
  DollarSign,
  Receipt,
  Shield,
  CheckCircle2,
  Sparkles,
  FileText,
  ChevronRight,
  Camera,
  Mail,
  KeyRound,
  UserCheck,
} from "lucide-react";
import { COMPANY_OPTIONS } from "../../config/companyConfig";

const IS_ADMIN_BRANCH = COMPANY_OPTIONS.length > 1;

export default function WelcomePopup({ onDismiss, onSetup }) {
  const [step, setStep] = useState(0);

  const Blobs = () => (
    <>
      <div className="absolute -top-14 -right-14 w-56 h-56 rounded-full bg-white/10 pointer-events-none" />
      <div className="absolute -bottom-12 -left-12 w-48 h-48 rounded-full bg-white/8 pointer-events-none" />
      <div className="absolute top-5 right-56 w-16 h-16 rounded-full bg-white/6 pointer-events-none" />
    </>
  );

  const Dots = ({ active }) => (
    <div className="flex gap-2 items-center">
      <div className={`h-2.5 rounded-full transition-all ${active === 0 ? "w-7 bg-brand-600" : "w-2.5 bg-gray-200 dark:bg-gray-700"}`} />
      <div className={`h-2.5 rounded-full transition-all ${active === 1 ? "w-7 bg-brand-600" : "w-2.5 bg-gray-200 dark:bg-gray-700"}`} />
    </div>
  );

  const Shell = ({ children }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-6xl h-[78vh] flex flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );

  /* ── ADMIN BRANCH (master) ── */
  if (IS_ADMIN_BRANCH) return (
    <Shell>
      {step === 0 && (
        <>
          <div className="relative overflow-hidden flex-shrink-0 bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 px-12 py-8">
            <Blobs />
            <button onClick={onDismiss} className="absolute top-5 right-5 p-2 rounded-xl bg-white/15 hover:bg-white/25 text-white transition-colors"><X size={18} /></button>
            <div className="relative z-10 flex items-center gap-6">
              <div className="w-[72px] h-[72px] rounded-2xl bg-white/20 border border-white/25 flex items-center justify-center flex-shrink-0 shadow-xl"><ClipboardList size={32} className="text-white" /></div>
              <div>
                <h2 className="text-3xl font-bold text-white leading-tight">Welcome to {APP_LABEL}</h2>
                <p className="text-base text-white/70 mt-1.5">Complete HR & salary management — here's what you can control</p>
              </div>
            </div>
          </div>
          <div className="flex-1 px-12 py-8 flex flex-col overflow-hidden">
            <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-5 flex-shrink-0">What you can manage</p>
            <div className="grid grid-cols-4 gap-5 flex-1">
              {[
                { icon: Users,         label: "Employee Management", desc: "Add, view and manage all employee records across both companies and branches. Keep profiles and details up to date.", bg: "bg-brand-50 dark:bg-brand-900/20",   ic: "text-brand-600 dark:text-brand-400",  dot: "bg-brand-500" },
                { icon: DollarSign,    label: "Salary Processing",   desc: "Calculate, review and publish monthly salaries with a full breakdown of earnings, allowances and deductions per employee.", bg: "bg-green-50 dark:bg-green-900/20",   ic: "text-green-600 dark:text-green-400",  dot: "bg-green-500" },
                { icon: Receipt,       label: "Form 16 Management",  desc: "Generate and issue annual Form 16 tax certificates for all employees to help them file their income tax returns.", bg: "bg-purple-50 dark:bg-purple-900/20", ic: "text-purple-600 dark:text-purple-400", dot: "bg-purple-500" },
                { icon: ClipboardList, label: "Appointments",        desc: "Review employee appointment requests submitted online. Track the full status of each request.", bg: "bg-orange-50 dark:bg-orange-900/20", ic: "text-orange-500 dark:text-orange-400", dot: "bg-orange-500" },
              ].map(({ icon: Icon, label, desc, bg, ic, dot }) => (
                <div key={label} className={`${bg} rounded-2xl p-6 flex flex-col gap-4 h-full`}>
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-white dark:bg-gray-800 flex items-center justify-center shadow-sm flex-shrink-0"><Icon size={20} className={ic} /></div>
                    <span className={`w-2.5 h-2.5 rounded-full ${dot}`} />
                  </div>
                  <div className="flex-1 flex flex-col gap-2">
                    <p className="text-base font-bold text-gray-800 dark:text-white leading-tight">{label}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex-shrink-0 px-12 py-5 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <Dots active={0} />
            <button onClick={() => setStep(1)} className="flex items-center gap-2 px-8 py-3.5 bg-brand-600 hover:bg-brand-700 text-white rounded-2xl font-semibold text-sm transition-colors shadow-lg shadow-brand-600/20">
              Next — Admin capabilities <ChevronRight size={16} />
            </button>
          </div>
        </>
      )}
      {step === 1 && (
        <>
          <div className="relative overflow-hidden flex-shrink-0 bg-gradient-to-br from-indigo-600 via-brand-700 to-brand-900 px-12 py-8">
            <Blobs />
            <button onClick={onDismiss} className="absolute top-5 right-5 p-2 rounded-xl bg-white/15 hover:bg-white/25 text-white transition-colors"><X size={18} /></button>
            <div className="relative z-10 flex items-center gap-6">
              <div className="w-[72px] h-[72px] rounded-2xl bg-white/20 border border-white/25 flex items-center justify-center flex-shrink-0 shadow-xl"><Building2 size={32} className="text-white" /></div>
              <div>
                <h2 className="text-3xl font-bold text-white leading-tight">Powerful Admin Capabilities</h2>
                <p className="text-base text-white/70 mt-1.5">Everything you need to run HR operations across both companies</p>
              </div>
            </div>
          </div>
          <div className="flex-1 px-12 py-8 flex flex-col overflow-hidden">
            <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-5 flex-shrink-0">Key admin features</p>
            <div className="grid grid-cols-3 gap-6 flex-1">
              {[
                { icon: Building2, num: "01", title: "Multi-Company & Branch Scope",   desc: "Switch seamlessly between Nidhi Impex and Silver Star, or view a combined dashboard across all branches from a single admin account.", items: ["Nidhi Impex — Shreeji & Ichapur", "Silver Star — Daduk & Ichapur", "Combined all-company view"], color: "bg-brand-600", light: "bg-brand-50 dark:bg-brand-900/20", tc: "text-brand-600 dark:text-brand-400", border: "border-brand-100 dark:border-brand-800" },
                { icon: Users,     num: "02", title: "Full Employee Lifecycle",        desc: "Manage every stage of an employee's journey — from onboarding and profile updates to salary processing and annual tax document generation.", items: ["Add & edit employee profiles", "Assign to company & branch", "Track salary history"], color: "bg-indigo-500", light: "bg-indigo-50 dark:bg-indigo-900/20", tc: "text-indigo-600 dark:text-indigo-400", border: "border-indigo-100 dark:border-indigo-800" },
                { icon: Shield,    num: "03", title: "Secure Access Control",          desc: "Employees verify their identity before getting portal access. Admins have full visibility over who has active login credentials.", items: ["Employee identity verification", "OTP-based email confirmation", "Admin-controlled access"], color: "bg-emerald-500", light: "bg-emerald-50 dark:bg-emerald-900/20", tc: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-100 dark:border-emerald-800" },
              ].map(({ icon: Icon, num, title, desc, items, color, light, tc, border }) => (
                <div key={num} className={`${light} border ${border} rounded-2xl p-6 flex flex-col gap-4 h-full`}>
                  <div className="flex items-start justify-between">
                    <div className={`w-12 h-12 rounded-xl ${color} flex items-center justify-center shadow-md`}><Icon size={20} className="text-white" /></div>
                    <span className={`text-4xl font-black ${tc} opacity-15 leading-none`}>{num}</span>
                  </div>
                  <div className="flex-1 flex flex-col gap-2">
                    <p className="text-base font-bold text-gray-800 dark:text-white leading-tight">{title}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{desc}</p>
                  </div>
                  <div className="flex flex-col gap-2 pt-3 border-t border-gray-200/70 dark:border-gray-700/70">
                    {items.map((item) => (
                      <div key={item} className="flex items-center gap-2.5">
                        <CheckCircle2 size={13} className={tc} />
                        <span className="text-xs text-gray-600 dark:text-gray-300 font-medium">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex-shrink-0 px-12 py-5 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Dots active={1} />
              <button onClick={() => setStep(0)} className="text-sm text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 font-medium transition-colors">← Back</button>
            </div>
            <button onClick={onSetup} className="flex items-center gap-2 px-8 py-3.5 bg-brand-600 hover:bg-brand-700 text-white rounded-2xl font-semibold text-sm transition-colors shadow-lg shadow-brand-600/20">
              Get Started — Set Password
            </button>
          </div>
        </>
      )}
    </Shell>
  );

  /* ── EMPLOYEE BRANCHES (nidhi-impex / silver-star) ── */
  return (
    <Shell>
      {step === 0 && (
        <>
          <div className="relative overflow-hidden flex-shrink-0 bg-gradient-to-br from-brand-500 via-brand-600 to-brand-900 px-12 py-8">
            <Blobs />
            <button onClick={onDismiss} className="absolute top-5 right-5 p-2 rounded-xl bg-white/15 hover:bg-white/25 text-white transition-colors"><X size={18} /></button>
            <div className="relative z-10 flex items-center gap-6">
              <div className="w-[72px] h-[72px] rounded-2xl bg-white/20 border border-white/25 flex items-center justify-center flex-shrink-0 shadow-xl"><Sparkles size={32} className="text-white" /></div>
              <div>
                <h2 className="text-3xl font-bold text-white leading-tight">Welcome to {APP_LABEL}</h2>
                <p className="text-base text-white/70 mt-1.5">Your all-in-one salary portal — here's everything you can access</p>
              </div>
            </div>
          </div>
          <div className="flex-1 px-12 py-8 flex flex-col overflow-hidden">
            <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-5 flex-shrink-0">What you get</p>
            <div className="grid grid-cols-4 gap-5 flex-1">
              {[
                { icon: FileText,      label: "Payslips",       desc: "View and download your monthly salary slips anytime, anywhere — no more waiting for HR to hand them out.", bg: "bg-brand-50 dark:bg-brand-900/20",   ic: "text-brand-600 dark:text-brand-400", dot: "bg-brand-500" },
                { icon: DollarSign,    label: "Salary Breakup", desc: "See a complete breakdown of your gross pay, all allowances, every deduction, and your final net take-home amount.", bg: "bg-green-50 dark:bg-green-900/20",   ic: "text-green-600 dark:text-green-400", dot: "bg-green-500" },
                { icon: Receipt,       label: "Form 16",        desc: "Download your annual Form 16 tax certificate instantly for quick and hassle-free income tax return filing.", bg: "bg-purple-50 dark:bg-purple-900/20", ic: "text-purple-600 dark:text-purple-400", dot: "bg-purple-500" },
                { icon: ClipboardList, label: "Appointments",   desc: "Submit appointment requests online and track their real-time approval status — no paperwork needed.", bg: "bg-orange-50 dark:bg-orange-900/20", ic: "text-orange-500 dark:text-orange-400", dot: "bg-orange-500" },
              ].map(({ icon: Icon, label, desc, bg, ic, dot }) => (
                <div key={label} className={`${bg} rounded-2xl p-6 flex flex-col gap-4 h-full`}>
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-white dark:bg-gray-800 flex items-center justify-center shadow-sm flex-shrink-0"><Icon size={20} className={ic} /></div>
                    <span className={`w-2.5 h-2.5 rounded-full ${dot}`} />
                  </div>
                  <div className="flex-1 flex flex-col gap-2">
                    <p className="text-base font-bold text-gray-800 dark:text-white leading-tight">{label}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex-shrink-0 px-12 py-5 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <Dots active={0} />
            <button onClick={() => setStep(1)} className="flex items-center gap-2 px-8 py-3.5 bg-brand-600 hover:bg-brand-700 text-white rounded-2xl font-semibold text-sm transition-colors shadow-lg shadow-brand-600/20">
              Next — How to get started <ChevronRight size={16} />
            </button>
          </div>
        </>
      )}
      {step === 1 && (
        <>
          <div className="relative overflow-hidden flex-shrink-0 bg-gradient-to-br from-violet-500 via-brand-600 to-brand-900 px-12 py-8">
            <Blobs />
            <button onClick={onDismiss} className="absolute top-5 right-5 p-2 rounded-xl bg-white/15 hover:bg-white/25 text-white transition-colors"><X size={18} /></button>
            <div className="relative z-10 flex items-center gap-6">
              <div className="w-[72px] h-[72px] rounded-2xl bg-white/20 border border-white/25 flex items-center justify-center flex-shrink-0 shadow-xl"><UserCheck size={32} className="text-white" /></div>
              <div>
                <h2 className="text-3xl font-bold text-white leading-tight">Getting Started Is Easy</h2>
                <p className="text-base text-white/70 mt-1.5">First-time users complete 3 quick steps before logging in</p>
              </div>
            </div>
          </div>
          <div className="flex-1 px-12 py-8 flex flex-col overflow-hidden">
            <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400 mb-5 flex-shrink-0">3 quick steps</p>
            <div className="grid grid-cols-3 gap-6 flex-1">
              {[
                { icon: Camera,   num: "01", title: "Verify Your Identity", desc: "Provide your employee code and fill in your mobile number, date of birth and residential address. You can optionally add a recent photo. This confirms you are a registered employee.", items: ["Employee code", "Mobile number", "Date of birth", "Home address", "Photo (optional)"], color: "bg-brand-600", light: "bg-brand-50 dark:bg-brand-900/20", tc: "text-brand-600 dark:text-brand-400", border: "border-brand-100 dark:border-brand-800" },
                { icon: Mail,     num: "02", title: "Verify Your Email",    desc: "We will send a one-time password (OTP) to your registered company email address. Enter the OTP in the form to confirm your identity and proceed to the next step.", items: ["Company email address", "4-digit OTP from inbox"], color: "bg-violet-500", light: "bg-violet-50 dark:bg-violet-900/20", tc: "text-violet-600 dark:text-violet-400", border: "border-violet-100 dark:border-violet-800" },
                { icon: KeyRound, num: "03", title: "Set Your Password",    desc: "Create a strong, secure password that you will use for every future login. Your password must meet the minimum security requirements listed below.", items: ["Minimum 6 characters", "At least one uppercase letter", "One number & one symbol"], color: "bg-emerald-500", light: "bg-emerald-50 dark:bg-emerald-900/20", tc: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-100 dark:border-emerald-800" },
              ].map(({ icon: Icon, num, title, desc, items, color, light, tc, border }) => (
                <div key={num} className={`${light} border ${border} rounded-2xl p-6 flex flex-col gap-4 h-full`}>
                  <div className="flex items-start justify-between">
                    <div className={`w-12 h-12 rounded-xl ${color} flex items-center justify-center shadow-md`}><Icon size={20} className="text-white" /></div>
                    <span className={`text-4xl font-black ${tc} opacity-15 leading-none`}>{num}</span>
                  </div>
                  <div className="flex-1 flex flex-col gap-2">
                    <p className="text-base font-bold text-gray-800 dark:text-white leading-tight">{title}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{desc}</p>
                  </div>
                  <div className="flex flex-col gap-2 pt-3 border-t border-gray-200/70 dark:border-gray-700/70">
                    {items.map((item) => (
                      <div key={item} className="flex items-center gap-2.5">
                        <CheckCircle2 size={13} className={tc} />
                        <span className="text-xs text-gray-600 dark:text-gray-300 font-medium">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex-shrink-0 px-12 py-5 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Dots active={1} />
              <button onClick={() => setStep(0)} className="text-sm text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 font-medium transition-colors">← Back</button>
            </div>
            <button onClick={onSetup} className="flex items-center gap-2 px-8 py-3.5 bg-brand-600 hover:bg-brand-700 text-white rounded-2xl font-semibold text-sm transition-colors shadow-lg shadow-brand-600/20">
              Get Started — Set Password
            </button>
          </div>
        </>
      )}
    </Shell>
  );
}
