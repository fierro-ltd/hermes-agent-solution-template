import { Outlet, createRootRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
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

  useEffect(() => {
    if (isPending) return;
    if (!isSignedIn && !isLoginPage) {
      void navigate({ to: "/login" });
    }
  }, [isPending, isSignedIn, isLoginPage, navigate]);

  // On the login page, skip the nav layout
  if (isLoginPage) {
    return <Outlet />;
  }

  // While checking auth, show nothing to avoid flash
  if (isPending) {
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
