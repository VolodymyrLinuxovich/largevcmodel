export type WorkspaceConnectionState =
  | "not_signed_in"
  | "signed_in_google_disconnected"
  | "connected_not_synced"
  | "syncing"
  | "connected_ready"
  | "connection_expired"
  | "sync_failed";

export function deriveWorkspaceConnectionState(input: {
  user: unknown | null;
  googleOAuthConfigured: boolean;
  databaseConfigured: boolean;
  integrations: Array<{ status: string; syncStatus: string; lastSyncedAt?: Date | string | null }>;
  syncJobs: Array<{ status: string }>;
}): WorkspaceConnectionState {
  if (!input.user) return "not_signed_in";
  const connected = input.integrations.filter((integration) => integration.status === "CONNECTED");
  if (!connected.length) return "signed_in_google_disconnected";
  if (connected.some((integration) => integration.syncStatus === "error") || input.syncJobs.some((job) => job.status === "FAILED")) {
    return "sync_failed";
  }
  if (input.syncJobs.some((job) => job.status === "PENDING" || job.status === "RUNNING") || connected.some((integration) => ["queued", "syncing"].includes(integration.syncStatus))) {
    return "syncing";
  }
  if (connected.every((integration) => !integration.lastSyncedAt)) return "connected_not_synced";
  if (connected.some((integration) => integration.status === "ERROR" || integration.status === "REVOKED")) return "connection_expired";
  return "connected_ready";
}

export function workspaceCtaForState(state: WorkspaceConnectionState) {
  if (state === "not_signed_in") return { href: "/api/auth/google/start?service=signin", label: "Sign in with Google" };
  if (state === "connected_ready") return { href: "/profile", label: "Profile" };
  if (state === "syncing") return { href: "/settings", label: "Syncing" };
  if (state === "sync_failed") return { href: "/settings", label: "Sync Failed" };
  return { href: "/settings", label: "Connect Workspace" };
}
