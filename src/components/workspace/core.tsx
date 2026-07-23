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
    <section className={size === "home" ? "px-5 py-24 sm:px-8 lg:min-h-[calc(100svh-72px)] lg:px-10 lg:py-32" : "border-b border-border px-5 py-14 sm:px-8 lg:px-10 lg:py-20"}>
      <div className="mx-auto grid w-full max-w-[1480px] gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1 className={size === "home" ? "mt-8 max-w-5xl text-5xl font-medium leading-[0.96] tracking-normal sm:text-7xl lg:text-8xl" : "mt-6 max-w-5xl text-4xl font-medium leading-[1] tracking-normal sm:text-6xl lg:text-7xl"}>
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
      <div className="mx-auto w-full max-w-[1480px]">
        <div className="mb-8 grid gap-4 lg:grid-cols-[minmax(0,0.82fr)_auto] lg:items-end">
          <div>
            {eyebrow ? <p className="eyebrow mb-2">{eyebrow}</p> : null}
            <h2 className="max-w-4xl text-2xl font-medium leading-tight sm:text-4xl">{title}</h2>
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
        eyebrow="NETWORK INTELLIGENCE"
        title="LargeVCModel"
        body="Network intelligence for founders, investors, and operators. Research people and companies, understand your professional network, and turn connected data into useful context."
        supportingLine="Private, evidence-based, and built around real relationships."
        size="home"
        actions={
          <>
            {data.configuration.googleOAuthConfigured && data.configuration.databaseConfigured ? (
              <Button asChild size="lg">
                <Link href="/api/auth/google/start?service=signin">Connect Workspace</Link>
              </Button>
            ) : (
              <Button size="lg" disabled>
                Connect Workspace
              </Button>
            )}
          </>
        }
      />
    </PageFrame>
  );
}

export function IntegrationStatusPanel({ data }: { data: WorkspaceData }) {
  const integrationRows = [
    { service: IntegrationService.GMAIL, label: "Gmail", href: "/api/auth/google/start?service=gmail" },
    { service: IntegrationService.GOOGLE_CONTACTS, label: "Google Contacts", href: "/api/auth/google/start?service=contacts" },
    { service: IntegrationService.GOOGLE_CALENDAR, label: "Google Calendar", href: "/api/auth/google/start?service=calendar" },
  ];

  return (
    <div className="border-y border-border">
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
                  {integration.recordsProcessed} / last{" "}
                  {integration.lastSyncedAt ? formatDate(integration.lastSyncedAt) : "not synced"}
                </p>
              ) : null}
              {integration ? (
                <details className="mt-3 text-xs leading-5 text-muted-foreground">
                  <summary className="cursor-pointer font-mono uppercase tracking-[0.1em]">Advanced details</summary>
                  <p className="mt-2">Granted scopes: {integration.scopes.length ? integration.scopes.join(", ") : "Unavailable"}</p>
                </details>
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
