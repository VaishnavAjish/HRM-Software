import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Menu, X, FileText, User, LogOut, Bookmark, CalendarClock, ChevronDown } from "lucide-react";
import { useCandidateAuth } from "../../context/CandidateAuthContext";

const ACCOUNT_LINKS = [
  { to: "/careers/account/applications", label: "My Applications", icon: FileText },
  { to: "/careers/account/saved-jobs", label: "Saved Jobs", icon: Bookmark },
  { to: "/careers/account/interviews", label: "My Interviews", icon: CalendarClock },
  { to: "/careers/account/profile", label: "Profile", icon: User },
];

function Wordmark({ className = "" }) {
  return (
    <span className={`flex flex-col leading-none ${className}`}>
      <span className="text-[19px] font-black tracking-[-0.01em] text-nx-ink">
        NISS
      </span>
      <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-brand-600">
        Careers
      </span>
    </span>
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
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => setMenuOpen(false), [location.pathname]);

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

  return (
    <div className="flex min-h-screen flex-col bg-nx-paper font-sans text-nx-ink selection:bg-brand-200/60">
      <header
        className={`sticky top-0 z-40 border-b bg-white/95 backdrop-blur-md transition-shadow duration-300 ${
          scrolled ? "border-nx-line shadow-[0_1px_0_0_rgba(33,29,23,0.04)]" : "border-transparent"
        }`}
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/careers" className="outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-sm">
            <Wordmark />
          </Link>

          <nav className="hidden items-center gap-6 text-sm font-semibold sm:flex">
            <NavLink
              to="/careers"
              end
              className={({ isActive }) =>
                `transition-colors ${isActive ? "text-nx-ink" : "text-nx-muted hover:text-nx-ink"}`
              }
            >
              Open Positions
            </NavLink>

            {isAuthenticated ? (
              <div ref={accountMenuRef} className="relative">
                <button
                  onClick={() => setAccountMenuOpen((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={accountMenuOpen}
                  className="inline-flex items-center gap-1.5 rounded-md border border-nx-line bg-nx-surface px-3 py-1.5 text-nx-body transition-colors hover:border-nx-line2"
                >
                  <User size={15} className="text-brand-600" />
                  <span className="max-w-[10rem] truncate">{candidate?.name || "Account"}</span>
                  <ChevronDown size={14} className={`text-nx-faint transition-transform ${accountMenuOpen ? "rotate-180" : ""}`} />
                </button>

                {accountMenuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-full mt-2 w-56 rounded-lg border border-nx-line bg-nx-surface py-1.5 shadow-[0_12px_28px_-16px_rgba(33,29,23,0.35)]"
                  >
                    {ACCOUNT_LINKS.map(({ to, label, icon: Icon }) => (
                      <Link
                        key={to}
                        to={to}
                        role="menuitem"
                        onClick={() => setAccountMenuOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-nx-body hover:bg-nx-paper"
                      >
                        <Icon size={15} className="text-brand-600" /> {label}
                      </Link>
                    ))}
                    <div className="my-1.5 border-t border-nx-line" />
                    <button
                      role="menuitem"
                      onClick={logout}
                      className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm font-semibold text-red-600 hover:bg-red-50"
                    >
                      <LogOut size={15} /> Sign out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  to="/careers/login"
                  className="rounded-md px-3 py-1.5 text-nx-body transition-colors hover:text-nx-ink"
                >
                  Sign In
                </Link>
                <Link
                  to="/careers/register"
                  className="rounded-md bg-brand-600 px-4 py-1.5 text-white shadow-sm transition-colors hover:bg-brand-700"
                >
                  Create Account
                </Link>
              </div>
            )}
          </nav>

          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded-md p-2 text-nx-ink sm:hidden"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {menuOpen && (
          <div className="border-t border-nx-line bg-nx-paper px-4 py-4 sm:hidden">
            <nav className="flex flex-col gap-1 text-sm font-semibold">
              <Link to="/careers" className="rounded-md px-3 py-2.5 text-nx-body hover:bg-nx-surface">
                Open Positions
              </Link>
              {isAuthenticated ? (
                <>
                  {ACCOUNT_LINKS.map(({ to, label, icon: Icon }) => (
                    <Link key={to} to={to} className="flex items-center gap-2 rounded-md px-3 py-2.5 text-nx-body hover:bg-nx-surface">
                      <Icon size={16} className="text-brand-600" /> {label}
                    </Link>
                  ))}
                  <button
                    onClick={logout}
                    className="flex items-center gap-2 rounded-md px-3 py-2.5 text-left text-red-600 hover:bg-red-50"
                  >
                    <LogOut size={16} /> Sign out
                  </button>
                </>
              ) : (
                <>
                  <Link to="/careers/login" className="rounded-md px-3 py-2.5 text-nx-body hover:bg-nx-surface">
                    Sign In
                  </Link>
                  <Link
                    to="/careers/register"
                    className="mt-1 rounded-md bg-brand-600 px-3 py-2.5 text-center text-white"
                  >
                    Create Account
                  </Link>
                </>
              )}
            </nav>
          </div>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="mt-auto border-t border-nx-line bg-nx-surface">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <Wordmark />
              <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-nx-muted">
                Nidhi Impex Silver Star — manufacturing and gem processing group, Surat, Gujarat.
              </p>
            </div>

            <div className="flex gap-12 text-[13px]">
              <div>
                <p className="font-bold uppercase tracking-[0.08em] text-nx-muted">Careers</p>
                <ul className="mt-3 space-y-2 text-nx-body">
                  <li><Link to="/careers" className="hover:text-nx-ink">Open Positions</Link></li>
                  <li><Link to="/careers/register" className="hover:text-nx-ink">Create Account</Link></li>
                  <li><Link to="/careers/login" className="hover:text-nx-ink">Sign In</Link></li>
                </ul>
              </div>
              <div>
                <p className="font-bold uppercase tracking-[0.08em] text-nx-muted">Company</p>
                <ul className="mt-3 space-y-2 text-nx-body">
                  <li><Link to="/about-niss" className="hover:text-nx-ink">About NISS</Link></li>
                  <li><Link to="/login" className="hover:text-nx-ink">Employee Sign In</Link></li>
                </ul>
              </div>
            </div>
          </div>

          <div className="mt-10 border-t border-nx-line pt-6 text-xs text-nx-muted">
            © {new Date().getFullYear()} Nidhi Impex Silver Star. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
