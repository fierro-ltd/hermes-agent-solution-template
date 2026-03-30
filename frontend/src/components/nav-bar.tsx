import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { GraduationCap, LogOut, ExternalLink } from "lucide-react";
import { authClient } from "@/lib/auth-client";

export function NavBar() {
  const { location } = useRouterState();
  const navigate = useNavigate();
  const { data: session } = authClient.useSession();

  // Build LibreChat URL on same hostname but port 8080
  const chatUrl =
    typeof window !== "undefined"
      ? `${window.location.protocol}//${window.location.hostname}:8080`
      : ":8080";

  const mcUrl =
    typeof window !== "undefined"
      ? `${window.location.protocol}//${window.location.hostname}:3001`
      : ":3001";

  const links = [
    { to: "/", label: "Home", external: false },
    { to: "/dashboard", label: "Dashboard", external: false },
    { to: "/docs", label: "API", external: true },
    { to: chatUrl, label: "Chat", external: true },
    { to: mcUrl, label: "Mission Control", external: true },
    { to: "/settings", label: "Settings", external: false },
  ] as const;

  async function handleSignOut() {
    await authClient.signOut();
    void navigate({ to: "/login" });
  }

  return (
    <nav className="bg-white/80 backdrop-blur-md sticky top-0 z-50 border-b border-slate-200 shrink-0" aria-label="Main navigation">
      <div className="max-w-7xl mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2">
          <Link
            to="/"
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <GraduationCap className="size-5 text-indigo-600" />
            <span className="text-base font-bold tracking-tight">
              HAST
            </span>
            <span className="text-sm text-slate-500 font-medium hidden sm:inline-block">
              Grading Demo
              <span className="text-xs ml-1 bg-slate-100 px-1.5 py-0.5 rounded">
                v{__APP_VERSION__}
              </span>
            </span>
          </Link>
        </div>

        <div className="hidden md:flex items-center gap-1">
          {links.map((link) => {
            const isActive = location.pathname === link.to;
            if (link.external) {
              return (
                <a
                  key={link.to}
                  href={link.to}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 px-4 py-5 text-sm transition-colors border-b-2 text-slate-500 hover:text-slate-900 border-transparent"
                >
                  {link.label}
                  <ExternalLink className="size-3" />
                </a>
              );
            }
            return (
              <Link
                key={link.to}
                to={link.to}
                className={`px-4 py-5 text-sm transition-colors border-b-2 ${
                  isActive
                    ? "text-slate-900 font-medium border-slate-900"
                    : "text-slate-500 hover:text-slate-900 border-transparent"
                }`}
                aria-current={isActive ? "page" : undefined}
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-4">
          {session?.user ? (
            <>
              <span className="text-sm text-slate-600 hidden sm:inline-block">
                {session.user.email}
              </span>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                className="flex items-center gap-1.5 text-sm font-medium text-slate-700 hover:text-indigo-600 transition-colors"
              >
                <LogOut className="size-3.5" />
                Sign out
              </button>
            </>
          ) : (
            <Link
              to="/login"
              className="text-sm font-medium text-slate-700 hover:text-indigo-600 transition-colors"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
