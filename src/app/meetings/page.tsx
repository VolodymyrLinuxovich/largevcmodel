import Link from "next/link";
import { IntegrationService } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, HeroHeader, PageFrame, Section, SignInPanel, Timestamp } from "@/components/workspace/core";
import { getWorkspaceData, integrationConnected } from "@/lib/workspace";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function MeetingsPage() {
  const data = await getWorkspaceData();
  if (!data.user) return <SignInPanel data={data} />;
  const calendarConnected = integrationConnected(data, IntegrationService.GOOGLE_CALENDAR);
  const [events, replies] = calendarConnected
    ? await Promise.all([
        prisma.calendarEvent.findMany({
          where: { userId: data.user.id },
          include: { contact: true },
          orderBy: { startsAt: "asc" },
          take: 80,
        }),
        prisma.reply.findMany({
          where: { userId: data.user.id },
          include: { contact: true },
          orderBy: { receivedAt: "desc" },
          take: 8,
        }),
      ])
    : [[], []];

  const upcoming = events.filter((event) => event.startsAt >= new Date());
  const past = events.filter((event) => event.startsAt < new Date()).reverse();

  return (
    <PageFrame>
      <HeroHeader
        eyebrow="MEETINGS / CALENDAR"
        title="Prepare, schedule, and follow up from real calendar data."
        body="LargeVCModel reads Google Calendar events, checks availability, and creates events only after explicit user confirmation."
        actions={<Button asChild variant="outline"><Link href="/settings">Connect Calendar</Link></Button>}
      />
      <section className="grid border-b border-border lg:grid-cols-2">
        <div className="border-b border-border px-5 py-7 sm:px-8 lg:border-b-0 lg:border-r lg:px-10">
          <p className="eyebrow mb-2">UPCOMING</p>
          <h2 className="mb-5 text-xl font-semibold uppercase tracking-[0.06em]">Upcoming meetings</h2>
          {!calendarConnected ? (
            <EmptyState title="Calendar not connected" body="Connect Google Calendar to display real upcoming meetings." />
          ) : upcoming.length ? (
            <div className="space-y-3">
              {upcoming.map((event) => (
                <a key={event.id} href={event.htmlLink ?? undefined} target="_blank" rel="noreferrer" className="block border border-border p-4 hover:bg-muted">
                  <div className="flex items-start justify-between gap-4">
                    <p className="text-sm font-semibold">{event.title ?? "Calendar event"}</p>
                    <Badge variant={event.meetingUrl ? "success" : "muted"}>{event.meetingUrl ? "meet link" : "no meet link"}</Badge>
                  </div>
                  <p className="mt-2 font-mono text-[0.7rem] uppercase tracking-[0.08em] text-muted-foreground">
                    <Timestamp value={event.startsAt} /> / {event.attendees.length} attendees
                  </p>
                </a>
              ))}
            </div>
          ) : (
            <EmptyState title="No upcoming meetings" body="No imported future events were found in Google Calendar." />
          )}
        </div>
        <div className="px-5 py-7 sm:px-8 lg:px-10">
          <p className="eyebrow mb-2">HISTORY</p>
          <h2 className="mb-5 text-xl font-semibold uppercase tracking-[0.06em]">Past meetings</h2>
          {!calendarConnected ? (
            <EmptyState title="Calendar not connected" body="Connect and sync Calendar to inspect meeting history." />
          ) : past.length ? (
            <div className="space-y-3">
              {past.slice(0, 12).map((event) => (
                <a key={event.id} href={event.htmlLink ?? undefined} target="_blank" rel="noreferrer" className="block border border-border p-4 hover:bg-muted">
                  <p className="text-sm font-semibold">{event.title ?? "Calendar event"}</p>
                  <p className="mt-2 font-mono text-[0.7rem] uppercase tracking-[0.08em] text-muted-foreground"><Timestamp value={event.startsAt} /></p>
                </a>
              ))}
            </div>
          ) : (
            <EmptyState title="No past meetings" body="No imported past events were found." />
          )}
        </div>
      </section>
      <Section eyebrow="REPLIES" title="Recent reply classification">
        {replies.length ? (
          <div className="divide-y divide-border border border-border">
            {replies.map((reply) => (
              <div key={reply.id} className="grid gap-3 px-4 py-4 md:grid-cols-[1fr_180px_160px]">
                <p className="text-sm leading-6">{reply.bodySnippet}</p>
                <Badge variant={reply.requiresHumanReview ? "warning" : "success"}>{reply.classification}</Badge>
                <p className="font-mono text-[0.7rem] uppercase tracking-[0.08em] text-muted-foreground">confidence {reply.confidence}</p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No replies classified" body="Replies imported from Gmail or entered by the user will appear here after classification." />
        )}
      </Section>
    </PageFrame>
  );
}
