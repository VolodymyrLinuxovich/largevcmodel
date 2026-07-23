import { isDatabaseConfigured, isGoogleOAuthConfigured } from "@/lib/config";
import { getCurrentUser } from "@/lib/auth/current-user";
import { AppHeaderNav } from "./app-header-nav";

export async function AppHeader() {
  const user = await getCurrentUser();
  const canStartGoogleAuth = isDatabaseConfigured() && isGoogleOAuthConfigured();
  const ctaHref = user ? "/overview" : "/api/auth/google/start?service=signin";
  const ctaLabel = user ? "OPEN WORKSPACE" : "CONNECT WORKSPACE";

  return (
    <AppHeaderNav
      accountLabel={user?.name ?? user?.email}
      ctaDisabled={!user && !canStartGoogleAuth}
      ctaHref={ctaHref}
      ctaLabel={ctaLabel}
    />
  );
}
