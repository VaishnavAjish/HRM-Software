import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Menu, X, FileText, User, LogOut, Bookmark, CalendarClock, ChevronDown, Sparkles, Building2, ShieldCheck, ArrowUpRight } from "lucide-react";
import { useCandidateAuth } from "../../context/candidate-auth-context";

const ACCOUNT_LINKS = [
  { to: "/careers/account/applications", label: "My Applications", icon: FileText, desc: "Track application progress" },
  { to: "/careers/account/saved-jobs", label: "Saved Jobs", icon: Bookmark, desc: "View bookmarked roles" },
  { to: "/careers/account/interviews", label: "My Interviews", icon: CalendarClock, desc: "Scheduled rounds & feedback" },
  { to: "/careers/account/profile", label: "Candidate Profile", icon: User, desc: "Resume & experience details" },
];

function Wordmark({ className = "" }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 via-brand-500 to-indigo-600 text-white font-black text-sm shadow-md shadow-brand-500/25">
        N
      </div>
      <div className="flex flex-col leading-none">
        <span className="text-[17px] font-black tracking-tight text-gray-900 flex items-center gap-1.5">
          NISS <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-brand-50 text-brand-700 border border-brand-200/60 uppercase tracking-wider">Careers</span>
        </span>
        <span className="text-[10px] font-semibold text-gray-400 tracking-wide mt-0.5">
          Nidhi Impex &bull; Silver Star
        </span>
      </div>
    </div>
  );
}

export default function CareersLayout() {
  const { candidate, isAuthenticated, logout } = useCandidateAuth();
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const [menuPath, setMenuPath] = useState(location.pathname);
  if (menuPath !== location.pathname) {
    setMenuPath(location.pathname);
    setMenuOpen(false);
  }

  useEffect(() => {
    if (!accountMenuOpen) return undefined;
    const onClickOutside = (e) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target)) setAccountMenuOpen(false);
    };
    const onEscape = (e) => { if (e.key === "Escape") setAccountMenuOpen(false); };
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, [accountMenuOpen]);

  const candidateInitials = candidate?.name
    ? candidate.name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()
    : "CA";

  return (
    <div className="flex min-h-screen flex-col bg-[#fafafc] font-sans text-gray-900 selection:bg-brand-500 selection:text-white">
      {/* Top sticky navbar */}
      <header
        className={`sticky top-0 z-40 transition-all duration-300 ${
          scrolled
            ? "border-b border-gray-200/80 bg-white/90 backdrop-blur-lg shadow-sm"
            : "border-b border-gray-100 bg-white/95 backdrop-blur-md"
        }`}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/careers" className="outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-xl group transition-transform active:scale-95">
            <Wordmark />
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden items-center gap-5 text-sm font-semibold sm:flex">
            <NavLink
              to="/careers"
              end
              className={({ isActive }) =>
                `px-3.5 py-2 rounded-xl transition-all ${
                  isActive
                    ? "text-brand-600 bg-brand-50/80 font-bold"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-100/60"
                }`
              }
            >
              Explore Roles
            </NavLink>

            <a
              href="#culture"
              onClick={(e) => {
                if (location.pathname !== "/careers") return;
                e.preventDefault();
                document.getElementById("culture-section")?.scrollIntoView({ behavior: "smooth" });
              }}
              className="px-3.5 py-2 rounded-xl text-gray-600 hover:text-gray-900 hover:bg-gray-100/60 transition-all"
            >
              About Work Life
            </a>

            <div className="h-4 w-px bg-gray-200 mx-1" />

            {isAuthenticated ? (
              <div ref={accountMenuRef} className="relative">
                <button
                  onClick={() => setAccountMenuOpen((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={accountMenuOpen}
                  className={`inline-flex items-center gap-2.5 rounded-xl border px-3.5 py-1.5 transition-all duration-200 ${
                    accountMenuOpen
                      ? "border-brand-300 bg-brand-50/50 shadow-sm ring-2 ring-brand-500/10"
                      : "border-gray-200 bg-white hover:border-gray-300 shadow-sm"
                  }`}
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-tr from-brand-600 to-indigo-600 text-white font-bold text-xs shadow-sm">
                    {candidateInitials}
                  </div>
                  <div className="flex flex-col text-left leading-tight">
                    <span className="text-xs font-bold text-gray-900 max-w-[8rem] truncate">
                      {candidate?.name || "Candidate"}
                    </span>
                    <span className="text-[10px] font-medium text-emerald-600 flex items-center gap-0.5">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      Active
                    </span>
                  </div>
                  <ChevronDown size={14} className={`text-gray-400 transition-transform duration-200 ${accountMenuOpen ? "rotate-180 text-brand-600" : ""}`} />
                </button>

                {accountMenuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-full mt-2 w-64 rounded-2xl border border-gray-100 bg-white p-2 shadow-2xl ring-1 ring-black/5 animate-in fade-in slide-in-from-top-2 duration-150"
                  >
                    <div className="px-3 py-2 border-b border-gray-100 mb-1">
                      <p className="text-xs font-bold text-gray-900 truncate">{candidate?.name}</p>
                      <p className="text-[11px] text-gray-400 truncate mt-0.5">{candidate?.email}</p>
                    </div>

                    <div className="space-y-0.5">
                      {ACCOUNT_LINKS.map(({ to, label, icon: Icon, desc }) => (
                        <Link
                          key={to}
                          to={to}
                          role="menuitem"
                          onClick={() => setAccountMenuOpen(false)}
                          className="flex items-start gap-3 rounded-xl px-3 py-2 text-xs font-medium text-gray-700 hover:bg-brand-50/70 hover:text-brand-700 transition-colors"
                        >
                          <div className="mt-0.5 rounded-lg bg-gray-100 p-1.5 text-gray-600 group-hover:bg-brand-100 group-hover:text-brand-600">
                            <Icon size={14} />
                          </div>
                          <div>
                            <span className="font-bold block text-gray-900">{label}</span>
                            <span className="text-[10px] text-gray-400">{desc}</span>
                          </div>
                        </Link>
                      ))}
                    </div>

                    <div className="my-1.5 border-t border-gray-100" />
                    <button
                      role="menuitem"
                      onClick={logout}
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-bold text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <LogOut size={14} /> Sign out of account
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2.5">
                <Link
                  to="/careers/login"
                  className="rounded-xl px-4 py-2 text-xs font-bold text-gray-700 transition-all hover:bg-gray-100 hover:text-gray-900"
                >
                  Candidate Sign In
                </Link>
                <Link
                  to="/careers/register"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-brand-500/20 transition-all hover:from-brand-700 hover:to-indigo-700 active:scale-95"
                >
                  <Sparkles size={13} />
                  Join Our Team
                </Link>
              </div>
            )}
          </nav>

          {/* Mobile menu button */}
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded-xl p-2 text-gray-700 hover:bg-gray-100 sm:hidden transition-colors"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {/* Mobile dropdown */}
        {menuOpen && (
          <div className="border-t border-gray-200 bg-white px-4 py-5 sm:hidden shadow-lg animate-in slide-in-from-top-2">
            <nav className="flex flex-col gap-1 text-sm font-semibold">
              <Link to="/careers" className="rounded-xl px-3.5 py-2.5 text-gray-800 hover:bg-gray-100">
                Explore Roles
              </Link>
              {isAuthenticated ? (
                <>
                  <div className="my-2 border-t border-gray-100" />
                  <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">Candidate Dashboard</p>
                  {ACCOUNT_LINKS.map(({ to, label, icon: Icon }) => (
                    <Link key={to} to={to} className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-gray-700 hover:bg-brand-50 hover:text-brand-600">
                      <Icon size={16} /> {label}
                    </Link>
                  ))}
                  <button
                    onClick={logout}
                    className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left text-red-600 hover:bg-red-50"
                  >
                    <LogOut size={16} /> Sign out
                  </button>
                </>
              ) : (
                <div className="mt-3 flex flex-col gap-2 pt-2 border-t border-gray-100">
                  <Link to="/careers/login" className="rounded-xl px-3.5 py-2.5 text-center text-gray-800 border border-gray-200 font-bold">
                    Sign In
                  </Link>
                  <Link
                    to="/careers/register"
                    className="rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 px-3.5 py-2.5 text-center text-white font-bold shadow-md shadow-brand-500/20"
                  >
                    Create Account
                  </Link>
                </div>
              )}
            </nav>
          </div>
        )}
      </header>

      {/* Main Page Content */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* Modern High-End Footer */}
      <footer className="mt-auto border-t border-gray-200/80 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-4 lg:grid-cols-5">
            <div className="md:col-span-2">
              <Wordmark />
              <p className="mt-3.5 max-w-sm text-xs leading-relaxed text-gray-500">
                Nidhi Impex Silver Star is a premier manufacturing and diamond processing group located in Surat, Gujarat. Empowering talent with modern craft, innovation, and long-term career growth.
              </p>
              <div className="mt-4 flex items-center gap-2">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                  <ShieldCheck size={12} /> Equal Opportunity Employer
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200/60">
                  <Building2 size={12} /> Surat, Gujarat HQ
                </span>
              </div>
            </div>

            <div>
              <p className="text-xs font-black uppercase tracking-wider text-gray-900">Opportunities</p>
              <ul className="mt-3.5 space-y-2.5 text-xs font-medium text-gray-600">
                <li><Link to="/careers" className="hover:text-brand-600 transition-colors">All Open Positions</Link></li>
                <li><Link to="/careers/register" className="hover:text-brand-600 transition-colors">Candidate Registration</Link></li>
                <li><Link to="/careers/login" className="hover:text-brand-600 transition-colors">Candidate Login</Link></li>
              </ul>
            </div>

            <div>
              <p className="text-xs font-black uppercase tracking-wider text-gray-900">Candidate Hub</p>
              <ul className="mt-3.5 space-y-2.5 text-xs font-medium text-gray-600">
                <li><Link to="/careers/account/applications" className="hover:text-brand-600 transition-colors">Track Applications</Link></li>
                <li><Link to="/careers/account/saved-jobs" className="hover:text-brand-600 transition-colors">Saved Job Roles</Link></li>
                <li><Link to="/careers/account/interviews" className="hover:text-brand-600 transition-colors">Interview Schedules</Link></li>
              </ul>
            </div>

            <div>
              <p className="text-xs font-black uppercase tracking-wider text-gray-900">Internal Portal</p>
              <ul className="mt-3.5 space-y-2.5 text-xs font-medium text-gray-600">
                <li><Link to="/about-niss" className="hover:text-brand-600 transition-colors">About the Group</Link></li>
                <li>
                  <Link to="/login" className="inline-flex items-center gap-1 text-brand-600 font-bold hover:text-brand-700 transition-colors">
                    Employee Portal <ArrowUpRight size={12} />
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-10 border-t border-gray-100 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-400">
            <p>© {new Date().getFullYear()} Nidhi Impex Silver Star Group. All rights reserved.</p>
            <p className="text-[11px] text-gray-400">Designed for modern talent acquisition.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

