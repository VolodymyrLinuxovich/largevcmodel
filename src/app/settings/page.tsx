import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApiActionButton } from "@/components/workspace/api-action-button";
import { EmptyState, HeroHeader, IntegrationStatusPanel, PageFrame, Section, SignInPanel, Timestamp } from "@/components/workspace/core";
import { getWorkspaceData } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const data = await getWorkspaceData();
  if (!data.user) return <SignInPanel data={data} />;

  const lastSyncAt = data.integrations
    .map((integration) => integration.lastSyncedAt)
    .filter(Boolean)
    .sort((a, b) => b!.getTime() - a!.getTime())[0];

  return (
    <PageFrame>
      <HeroHeader
        eyebrow="SETTINGS"
        title="Account, integrations, and data controls."
        body="Manage workspace access, connected providers, privacy controls, and research configuration from one private settings surface."
        actions={
          <form action="/api/auth/logout" method="post">
            <Button type="submit" variant="outline">
              Sign out
            </Button>
          </form>
        }
      />

      <Section eyebrow="Account" title="Workspace owner">
        <div className="grid gap-4 border-y border-border py-5 md:grid-cols-[220px_1fr_auto] md:items-center">
          <div>
            <p className="text-sm font-medium">{data.user.name ?? data.user.email}</p>
            <p className="mt-1 text-xs text-muted-foreground">{data.user.email}</p>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Authentication is session-based and tied to this account. Private connected data remains scoped to this user.
          </p>
          <Badge variant="muted">Private workspace</Badge>
        </div>
      </Section>

      <Section eyebrow="Profile" title="Public profile">
        <EmptyState
          title="Profile data is owner controlled"
          body="Create a public or connection-visible profile for products, projects, achievements, and platform activity. Private Gmail, Calendar, contacts, and OAuth data are never published by default."
          action={
            <Button asChild variant="outline">
              <Link href="/settings/profile">Edit profile</Link>
            </Button>
          }
        />
      </Section>

      <Section eyebrow="Integrations" title="Google workspace">
        <IntegrationStatusPanel data={data} />
        <p className="mt-4 max-w-3xl text-xs leading-5 text-muted-foreground">
          Last successful sync: {lastSyncAt ? <Timestamp value={lastSyncAt} /> : "Unavailable"}.
        </p>
      </Section>

      <Section eyebrow="Privacy" title="Permission boundaries">
        <EmptyState
          title="Sensitive data stays server-side"
          body="OAuth client secrets, access tokens, refresh tokens, provider keys, and database credentials are never sent to the browser. External writes require explicit user confirmation."
        />
      </Section>

      <Section eyebrow="Data" title="Import and deletion controls">
        <div className="grid border-y border-border md:grid-cols-3">
          {[
            ["Contacts", "contacts", "Delete imported contact records without deleting the original Google Contacts."],
            ["Gmail metadata", "gmail", "Delete indexed Gmail metadata stored for search and relationship context."],
            ["Calendar data", "calendar", "Delete imported Calendar metadata stored for private workspace context."],
          ].map(([title, dataset, body]) => (
            <div key={title} className="border-b border-border py-6 md:border-b-0 md:border-r md:px-6 md:first:pl-0 md:last:border-r-0">
              <p className="eyebrow">{title}</p>
              <p className="mt-4 text-sm leading-6 text-muted-foreground">{body}</p>
              <div className="mt-5">
                <ApiActionButton
                  endpoint="/api/data/delete"
                  payload={{ dataset }}
                  confirmMessage={`Delete imported ${String(title).toLowerCase()} from LargeVCModel storage? This does not delete data from Google.`}
                  variant="outline"
                  size="sm"
                >
                  Delete
                </ApiActionButton>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section eyebrow="Research provider" title="Public research configuration">
        <div className="grid border-y border-border lg:grid-cols-3">
          <div className="border-b border-border py-5 lg:border-b-0 lg:border-r lg:pr-6">
            <p className="eyebrow">Provider</p>
            <p className="mt-3 text-lg font-medium">{data.configuration.researchProvider}</p>
          </div>
          <div className="border-b border-border py-5 lg:border-b-0 lg:border-r lg:px-6">
            <p className="eyebrow">Hermes API URL</p>
            <Badge className="mt-3" variant={process.env.HERMES_API_URL ? "success" : "warning"}>
              {process.env.HERMES_API_URL ? "configured" : "not configured"}
            </Badge>
          </div>
          <div className="py-5 lg:pl-6">
            <p className="eyebrow">Hermes command</p>
            <Badge className="mt-3" variant={process.env.HERMES_COMMAND ? "success" : "warning"}>
              {process.env.HERMES_COMMAND ? "configured" : "not configured"}
            </Badge>
          </div>
        </div>
        <p className="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">
          {data.configuration.researchProvider === "none"
            ? "Research provider is not configured. Connected-network search continues to work without public enrichment."
            : "Provider failures are shown as unavailable research results. The system does not fabricate replacement research."}
        </p>
      </Section>
    </PageFrame>
  );
}
