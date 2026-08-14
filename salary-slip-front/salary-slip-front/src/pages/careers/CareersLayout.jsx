import { Link, Outlet } from "react-router-dom";
import { Briefcase, LogOut, FileText } from "lucide-react";
import { useCandidateAuth } from "../../context/CandidateAuthContext";

export default function CareersLayout() {
  const { candidate, isAuthenticated, logout } = useCandidateAuth();

  return (
    <div className="min-h-screen flex flex-col bg-slate-900 text-slate-100 font-sans">
      {/* Header Navbar */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/careers" className="flex items-center gap-2 text-xl font-bold tracking-tight text-white hover:text-brand-400 transition-colors">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-600 flex items-center justify-center text-white shadow-md">
              <Briefcase size={20} />
            </div>
            <span>Careers Portal</span>
          </Link>

          <nav className="flex items-center gap-4 text-sm font-medium">
            <Link to="/careers" className="text-slate-300 hover:text-white transition-colors">
              Explore Jobs
            </Link>

            {isAuthenticated ? (
              <div className="flex items-center gap-3">
                <Link
                  to="/careers/account/applications"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-brand-300 hover:bg-slate-700 transition-colors"
                >
                  <FileText size={16} /> My Applications
                </Link>
                <span className="text-slate-400 hidden sm:inline">|</span>
                <span className="text-slate-200 font-semibold hidden sm:inline">{candidate?.name}</span>
                <button
                  onClick={logout}
                  title="Logout"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-colors"
                >
                  <LogOut size={18} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  to="/careers/login"
                  className="px-3.5 py-1.5 rounded-lg text-slate-300 hover:text-white transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  to="/careers/register"
                  className="px-4 py-1.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white font-semibold shadow-md transition-all"
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
      <footer className="border-t border-slate-800 bg-slate-950 py-8 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4">
          <p>© {new Date().getFullYear()} NISS HRMS Recruitment. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
