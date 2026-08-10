import { Link } from "react-router-dom";
import {
  Users,
  CalendarCheck,
  CreditCard,
  FileText,
  ShieldCheck,
  UserPlus,
  HelpCircle,
  BarChart3,
  ArrowLeft,
  Building2,
  Sparkles,
} from "lucide-react";

export default function AboutNiss() {
  const capabilities = [
    {
      title: "Employee Management",
      desc: "Centralized employee directory, profile management, department structures, and designation tracking.",
      icon: Users,
      color: "text-blue-600 bg-blue-50 dark:bg-blue-900/30",
    },
    {
      title: "Attendance & Shift Roster",
      desc: "Real-time attendance tracking, shift allocation, punch logs, and shift roster management.",
      icon: CalendarCheck,
      color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30",
    },
    {
      title: "Payroll & TDS Processing",
      desc: "Automated monthly salary calculation, TDS deduction schedules, Form 16 view, and salary slip distribution.",
      icon: CreditCard,
      color: "text-purple-600 bg-purple-50 dark:bg-purple-900/30",
    },
    {
      title: "Employee Self Service (ESS)",
      desc: "Self-service portal for employees to view payslips, download tax forms, update profile details, and track leave.",
      icon: FileText,
      color: "text-amber-600 bg-amber-50 dark:bg-amber-900/30",
    },
    {
      title: "Onboarding & HR Operations",
      desc: "Structured onboarding journeys, document verification, offer letters, and asset allocations.",
      icon: UserPlus,
      color: "text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30",
    },
    {
      title: "Helpdesk & Support Tickets",
      desc: "Internal support ticketing system with SLA rule enforcement, department routing, and status tracking.",
      icon: HelpCircle,
      color: "text-rose-600 bg-rose-50 dark:bg-rose-900/30",
    },
    {
      title: "Security & Governance",
      desc: "Role-Based Access Control (RBAC), multi-level authorization, audit logging, and document encryption.",
      icon: ShieldCheck,
      color: "text-cyan-600 bg-cyan-50 dark:bg-cyan-900/30",
    },
    {
      title: "Reports & HR Analytics",
      desc: "Comprehensive analytics, headcount reporting, attendance trends, and executive dashboards.",
      icon: BarChart3,
      color: "text-teal-600 bg-teal-50 dark:bg-teal-900/30",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 text-slate-900 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 dark:text-gray-100 font-sans">
      {/* Header Bar */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-white/80 dark:bg-gray-900/80 border-b border-gray-200 dark:border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center text-white shadow-md shadow-brand-600/30">
              <Building2 size={22} />
            </div>
            <div>
              <span className="font-bold text-lg text-gray-900 dark:text-white leading-none block">
                NISS HRMS
              </span>
              <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                Nidhi Impex Silver Star
              </span>
            </div>
          </div>

          <Link
            to="/login"
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-xl transition-all shadow-sm shadow-brand-600/30"
          >
            Sign In to Portal
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-50 dark:bg-brand-950/60 border border-brand-200 dark:border-brand-800 text-brand-700 dark:text-brand-300 text-xs font-semibold">
            <Sparkles size={14} /> Official Brand & System Information
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-gray-900 dark:text-white">
            NISS HRMS – Nidhi Impex Silver Star
          </h1>

          <p className="text-lg sm:text-xl font-medium text-brand-600 dark:text-brand-400">
            Nidhi Impex Silver Star Human Resource Management System
          </p>

          <p className="max-w-3xl mx-auto text-sm sm:text-base text-gray-600 dark:text-gray-300 leading-relaxed pt-2">
            <strong>NISS</strong> stands for <strong>Nidhi Impex Silver Star</strong>.
            <br />
            <strong>NISS HRMS</strong> is the unified Human Resource Management System of Nidhi Impex Silver Star, engineered for enterprise workforce management, automated attendance, leave processing, salary slips, payroll, HR operations, and employee self-service.
          </p>
        </div>

        {/* Semantic Relationship Card */}
        <section className="mt-12 p-6 sm:p-8 rounded-3xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm space-y-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Building2 size={20} className="text-brand-600" /> About Nidhi Impex Silver Star (NISS)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700/50">
              <span className="text-xs font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-400">
                Short Name / Acronym
              </span>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">NISS</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                NISS refers directly to Nidhi Impex Silver Star across all internal and public operations.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700/50">
              <span className="text-xs font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-400">
                Human Resource Platform
              </span>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white mt-1">NISS HRMS</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                The comprehensive Human Resource Management System built specifically for Nidhi Impex Silver Star.
              </p>
            </div>
          </div>
        </section>

        {/* System Capabilities Grid */}
        <section className="mt-12 space-y-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              NISS HRMS System Capabilities
            </h2>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
              Core modules providing streamlined workforce operations for Nidhi Impex Silver Star
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {capabilities.map((cap) => {
              const Icon = cap.icon;
              return (
                <div
                  key={cap.title}
                  className="p-5 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
                >
                  <div>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${cap.color}`}>
                      <Icon size={20} />
                    </div>
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                      {cap.title}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed">
                      {cap.desc}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Back Link */}
        <div className="mt-12 text-center">
          <Link
            to="/login"
            className="inline-flex items-center gap-2 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline"
          >
            <ArrowLeft size={14} /> Return to NISS HRMS Login Page
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-16 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 py-8 text-center text-xs text-gray-500 dark:text-gray-400">
        <div className="max-w-5xl mx-auto px-4 space-y-2">
          <p className="font-semibold text-gray-700 dark:text-gray-300">
            NISS HRMS – Nidhi Impex Silver Star Human Resource Management System
          </p>
          <p>© {new Date().getFullYear()} Nidhi Impex Silver Star. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
