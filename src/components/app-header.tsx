import { isDatabaseConfigured, isGoogleOAuthConfigured } from "@/lib/config";
import { getSession } from "@/lib/auth/session";
import { AppHeaderNav } from "./app-header-nav";

export async function AppHeader() {
  const session = await getSession();
  const canStartGoogleAuth = isDatabaseConfigured() && isGoogleOAuthConfigured();

  return (
    <AppHeaderNav
      ctaDisabled={!session && !canStartGoogleAuth}
      ctaHref={session ? "/settings" : "/api/auth/google/start?service=signin"}
      ctaLabel={session ? "Connect Workspace" : "Sign in with Google"}
    />
  );
}
