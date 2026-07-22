import { CalendarDays } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function MeetingsPage() {
  const [meetings, slots, replies] = await Promise.all([
    prisma.meeting.findMany({ include: { contact: { include: { company: true } }, partner: true }, orderBy: { startTime: "asc" } }),
    prisma.calendarSlot.findMany({ include: { partner: true }, orderBy: { startTime: "asc" } }),
    prisma.reply.findMany({ include: { contact: { include: { company: true } } }, orderBy: { createdAt: "desc" }, take: 8 }),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">Meetings</h1>
        <p className="mt-2 text-sm text-muted-foreground">Reply classification, available slots, and booked mock meetings.</p>
      </div>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Booked Meetings</CardTitle>
            <CardDescription>Created by the simulated scheduling workflow.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {meetings.length ? (
              meetings.map((meeting) => (
                <div key={meeting.id} className="rounded-md border border-border bg-white p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">{meeting.title}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {meeting.contact.fullName} - {meeting.partner?.name ?? "Partner"} - {formatTime(meeting.startTime)}
                      </div>
                    </div>
                    <Badge variant="success">{meeting.status}</Badge>
                  </div>
                  <a href={meeting.meetingUrl} target="_blank" rel="noreferrer" className="mt-2 block break-all text-xs text-primary underline">
                    {meeting.meetingUrl}
                  </a>
                </div>
              ))
            ) : (
              <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground">No meetings booked yet. Run the demo from Research.</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>VC Availability</CardTitle>
            <CardDescription>Cached demo slots available to the scheduler.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {slots.map((slot) => (
              <div key={slot.id} className="flex items-center justify-between gap-3 rounded-md border border-border bg-white p-3">
                <div className="flex items-center gap-3">
                  <CalendarDays className="h-4 w-4 text-primary" aria-hidden="true" />
                  <div>
                    <div className="text-sm font-medium">{formatTime(slot.startTime)}</div>
                    <div className="text-xs text-muted-foreground">{slot.partner.name} - {slot.label}</div>
                  </div>
                </div>
                <Badge variant={slot.status === "available" ? "success" : "warning"}>{slot.status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Recent Reply Classification</CardTitle>
          <CardDescription>Sample reply types include interested, not interested, follow-up later, intro request, wrong person, and ambiguous.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-2">
          {replies.length ? (
            replies.map((reply) => (
              <div key={reply.id} className="rounded-md border border-border bg-white p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold">{reply.contact.fullName}</span>
                  <Badge variant={reply.requiresHumanReview ? "warning" : "success"}>{reply.classification}</Badge>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{reply.body}</p>
              </div>
            ))
          ) : (
            <div className="rounded-md border border-dashed border-border p-6 text-sm text-muted-foreground lg:col-span-2">No replies ingested yet.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
