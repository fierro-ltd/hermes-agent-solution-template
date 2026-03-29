import { Outlet, createRootRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { NavBar } from "@/components/nav-bar";
import { authClient } from "@/lib/auth-client";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  const navigate = useNavigate();
  const { location } = useRouterState();
  const { data: session, isPending } = authClient.useSession();

  const isLoginPage = location.pathname === "/login";
  const isSignedIn = !!session?.user;

  // Check if backend has auth bypassed (dev/demo mode)
  const [authBypassed, setAuthBypassed] = useState(false);
  const [bypassChecked, setBypassChecked] = useState(false);
  useEffect(() => {
    fetch("/health")
      .then((r) => r.json())
      .then((d) => {
        if (d.auth_bypass) setAuthBypassed(true);
      })
      .catch(() => {})
      .finally(() => setBypassChecked(true));
  }, []);

  useEffect(() => {
    if (!bypassChecked) return; // Wait for bypass check to complete
    if (authBypassed) return;
    if (isPending) return;
    if (!isSignedIn && !isLoginPage) {
      void navigate({ to: "/login" });
    }
  }, [bypassChecked, authBypassed, isPending, isSignedIn, isLoginPage, navigate]);

  if (isLoginPage) {
    return <Outlet />;
  }

  // Show nothing until we know if auth is bypassed
  if (!bypassChecked || (!authBypassed && isPending)) {
    return null;
  }

  return (
    <div className="flex h-dvh flex-col">
      <NavBar />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
