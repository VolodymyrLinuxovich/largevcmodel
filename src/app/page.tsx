import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState, HeroHeader, IntegrationStatusPanel, MetricGrid, PageFrame, Section, SignInPanel, Timestamp } from "@/components/workspace/core";
import { getWorkspaceData, integrationConnected, outreachStatusLabel } from "@/lib/workspace";
import { IntegrationService } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const data = await getWorkspaceData();
  if (!data.user) return <SignInPanel data={data} />;

  const contactsConnected = integrationConnected(data, IntegrationService.GOOGLE_CONTACTS) || integrationConnected(data, IntegrationService.GMAIL);
  const gmailConnected = integrationConnected(data, IntegrationService.GMAIL);
  const calendarConnected = integrationConnected(data, IntegrationService.GOOGLE_CALENDAR);

  return (
    <PageFrame>
      <HeroHeader
        eyebrow="NETWORK INTELLIGENCE / LIVE WORKSPACE"
        title="Your network, research, and outreach in one system."
        body="Connect your professional relationships, research relevant people and companies, identify warm paths, draft informed outreach, and coordinate meetings from one auditable workspace."
        actions={
          <>
            <Button asChild size="lg">
              <Link href="/contacts">Search Network</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/research">Start Research</Link>
            </Button>
          </>
        }
      />

      <MetricGrid
        metrics={[
          { label: "Connected contacts", value: data.metrics.connectedContacts, unavailable: "Connect Contacts or Gmail." },
          { label: "Active conversations", value: data.metrics.activeConversations, unavailable: "Connect Gmail." },
          { label: "Replies received", value: data.metrics.repliesReceived, unavailable: "Connect Gmail." },
          { label: "Meetings scheduled", value: data.metrics.meetingsScheduled, unavailable: "Connect Calendar." },
          { label: "Research runs", value: data.metrics.researchRunsCompleted, unavailable: "No research completed." },
          { label: "Avg thesis fit", value: data.metrics.averageThesisFitScore, unavailable: "No scored records." },
        ]}
      />

      {!contactsConnected || !gmailConnected || !calendarConnected ? (
        <Section eyebrow="ONBOARDING" title="Connect source systems">
          <IntegrationStatusPanel data={data} />
        </Section>
      ) : null}

      <Section eyebrow="SIGNALS" title="Relationship activity">
        {data.relationshipActivity.length ? (
          <div className="divide-y divide-border border border-border">
            {data.relationshipActivity.map((item) => (
              <a
                key={item.id}
                href={item.href ?? undefined}
                target={item.href ? "_blank" : undefined}
                rel={item.href ? "noreferrer" : undefined}
                className="grid gap-2 px-4 py-4 transition-colors hover:bg-muted md:grid-cols-[110px_1fr_170px]"
              >
                <Badge variant="outline">{item.type}</Badge>
                <div>
                  <p className="text-sm font-semibold">{item.title}</p>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.detail ?? "No snippet available."}</p>
                </div>
                <p className="font-mono text-[0.7rem] uppercase tracking-[0.08em] text-muted-foreground md:text-right">
                  <Timestamp value={item.timestamp} />
                </p>
              </a>
            ))}
          </div>
        ) : (
          <EmptyState
            title={contactsConnected ? "No activity found" : "Integrations required"}
            body={contactsConnected ? "Connected accounts have not produced relationship activity for this workspace yet." : "Connect Gmail and Calendar to populate recent relationship activity."}
          />
        )}
      </Section>

      <section className="grid border-b border-border lg:grid-cols-2">
        <div className="border-b border-border px-5 py-7 sm:px-8 lg:border-b-0 lg:border-r lg:px-10">
          <div className="mb-5">
            <p className="eyebrow mb-2">PRIORITY</p>
            <h2 className="text-xl font-semibold uppercase tracking-[0.06em]">Priority contacts</h2>
          </div>
          {data.priorityContacts.length ? (
            <div className="divide-y divide-border border border-border">
              {data.priorityContacts.map((contact) => (
                <Link key={contact.id} href={`/contacts/${contact.id}`} className="block px-4 py-4 hover:bg-muted">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold">{contact.fullName ?? contact.primaryEmail ?? "Unnamed contact"}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {[contact.title, contact.organization].filter(Boolean).join(" / ") || "Role unavailable"}
                      </p>
                    </div>
                    <Badge variant="muted">{contact.source.replaceAll("_", " ")}</Badge>
                  </div>
                  <p className="mt-3 font-mono text-[0.7rem] uppercase tracking-[0.08em] text-muted-foreground">
                    {contact.interactionCount} interactions / last <Timestamp value={contact.lastInteractionAt} />
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

        <div className="px-5 py-7 sm:px-8 lg:px-10">
          <div className="mb-5">
            <p className="eyebrow mb-2">RESEARCH</p>
            <h2 className="text-xl font-semibold uppercase tracking-[0.06em]">Recent research</h2>
          </div>
          {data.recentResearch.length ? (
            <div className="divide-y divide-border border border-border">
              {data.recentResearch.map((run) => (
                <Link key={run.id} href="/research" className="block px-4 py-4 hover:bg-muted">
                  <div className="flex items-start justify-between gap-4">
                    <p className="line-clamp-2 text-sm font-semibold">{run.query}</p>
                    <Badge variant={run.status === "COMPLETED" ? "success" : "warning"}>{run.status}</Badge>
                  </div>
                  <p className="mt-3 font-mono text-[0.7rem] uppercase tracking-[0.08em] text-muted-foreground">
                    {run.provider} / {run.sourceCount} sources / {run.claimCount} claims / fit {run.fitScore ?? "N/A"}
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState title="No research runs" body="Start research on a real contact or company after connecting a research provider." />
          )}
        </div>
      </section>

      <section className="grid border-b border-border lg:grid-cols-3">
        <div className="border-b border-border px-5 py-7 sm:px-8 lg:border-b-0 lg:border-r lg:px-10">
          <p className="eyebrow mb-2">CALENDAR</p>
          <h2 className="mb-5 text-xl font-semibold uppercase tracking-[0.06em]">Upcoming meetings</h2>
          {data.upcomingMeetings.length ? (
            <div className="space-y-3">
              {data.upcomingMeetings.map((meeting) => (
                <a key={meeting.id} href={meeting.htmlLink ?? undefined} target="_blank" rel="noreferrer" className="block border border-border p-4 hover:bg-muted">
                  <p className="text-sm font-semibold">{meeting.title ?? "Calendar event"}</p>
                  <p className="mt-2 font-mono text-[0.7rem] uppercase tracking-[0.08em] text-muted-foreground">
                    <Timestamp value={meeting.startsAt} />
                  </p>
                </a>
              ))}
            </div>
          ) : (
            <EmptyState title={calendarConnected ? "No upcoming meetings" : "Calendar not connected"} body={calendarConnected ? "No upcoming imported calendar events were found." : "Connect Google Calendar to display real meetings."} />
          )}
        </div>

        <div className="border-b border-border px-5 py-7 sm:px-8 lg:border-b-0 lg:border-r lg:px-10">
          <p className="eyebrow mb-2">GMAIL</p>
          <h2 className="mb-5 text-xl font-semibold uppercase tracking-[0.06em]">Outreach status</h2>
          {data.outreachStatus.length ? (
            <div className="space-y-3">
              {data.outreachStatus.map((draft) => (
                <Link key={draft.id} href="/outreach" className="block border border-border p-4 hover:bg-muted">
                  <p className="text-sm font-semibold">{draft.subject}</p>
                  <p className="mt-2 font-mono text-[0.7rem] uppercase tracking-[0.08em] text-muted-foreground">
                    {outreachStatusLabel(draft.status)} / {draft.contactName ?? "contact"} / <Timestamp value={draft.updatedAt} />
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState title={gmailConnected ? "No outreach drafts" : "Gmail not connected"} body={gmailConnected ? "No Gmail-backed outreach records exist yet." : "Connect Gmail to create drafts and track replies."} />
          )}
        </div>

        <div className="px-5 py-7 sm:px-8 lg:px-10">
          <p className="eyebrow mb-2">AUDIT</p>
          <h2 className="mb-5 text-xl font-semibold uppercase tracking-[0.06em]">Latest audit events</h2>
          {data.auditEvents.length ? (
            <div className="space-y-3">
              {data.auditEvents.map((event) => (
                <div key={event.id} className="border border-border p-4">
                  <p className="text-sm font-semibold">{event.action}</p>
                  <p className="mt-2 font-mono text-[0.7rem] uppercase tracking-[0.08em] text-muted-foreground">
                    {event.outcome} / {event.dataSource ?? "workspace"} / <Timestamp value={event.timestamp} />
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No audit events" body="System and user actions will appear here once integrations are connected or records are updated." />
          )}
        </div>
      </section>
    </PageFrame>
  );
}
