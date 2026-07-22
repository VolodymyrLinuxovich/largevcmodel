import Link from "next/link";
import { IntegrationService, IntegrationStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatTime } from "@/lib/utils";
import { statusForService, type MetricValue, type WorkspaceData } from "@/lib/workspace";
import { permissionExplanation } from "@/lib/google/scopes";
import { ApiActionButton } from "./api-action-button";

export function PageFrame({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen">{children}</div>;
}

export function HeroHeader({
  eyebrow,
  title,
  body,
  actions,
}: {
  eyebrow: string;
  title: string;
  body?: string;
  actions?: React.ReactNode;
}) {
  return (
    <section className="border-b border-border px-5 py-10 sm:px-8 lg:px-10 lg:py-14">
      <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="mt-5 max-w-5xl text-4xl font-semibold uppercase leading-[0.95] tracking-normal sm:text-6xl lg:text-7xl">
            {title}
          </h1>
          {body ? <p className="mt-6 max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">{body}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-3 lg:justify-end">{actions}</div> : null}
      </div>
    </section>
  );
}

export function Section({
  eyebrow,
  title,
  children,
  aside,
}: {
  eyebrow?: string;
  title: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <section className="border-b border-border px-5 py-7 sm:px-8 lg:px-10">
      <div className="mb-5 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          {eyebrow ? <p className="eyebrow mb-2">{eyebrow}</p> : null}
          <h2 className="text-xl font-semibold uppercase tracking-[0.06em]">{title}</h2>
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="border border-dashed border-border px-4 py-8">
      <p className="text-sm font-semibold uppercase tracking-[0.08em]">{title}</p>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{body}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function MetricGrid({ metrics }: { metrics: Array<{ label: string; value: MetricValue; unavailable: string }> }) {
  return (
    <div className="grid border-y border-border sm:grid-cols-2 xl:grid-cols-6">
      {metrics.map((metric) => (
        <div key={metric.label} className="border-b border-r border-border px-4 py-5 last:border-r-0 sm:border-b-0">
          <p className="eyebrow">{metric.label}</p>
          <p className="mt-3 font-mono text-3xl text-foreground">{metric.value === null ? "N/A" : metric.value}</p>
          {metric.value === null ? <p className="mt-2 text-xs leading-5 text-muted-foreground">{metric.unavailable}</p> : null}
        </div>
      ))}
    </div>
  );
}

export function SignInPanel({ data }: { data: WorkspaceData }) {
  return (
    <PageFrame>
      <HeroHeader
        eyebrow="NETWORK INTELLIGENCE / LIVE WORKSPACE"
        title="Your network, research, and outreach in one system."
        body="Connect your professional relationships, research relevant people and companies, identify warm paths, draft informed outreach, and coordinate meetings from one auditable workspace."
        actions={
          <>
            {data.configuration.googleOAuthConfigured && data.configuration.databaseConfigured ? (
              <Button asChild size="lg">
                <Link href="/api/auth/google/start?service=signin">Sign in with Google</Link>
              </Button>
            ) : (
              <Button size="lg" disabled>
                Sign in with Google
              </Button>
            )}
            <Button asChild size="lg" variant="outline">
              <Link href="/settings">Review Configuration</Link>
            </Button>
          </>
        }
      />
      <Section eyebrow="ACCESS MODEL" title="Private workspace">
        <div className="grid gap-4 lg:grid-cols-3">
          {[
            ["OAuth 2.0", "Google sign-in uses OAuth authorization. The app never asks for Google passwords."],
            ["Encrypted tokens", "Provider tokens are stored server-side and encrypted before being written to Postgres."],
            ["Human approval", "Emails and calendar events require explicit user action before external writes."],
          ].map(([title, body]) => (
            <Card key={title}>
              <CardHeader>
                <CardTitle>{title}</CardTitle>
                <CardDescription>{body}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </Section>
      {!data.configuration.databaseConfigured || !data.configuration.googleOAuthConfigured ? (
        <Section title="Configuration required">
          <EmptyState
            title="Server environment is incomplete"
            body="Set DATABASE_URL, SESSION_SECRET, TOKEN_ENCRYPTION_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and the OAuth redirect URI before connecting accounts."
          />
        </Section>
      ) : null}
    </PageFrame>
  );
}

export function IntegrationStatusPanel({ data }: { data: WorkspaceData }) {
  const rows = [
    { service: IntegrationService.GMAIL, label: "Gmail", href: "/api/auth/google/start?service=gmail" },
    { service: IntegrationService.GOOGLE_CONTACTS, label: "Google Contacts", href: "/api/auth/google/start?service=contacts" },
    { service: IntegrationService.GOOGLE_CALENDAR, label: "Google Calendar", href: "/api/auth/google/start?service=calendar" },
  ];

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      {rows.map((row) => {
        const integration = statusForService(data, row.service);
        const connected = integration?.status === IntegrationStatus.CONNECTED;
        return (
          <Card key={row.service}>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle>{row.label}</CardTitle>
                <Badge variant={connected ? "success" : "muted"}>{connected ? "connected" : "not connected"}</Badge>
              </div>
              <CardDescription>{permissionExplanation(row.service === IntegrationService.GMAIL ? "gmail" : row.service === IntegrationService.GOOGLE_CONTACTS ? "contacts" : "calendar")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {integration ? (
                <dl className="space-y-2 font-mono text-[0.7rem] uppercase tracking-[0.08em] text-muted-foreground">
                  <div className="flex justify-between gap-3">
                    <dt>Account</dt>
                    <dd className="text-right text-foreground">{integration.accountEmail ?? "unavailable"}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>Sync</dt>
                    <dd className="text-right text-foreground">{integration.syncStatus}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>Scopes</dt>
                    <dd className="text-right text-foreground">{integration.scopes.length}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt>Last sync</dt>
                    <dd className="text-right text-foreground">{integration.lastSyncedAt ? formatDate(integration.lastSyncedAt) : "not synced"}</dd>
                  </div>
                </dl>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button asChild variant={connected ? "outline" : "default"} size="sm">
                  <Link href={row.href}>{connected ? "Reconnect" : "Connect"}</Link>
                </Button>
                {connected ? (
                  <ApiActionButton
                    endpoint={`/api/sync/google/${row.service === IntegrationService.GMAIL ? "gmail" : row.service === IntegrationService.GOOGLE_CONTACTS ? "contacts" : "calendar"}`}
                    variant="secondary"
                    size="sm"
                  >
                    Sync
                  </ApiActionButton>
                ) : null}
                {connected && integration ? (
                  <ApiActionButton endpoint={`/api/integrations/${integration.id}/disconnect`} variant="outline" size="sm">
                    Disconnect
                  </ApiActionButton>
                ) : null}
              </div>
              {integration?.lastError ? <p className="text-xs leading-5 text-[hsl(39_32%_70%)]">{integration.lastError}</p> : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export function Timestamp({ value }: { value?: Date | string | null }) {
  if (!value) return <span>Unavailable</span>;
  return <span>{formatTime(value)}</span>;
}
