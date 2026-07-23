import Link from "next/link";
import { IntegrationService, IntegrationStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatTime } from "@/lib/utils";
import { statusForService, type WorkspaceData } from "@/lib/workspace";
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
  supportingLine,
  size = "page",
}: {
  eyebrow: string;
  title: string;
  body?: string;
  actions?: React.ReactNode;
  supportingLine?: string;
  size?: "home" | "page";
}) {
  return (
    <section className={size === "home" ? "border-b border-border px-5 py-20 sm:px-8 lg:min-h-[calc(100svh-74px)] lg:px-10 lg:py-28" : "border-b border-border px-5 py-14 sm:px-8 lg:px-10 lg:py-20"}>
      <div className="mx-auto grid w-full max-w-[1560px] gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1 className={size === "home" ? "mt-8 max-w-6xl text-5xl font-semibold uppercase leading-[0.9] tracking-normal sm:text-7xl lg:text-8xl" : "mt-6 max-w-5xl text-4xl font-semibold uppercase leading-[0.95] tracking-normal sm:text-6xl lg:text-7xl"}>
            {title}
          </h1>
          {body ? <p className="mt-7 max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">{body}</p> : null}
          {supportingLine ? (
            <p className="mt-8 font-mono text-[0.68rem] uppercase tracking-[0.14em] text-muted-foreground">{supportingLine}</p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-3 lg:justify-end lg:pb-2">{actions}</div> : null}
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
    <section className="border-b border-border px-5 py-16 sm:px-8 lg:px-10">
      <div className="mx-auto w-full max-w-[1560px]">
        <div className="mb-8 grid gap-4 lg:grid-cols-[minmax(0,0.82fr)_auto] lg:items-end">
          <div>
            {eyebrow ? <p className="eyebrow mb-2">{eyebrow}</p> : null}
            <h2 className="max-w-4xl text-2xl font-semibold uppercase leading-tight tracking-[0.06em] sm:text-4xl">{title}</h2>
          </div>
          {aside}
        </div>
        {children}
      </div>
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
    <div className="border-y border-dashed border-border py-10">
      <p className="text-sm font-semibold uppercase tracking-[0.08em] text-foreground">{title}</p>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{body}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function AccessTrustSection() {
  const blocks = [
    ["OAuth 2.0", "Google authorization only. No pasted passwords or credential prompts."],
    ["Encrypted Tokens", "Provider access and refresh tokens are encrypted at rest and never sent to the browser."],
    ["Human Approval", "Emails and calendar events require explicit confirmation before external writes."],
  ];

  return (
    <div className="grid border-y border-border lg:grid-cols-3">
      {blocks.map(([title, body]) => (
        <div key={title} className="border-b border-border py-8 lg:border-b-0 lg:border-r lg:px-8 lg:first:pl-0 lg:last:border-r-0">
          <p className="eyebrow">{title}</p>
          <p className="mt-5 max-w-sm text-sm leading-7 text-muted-foreground">{body}</p>
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
        supportingLine="Private workspace for real contacts, Gmail, Calendar, and research workflows."
        size="home"
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
        <AccessTrustSection />
      </Section>
      {!data.configuration.databaseConfigured || !data.configuration.googleOAuthConfigured ? (
        <Section eyebrow="CONFIGURATION" title="Workspace setup status">
          <IntegrationStatusPanel data={data} />
        </Section>
      ) : null}
    </PageFrame>
  );
}

export function IntegrationStatusPanel({ data }: { data: WorkspaceData }) {
  const integrationRows = [
    { service: IntegrationService.GMAIL, label: "Gmail", href: "/api/auth/google/start?service=gmail" },
    { service: IntegrationService.GOOGLE_CONTACTS, label: "Google Contacts", href: "/api/auth/google/start?service=contacts" },
    { service: IntegrationService.GOOGLE_CALENDAR, label: "Google Calendar", href: "/api/auth/google/start?service=calendar" },
  ];
  const systemRows = [
    {
      label: "Google sign-in",
      status: data.user ? "connected" : data.configuration.googleOAuthConfigured ? "configured" : "not configured",
      detail: data.user?.email ?? "OAuth client controls authentication and workspace ownership.",
      action: data.user ? (
        <Badge variant="success">signed in</Badge>
      ) : data.configuration.googleOAuthConfigured ? (
        <Button asChild variant="outline" size="sm"><Link href="/api/auth/google/start?service=signin">Sign in</Link></Button>
      ) : (
        <Badge variant="warning">configuration required</Badge>
      ),
    },
    {
      label: "Database",
      status: data.configuration.databaseConfigured && data.databaseAvailable ? "available" : "unavailable",
      detail: "PostgreSQL stores user-scoped contacts, research, sources, drafts, meetings, and audit events.",
      action: <Badge variant={data.configuration.databaseConfigured && data.databaseAvailable ? "success" : "warning"}>{data.configuration.databaseConfigured && data.databaseAvailable ? "ready" : "required"}</Badge>,
    },
    {
      label: "Research provider",
      status: data.configuration.researchConfigured ? "configured" : "not configured",
      detail: `Current provider: ${data.configuration.researchProvider}. Provider failures are shown as unavailable research runs.`,
      action: <Badge variant={data.configuration.researchConfigured ? "success" : "warning"}>{data.configuration.researchConfigured ? "ready" : "required"}</Badge>,
    },
  ];

  return (
    <div className="border-y border-border">
      {systemRows.map((row) => (
        <div key={row.label} className="grid gap-4 border-b border-border py-5 lg:grid-cols-[220px_1fr_auto] lg:items-center">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.08em]">{row.label}</p>
            <p className="mt-1 font-mono text-[0.66rem] uppercase tracking-[0.12em] text-muted-foreground">{row.status}</p>
          </div>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{row.detail}</p>
          <div className="flex flex-wrap gap-2 lg:justify-end">{row.action}</div>
        </div>
      ))}
      {integrationRows.map((row) => {
        const integration = statusForService(data, row.service);
        const connected = integration?.status === IntegrationStatus.CONNECTED;
        return (
          <div key={row.service} className="grid gap-4 border-b border-border py-5 last:border-b-0 lg:grid-cols-[220px_1fr_auto] lg:items-center">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.08em]">{row.label}</p>
              <p className="mt-1 font-mono text-[0.66rem] uppercase tracking-[0.12em] text-muted-foreground">
                {connected ? "connected" : "not connected"}
              </p>
            </div>
            <div>
              <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                {permissionExplanation(row.service === IntegrationService.GMAIL ? "gmail" : row.service === IntegrationService.GOOGLE_CONTACTS ? "contacts" : "calendar")}
              </p>
              {integration ? (
                <p className="mt-2 font-mono text-[0.66rem] uppercase tracking-[0.12em] text-muted-foreground">
                  {integration.accountEmail ?? "account unavailable"} / sync {integration.syncStatus} / records{" "}
                  {integration.recordsProcessed} / scopes {integration.scopes.length} / last{" "}
                  {integration.lastSyncedAt ? formatDate(integration.lastSyncedAt) : "not synced"}
                </p>
              ) : null}
              {integration?.lastError ? <p className="mt-2 text-xs leading-5 text-[hsl(39_32%_70%)]">{integration.lastError}</p> : null}
            </div>
            <div className="flex flex-wrap gap-2 lg:justify-end">
              {data.configuration.googleOAuthConfigured ? (
                <Button asChild variant={connected ? "outline" : "default"} size="sm">
                  <Link href={row.href}>{connected ? "Reconnect" : "Connect"}</Link>
                </Button>
              ) : (
                <Button variant="outline" size="sm" disabled>
                  Connect
                </Button>
              )}
              {connected ? (
                <ApiActionButton
                  endpoint={`/api/sync/google/${
                    row.service === IntegrationService.GMAIL
                      ? "gmail"
                      : row.service === IntegrationService.GOOGLE_CONTACTS
                        ? "contacts"
                        : "calendar"
                  }`}
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
          </div>
        );
      })}
    </div>
  );
}

export function Timestamp({ value }: { value?: Date | string | null }) {
  if (!value) return <span>Unavailable</span>;
  return <span>{formatTime(value)}</span>;
}
