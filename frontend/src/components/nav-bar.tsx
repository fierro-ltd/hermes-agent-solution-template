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

  const links = [
    { to: "/", label: "Home", external: false },
    { to: "/dashboard", label: "Dashboard", external: false },
    { to: "/docs", label: "API", external: true },
    { to: chatUrl, label: "Chat", external: true },
    { to: "/settings", label: "Settings", external: false },
  ] as const;

  async function handleSignOut() {
    await authClient.signOut();
    void navigate({ to: "/login" });
  }

  return (
    <nav className="border-b bg-background shrink-0" aria-label="Main navigation">
      <div className="flex h-16 items-center justify-between px-8">
        <div className="flex items-center gap-2">
          <Link
            to="/"
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <GraduationCap className="size-5 text-foreground" />
            <span className="text-base font-bold font-mono tracking-tight">
              HAST
            </span>
            <span className="text-xs text-muted-foreground font-mono">
              Grading Demo
            </span>
            <span className="text-[10px] text-muted-foreground/50 font-mono">
              v{__APP_VERSION__}
            </span>
          </Link>
        </div>

        <div className="flex items-center gap-1">
          {links.map((link) => {
            const isActive = location.pathname === link.to;
            if (link.external) {
              return (
                <a
                  key={link.to}
                  href={link.to}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 px-4 py-2 pb-0.5 text-sm transition-colors border-b-2 text-muted-foreground hover:text-foreground border-transparent"
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
                className={`px-4 py-2 pb-0.5 text-sm transition-colors border-b-2 ${
                  isActive
                    ? "text-foreground font-medium border-foreground"
                    : "text-muted-foreground hover:text-foreground border-transparent"
                }`}
                aria-current={isActive ? "page" : undefined}
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          {session?.user ? (
            <>
              <span className="text-sm text-muted-foreground">
                {session.user.email}
              </span>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded"
              >
                <LogOut className="size-3.5" />
                Sign out
              </button>
            </>
          ) : (
            <Link
              to="/login"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-1 rounded border"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
