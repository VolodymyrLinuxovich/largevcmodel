import Link from "next/link";
import type { ReactNode } from "react";
import { IntegrationService } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AccessTrustSection,
  EmptyState,
  HeroHeader,
  IntegrationStatusPanel,
  PageFrame,
  Section,
  SignInPanel,
  Timestamp,
} from "@/components/workspace/core";
import { SyncJobRunner } from "@/components/workspace/sync-job-runner";
import { getWorkspaceData, integrationConnected, outreachStatusLabel, type MetricValue } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function OverviewPage({ searchParams }: { searchParams?: Promise<{ sync?: string }> }) {
  const data = await getWorkspaceData();
  if (!data.user) return <SignInPanel data={data} />;
  const { sync } = searchParams ? await searchParams : {};

  const contactsConnected = integrationConnected(data, IntegrationService.GOOGLE_CONTACTS) || integrationConnected(data, IntegrationService.GMAIL);
  const gmailConnected = integrationConnected(data, IntegrationService.GMAIL);
  const calendarConnected = integrationConnected(data, IntegrationService.GOOGLE_CALENDAR);
  const lastSyncedAt = data.integrations
    .map((integration) => integration.lastSyncedAt)
    .filter(Boolean)
    .sort((a, b) => b!.getTime() - a!.getTime())[0];

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
            <Button asChild size="lg">
              <Link href="/settings">Connect Workspace</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/settings">Review Configuration</Link>
            </Button>
          </>
        }
      />

      <Section eyebrow="ACCESS / TRUST" title="Private infrastructure for sensitive relationship work.">
        <AccessTrustSection />
      </Section>

      <Section eyebrow="CONFIGURATION / ONBOARDING" title="Workspace setup status">
        <IntegrationStatusPanel data={data} />
        <SyncJobRunner enabled={sync === "started" || data.syncJobs.some((job) => job.status === "PENDING" || job.status === "RUNNING")} />
      </Section>

      <Section eyebrow="CONTACTS / NETWORK" title="Live network overview">
        <div className="grid gap-10 xl:grid-cols-[0.72fr_1.28fr]">
          <LineStats
            rows={[
              { label: "Total contacts", value: data.metrics.connectedContacts, unavailable: "Connect Contacts or Gmail." },
              { label: "Recent interactions", value: data.relationshipActivity.length || null, unavailable: "Connect and sync Gmail or Calendar." },
              { label: "Strongest relationships", value: data.priorityContacts.length || null, unavailable: "No relationship evidence imported." },
              { label: "Last synced", value: lastSyncedAt ? <Timestamp value={lastSyncedAt} /> : null, unavailable: "No integration has synced." },
            ]}
          />
          <div>
            <div className="mb-5 flex items-end justify-between gap-4">
              <div>
                <p className="eyebrow mb-2">RELATIONSHIP ACTIVITY</p>
                <h3 className="text-lg font-semibold uppercase tracking-[0.06em]">Recent signals</h3>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href="/contacts">Open contacts</Link>
              </Button>
            </div>
            {data.relationshipActivity.length ? (
              <div className="divide-y divide-border border-y border-border">
                {data.relationshipActivity.map((item) => (
                  <a
                    key={item.id}
                    href={item.href ?? undefined}
                    target={item.href ? "_blank" : undefined}
                    rel={item.href ? "noreferrer" : undefined}
                    className="grid gap-3 py-5 transition-colors hover:text-primary md:grid-cols-[120px_1fr_180px]"
                  >
                    <Badge variant="outline">{item.type}</Badge>
                    <div>
                      <p className="text-sm font-semibold">{item.title}</p>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.detail ?? "No snippet available."}</p>
                    </div>
                    <p className="font-mono text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground md:text-right">
                      <Timestamp value={item.timestamp} />
                    </p>
                  </a>
                ))}
              </div>
            ) : (
              <EmptyState
                title={contactsConnected ? "No activity found" : "Integrations required"}
                body={contactsConnected ? "Connected accounts have not produced relationship activity for this workspace yet." : "Connect Gmail and Calendar to populate real relationship activity."}
              />
            )}
          </div>
        </div>

        <div className="mt-14">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <p className="eyebrow mb-2">STRONGEST RELATIONSHIPS</p>
              <h3 className="text-lg font-semibold uppercase tracking-[0.06em]">Priority contacts</h3>
            </div>
          </div>
          {data.priorityContacts.length ? (
            <div className="divide-y divide-border border-y border-border">
              {data.priorityContacts.map((contact) => (
                <Link key={contact.id} href={`/contacts/${contact.id}`} className="grid gap-4 py-5 transition-colors hover:text-primary md:grid-cols-[1fr_180px_180px]">
                  <div>
                    <p className="text-sm font-semibold">{contact.fullName ?? contact.primaryEmail ?? "Unnamed contact"}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {[contact.title, contact.organization].filter(Boolean).join(" / ") || "Role unavailable"}
                    </p>
                  </div>
                  <p className="font-mono text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground">
                    {contact.interactionCount} interactions
                  </p>
                  <p className="font-mono text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground md:text-right">
                    <Timestamp value={contact.lastInteractionAt} />
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              title={contactsConnected ? "No results found" : "No contacts connected"}
              body={contactsConnected ? "Your connected account contains no contacts matching the selected workspace filters." : "Connect Google Contacts or Gmail to build the network index."}
            />
          )}
        </div>
      </Section>

      <Section eyebrow="RESEARCH" title="Research runs and evidence">
        {data.recentResearch.length ? (
          <div className="divide-y divide-border border-y border-border">
            {data.recentResearch.map((run) => (
              <Link key={run.id} href="/research" className="grid gap-4 py-5 transition-colors hover:text-primary md:grid-cols-[1fr_140px_160px_160px]">
                <p className="line-clamp-2 text-sm font-semibold">{run.query}</p>
                <Badge variant={run.status === "COMPLETED" ? "success" : "warning"}>{run.status}</Badge>
                <p className="font-mono text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground">
                  {run.sourceCount} sources / {run.claimCount} claims
                </p>
                <p className="font-mono text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground md:text-right">
                  fit {run.fitScore ?? "N/A"} / <Timestamp value={run.createdAt} />
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState title="No research runs" body="Start research on a real contact or company after connecting a research provider." />
        )}
      </Section>

      <Section eyebrow="OUTREACH" title="Drafts, sends, replies, and follow-ups">
        {data.outreachStatus.length ? (
          <div className="divide-y divide-border border-y border-border">
            {data.outreachStatus.map((draft) => (
              <Link key={draft.id} href="/outreach" className="grid gap-4 py-5 transition-colors hover:text-primary md:grid-cols-[1fr_180px_180px]">
                <p className="text-sm font-semibold">{draft.subject}</p>
                <p className="font-mono text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground">
                  {outreachStatusLabel(draft.status)}
                </p>
                <p className="font-mono text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground md:text-right">
                  <Timestamp value={draft.updatedAt} />
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState title={gmailConnected ? "No outreach drafts" : "Gmail not connected"} body={gmailConnected ? "No Gmail-backed outreach records exist yet." : "Connect Gmail to create drafts and track replies."} />
        )}
      </Section>

      <Section eyebrow="MEETINGS" title="Calendar context">
        {data.upcomingMeetings.length ? (
          <div className="divide-y divide-border border-y border-border">
            {data.upcomingMeetings.map((meeting) => (
              <a key={meeting.id} href={meeting.htmlLink ?? undefined} target="_blank" rel="noreferrer" className="grid gap-4 py-5 transition-colors hover:text-primary md:grid-cols-[1fr_180px_160px]">
                <p className="text-sm font-semibold">{meeting.title ?? "Calendar event"}</p>
                <p className="font-mono text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground">
                  {meeting.attendees.length} attendees
                </p>
                <p className="font-mono text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground md:text-right">
                  <Timestamp value={meeting.startsAt} />
                </p>
              </a>
            ))}
          </div>
        ) : (
          <EmptyState title={calendarConnected ? "No upcoming meetings" : "Calendar not connected"} body={calendarConnected ? "No upcoming imported calendar events were found." : "Connect Google Calendar to display real meetings."} />
        )}
      </Section>

      <Section eyebrow="AUDIT LOG" title="Operational history">
        {data.auditEvents.length ? (
          <div className="divide-y divide-border border-y border-border">
            {data.auditEvents.map((event) => (
              <div key={event.id} className="grid gap-4 py-5 md:grid-cols-[1fr_160px_220px]">
                <div>
                  <p className="text-sm font-semibold">{event.action}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{event.dataSource ?? "workspace"}</p>
                </div>
                <Badge variant={event.outcome === "completed" ? "success" : "warning"}>{event.outcome}</Badge>
                <p className="font-mono text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground md:text-right">
                  <Timestamp value={event.timestamp} />
                </p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No audit events" body="System and user actions will appear here once integrations are connected or records are updated." />
        )}
      </Section>
    </PageFrame>
  );
}

function LineStats({
  rows,
}: {
  rows: Array<{ label: string; value: MetricValue | ReactNode; unavailable: string }>;
}) {
  return (
    <div className="border-y border-border">
      {rows.map((row) => (
        <div key={row.label} className="grid gap-3 border-b border-border py-5 last:border-b-0 sm:grid-cols-[180px_1fr]">
          <p className="eyebrow">{row.label}</p>
          <div>
            <p className="font-mono text-2xl text-foreground">{row.value === null ? "N/A" : row.value}</p>
            {row.value === null ? <p className="mt-2 text-xs leading-5 text-muted-foreground">{row.unavailable}</p> : null}
          </div>
        </div>
      ))}
    </div>
  );
}
