import { isDatabaseConfigured, isGoogleOAuthConfigured } from "@/lib/config";
import { getWorkspaceData } from "@/lib/workspace";
import { deriveWorkspaceConnectionState, workspaceCtaForState } from "@/lib/workspace-state";
import { AppHeaderNav } from "./app-header-nav";

export async function AppHeader() {
  const data = await getWorkspaceData();
  const canStartGoogleAuth = isDatabaseConfigured() && isGoogleOAuthConfigured();
  const state = deriveWorkspaceConnectionState({
    user: data.user,
    googleOAuthConfigured: canStartGoogleAuth,
    databaseConfigured: data.configuration.databaseConfigured,
    integrations: data.integrations,
    syncJobs: data.syncJobs,
  });
  const cta = workspaceCtaForState(state);

  return (
    <AppHeaderNav
      ctaDisabled={!data.user && !canStartGoogleAuth}
      ctaHref={cta.href}
      ctaLabel={cta.label}
    />
  );
}
