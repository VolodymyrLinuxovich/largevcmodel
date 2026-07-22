import Link from "next/link";
import { ArrowRight, CalendarDays, MailCheck, Search, Target, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getDashboardSnapshot } from "@/lib/dashboard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PipelineChart } from "@/components/dashboard/pipeline-chart";
import { formatDate, formatTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const snapshot = await getDashboardSnapshot(prisma);
  const metricCards = [
    { label: "Candidates", value: snapshot.metrics.candidateCount, icon: Users },
    { label: "Response rate", value: `${snapshot.metrics.responseRate}%`, icon: MailCheck },
    { label: "Meetings booked", value: snapshot.metrics.meetingsBooked, icon: CalendarDays },
    { label: "Avg fit score", value: snapshot.metrics.averageFitScore || "Pending", icon: Target },
  ];

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-4 rounded-lg border border-border bg-white p-5 shadow-soft lg:flex-row lg:items-center lg:justify-between">
        <div>
          <Badge variant="outline" className="mb-3">Demo workspace</Badge>
          <h1 className="text-2xl font-semibold tracking-normal text-foreground">VC relationship discovery and outreach OS</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Search seeded CRM records, enrich candidates through the research provider, preserve citations, rank thesis fit, draft outreach, and simulate scheduling.
          </p>
        </div>
        <Button asChild size="lg">
          <Link href="/research">
            <Search className="h-4 w-4" aria-hidden="true" />
            Run Demo
          </Link>
        </Button>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metricCards.map((metric) => {
          const Icon = metric.icon;
          return (
            <Card key={metric.label}>
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">{metric.label}</CardTitle>
                <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold">{metric.value}</div>
              </CardContent>
            </Card>
          );
        })}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.4fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Pipeline Summary</CardTitle>
            <CardDescription>Status mix from the seeded CRM plus completed demo workflows.</CardDescription>
          </CardHeader>
          <CardContent>
            <PipelineChart data={snapshot.pipeline} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Research Runs</CardTitle>
            <CardDescription>Each run stores operational steps, sources, claims, and scores.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {snapshot.recentRuns.length ? (
              snapshot.recentRuns.map((run) => (
                <Link key={run.id} href="/research" className="block rounded-md border border-border p-3 hover:bg-accent">
                  <div className="flex items-center justify-between gap-3">
                    <span className="line-clamp-1 text-sm font-medium">{run.query}</span>
                    <Badge variant={run.provider === "hermes" ? "success" : "muted"}>{run.provider}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{formatDate(run.createdAt)}</div>
                </Link>
              ))
            ) : (
              <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                No run yet. Start from the Research console.
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Top Candidates</CardTitle>
            <CardDescription>Latest available fit scores.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {snapshot.topCandidates.length ? (
              snapshot.topCandidates.map((contact) => (
                <Link key={contact.id} href={`/contacts/${contact.id}`} className="flex items-center justify-between rounded-md border border-border p-3 hover:bg-accent">
                  <span>
                    <span className="block text-sm font-medium">{contact.fullName}</span>
                    <span className="block text-xs text-muted-foreground">{contact.company?.name}</span>
                  </span>
                  <Badge>{contact.fitScores[0]?.overall}</Badge>
                </Link>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Run the demo to calculate fit scores.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Upcoming Meetings</CardTitle>
            <CardDescription>Mock meetings created by the scheduling workflow.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {snapshot.upcomingMeetings.length ? (
              snapshot.upcomingMeetings.map((meeting) => (
                <div key={meeting.id} className="rounded-md border border-border p-3">
                  <div className="text-sm font-medium">{meeting.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{formatTime(meeting.startTime)}</div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No meetings booked yet.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Latest Audit Events</CardTitle>
            <CardDescription>Decision trace without private reasoning.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {snapshot.auditEvents.map((event) => (
              <div key={event.id} className="rounded-md border border-border p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">{event.action}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {event.affectedFounder?.fullName ?? event.actor} - {formatDate(event.timestamp)}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
