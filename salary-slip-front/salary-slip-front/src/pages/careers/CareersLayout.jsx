import { Link, Outlet } from "react-router-dom";
import { Briefcase, LogOut, FileText } from "lucide-react";
import { useCandidateAuth } from "../../context/CandidateAuthContext";

export default function CareersLayout() {
  const { candidate, isAuthenticated, logout } = useCandidateAuth();

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 font-sans selection:bg-brand-500/30">
      {/* Header Navbar */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200/80 shadow-sm transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/careers" className="flex items-center gap-2.5 text-xl font-bold tracking-tight text-slate-900 hover:text-brand-600 transition-colors group">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-brand-500/20 group-hover:scale-105 transition-transform">
              <Briefcase size={20} />
            </div>
            <span>Careers Portal</span>
          </Link>

          <nav className="flex items-center gap-4 text-sm font-medium">
            <Link to="/careers" className="text-slate-600 hover:text-slate-900 transition-colors">
              Explore Jobs
            </Link>

            {isAuthenticated ? (
              <div className="flex items-center gap-3">
                <Link
                  to="/careers/account/applications"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm"
                >
                  <FileText size={16} className="text-brand-600" /> 
                  <span className="hidden sm:inline">My Applications</span>
                </Link>
                <span className="text-slate-300 hidden sm:inline">|</span>
                <span className="text-slate-700 font-semibold hidden sm:inline">{candidate?.name}</span>
                <button
                  onClick={logout}
                  title="Logout"
                  className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut size={18} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  to="/careers/login"
                  className="px-3.5 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  to="/careers/register"
                  className="px-4 py-1.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-semibold shadow-md shadow-brand-500/20 transition-all hover:-translate-y-0.5"
                >
                  Create Account
                </Link>
              </div>
            )}
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-8 text-center text-xs text-slate-500 mt-auto">
        <div className="max-w-7xl mx-auto px-4">
          <p>© {new Date().getFullYear()} NISS HRMS Recruitment. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
