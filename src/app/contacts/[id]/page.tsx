import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CircleAlert, Database, Sparkles } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SourcesPanel } from "@/components/research/source-panel";
import { FounderActions } from "@/components/research/founder-actions";
import { RelationshipGraph } from "@/components/graph/relationship-graph";
import { formatDate, formatTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function FounderProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contact = await prisma.contact.findUnique({
    where: { id },
    include: {
      company: true,
      founderProfile: true,
      fitScores: { orderBy: { createdAt: "desc" }, take: 1 },
      claims: {
        include: { sources: { include: { source: true } } },
        orderBy: { createdAt: "desc" },
      },
      outreachDrafts: { include: { events: true }, orderBy: { createdAt: "desc" } },
      replies: { orderBy: { createdAt: "desc" } },
      meetings: { include: { partner: true }, orderBy: { startTime: "desc" } },
    },
  });
  if (!contact) notFound();

  const edges = await prisma.relationshipEdge.findMany({
    where: {
      OR: [{ fromNodeId: contact.id }, { toNodeId: contact.id }],
    },
    orderBy: { strength: "desc" },
  });

  const sourceMap = new Map<string, (typeof contact.claims)[number]["sources"][number]["source"]>();
  for (const claim of contact.claims) {
    for (const join of claim.sources) sourceMap.set(join.sourceId, join.source);
  }
  const sources = Array.from(sourceMap.values()).map((source) => ({
    id: source.id,
    title: source.title,
    url: source.url,
    publisher: source.publisher,
    domain: source.url.startsWith("/") ? "local demo" : new URL(source.url).hostname,
    publishedAt: source.publishedAt,
    accessedAt: source.accessedAt,
    sourceType: source.sourceType,
    origin: source.origin,
    snippet: source.snippet,
    supportsClaims: parseClaims(source.supportsClaims),
  }));
  const latestScore = contact.fitScores[0];

  return (
    <div className="space-y-5">
      <Button asChild variant="ghost" size="sm">
        <Link href="/contacts">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Contacts
        </Link>
      </Button>

      <section className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-2xl font-semibold tracking-normal">{contact.fullName}</h1>
                    <Badge variant="outline">{contact.sourceLabel}</Badge>
                    <Badge variant="warning">Demo data</Badge>
                  </div>
                  <CardDescription className="mt-2">
                    {contact.role} at {contact.company?.name ?? "Unknown company"} - {contact.location}
                  </CardDescription>
                </div>
                {latestScore ? (
                  <div className="rounded-md bg-primary px-4 py-3 text-primary-foreground">
                    <div className="text-xs opacity-80">Latest fit score</div>
                    <div className="text-3xl font-semibold">{latestScore.overall}</div>
                  </div>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm leading-6">{contact.founderProfile?.summary ?? "No profile summary is available yet."}</p>
              <div className="grid gap-3 md:grid-cols-3">
                <Fact label="Sector" value={contact.company?.sector ?? contact.sector} />
                <Fact label="Stage" value={contact.company?.stage ?? contact.stage} />
                <Fact label="Latest funding" value={`${contact.company?.latestFundingRound ?? "Unknown"} ${contact.company?.latestFundingAmount ?? ""}`} />
              </div>
              <div className="rounded-md border border-border bg-muted p-3 text-xs leading-5">
                Public facts above are linked to the evidence and Sources Used sections. CRM notes remain labeled Internal CRM.
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Company and Thesis Fit</CardTitle>
              <CardDescription>Factual company description plus AI-generated prioritization summary.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-2">
              <Section title="Company description" body={contact.founderProfile?.companyDescription ?? contact.company?.description ?? "Unavailable."} />
              <Section title="Thesis-fit explanation" body={contact.founderProfile?.thesisFit ?? latestScore?.explanation ?? "Run research to calculate fit."} badge="AI inference" />
              <Section title="Possible concerns" body={contact.founderProfile?.concerns ?? "No concerns recorded."} badge="Human review" />
              <Section title="Check-size fit" body={contact.company?.checkSizeFit ?? "Unavailable."} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Funding Timeline and Relevant Evidence</CardTitle>
              <CardDescription>Claims preserve provenance and source links.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-md border border-border bg-white p-3">
                <div className="text-sm font-semibold">{contact.company?.latestFundingRound ?? "Unknown round"}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {contact.company?.latestFundingAmount ?? "Unknown amount"} - {formatDate(contact.company?.latestFundingDate)}
                </div>
              </div>
              {contact.claims.slice(0, 8).map((claim) => (
                <div key={claim.id} className="rounded-md border border-border bg-white p-3 text-sm leading-6">
                  <div className="mb-2 flex flex-wrap gap-2">
                    <Badge variant={claim.provenance === "internal_crm" ? "warning" : claim.provenance === "ai_inference" ? "muted" : claim.provenance === "unverified" ? "warning" : "success"}>
                      {claim.provenance === "internal_crm" ? <Database className="mr-1 h-3 w-3" aria-hidden="true" /> : claim.provenance === "ai_inference" ? <Sparkles className="mr-1 h-3 w-3" aria-hidden="true" /> : null}
                      {claim.provenance.replaceAll("_", " ")}
                    </Badge>
                    {claim.provenance === "unverified" ? (
                      <Badge variant="warning">
                        <CircleAlert className="mr-1 h-3 w-3" aria-hidden="true" />
                        Unverified
                      </Badge>
                    ) : null}
                  </div>
                  {claim.text}
                </div>
              ))}
            </CardContent>
          </Card>

          <RelationshipGraph edges={edges} focusNodeId={contact.id} />

          <Card>
            <CardHeader>
              <CardTitle>Interactions, Outreach, and Meetings</CardTitle>
              <CardDescription>Approval and scheduling events are simulated.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-3">
              <Section title="Past interactions" body={contact.founderProfile?.pastInteractions ?? "No interactions recorded."} badge="Internal CRM" />
              <Section title="Outreach history" body={contact.founderProfile?.outreachHistoryText ?? "No history recorded."} badge="Internal CRM" />
              <div className="rounded-md border border-border bg-white p-3">
                <div className="text-sm font-semibold">Booked meetings</div>
                {contact.meetings.length ? (
                  contact.meetings.map((meeting) => (
                    <div key={meeting.id} className="mt-2 text-xs leading-5 text-muted-foreground">
                      {formatTime(meeting.startTime)} with {meeting.partner?.name}
                    </div>
                  ))
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">No meetings booked.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-5">
          <FounderActions contactId={contact.id} />
          <SourcesPanel sources={sources} />
        </aside>
      </section>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-white p-3">
      <div className="text-[11px] uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
    </div>
  );
}

function Section({ title, body, badge }: { title: string; body: string; badge?: string }) {
  return (
    <div className="rounded-md border border-border bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-sm font-semibold">{title}</div>
        {badge ? <Badge variant={badge === "AI inference" ? "muted" : "warning"}>{badge}</Badge> : null}
      </div>
      <p className="text-sm leading-6 text-muted-foreground">{body}</p>
    </div>
  );
}

function parseClaims(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}
