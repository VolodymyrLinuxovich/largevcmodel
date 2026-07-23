import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { ApiActionButton } from "@/components/workspace/api-action-button";
import { EmptyState, HeroHeader, PageFrame, Section, SignInPanel, Timestamp } from "@/components/workspace/core";
import { getWorkspaceData } from "@/lib/workspace";
import { prisma } from "@/lib/prisma";
import { sourceDomain } from "@/lib/domain/sources";

export const dynamic = "force-dynamic";

export default async function ContactProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const data = await getWorkspaceData();
  if (!data.user) return <SignInPanel data={data} />;
  const { id } = await params;
  const contact = await prisma.contact.findFirst({
    where: { id, userId: data.user.id },
    include: {
      company: true,
      gmailThreads: { include: { messages: { orderBy: { internalDate: "desc" }, take: 5 } }, orderBy: { lastMessageAt: "desc" }, take: 5 },
      calendarEvents: { orderBy: { startsAt: "desc" }, take: 8 },
      claims: { include: { sources: { include: { source: true } } }, orderBy: { createdAt: "desc" }, take: 20 },
      sources: { orderBy: { accessedAt: "desc" }, take: 20 },
      fitScores: { orderBy: { calculatedAt: "desc" }, take: 5 },
    },
  });
  if (!contact) notFound();

  const sourceList = new Map<string, (typeof contact.sources)[number]>();
  contact.sources.forEach((source) => sourceList.set(source.id, source));
  contact.claims.forEach((claim) => claim.sources.forEach((join) => sourceList.set(join.source.id, join.source)));

  return (
    <PageFrame>
      <HeroHeader
        eyebrow="CONTACT INTELLIGENCE / PROFILE"
        title={contact.fullName ?? contact.primaryEmail ?? "Unnamed contact"}
        body={[contact.title, contact.organization].filter(Boolean).join(" / ") || "Role and organization unavailable from connected sources."}
        actions={
          <ApiActionButton endpoint="/api/scoring" payload={{ contactId: contact.id }} variant="outline">
            Calculate Score
          </ApiActionButton>
        }
      />

      <section className="grid border-b border-border lg:grid-cols-[1fr_380px]">
        <div className="border-b border-border px-5 py-7 sm:px-8 lg:border-b-0 lg:border-r lg:px-10">
          <p className="eyebrow mb-2">PROFILE SUMMARY</p>
          <div className="border-y border-border">
            {[
              ["Source", contact.source.replaceAll("_", " ")],
              ["Email", contact.primaryEmail ?? "Unavailable"],
              ["Phone", contact.phones.length ? contact.phones.join(", ") : "Unavailable"],
              ["Last interaction", contact.lastInteractionAt ? <Timestamp value={contact.lastInteractionAt} /> : "Unavailable"],
              ["Interaction count", contact.interactionCount],
              ["Relationship strength", contact.relationshipStrength ?? "Uncalculated"],
            ].map(([label, value]) => (
              <div key={String(label)} className="grid gap-3 border-b border-border py-4 last:border-b-0 sm:grid-cols-[180px_1fr]">
                <p className="eyebrow">{label}</p>
                <p className="text-sm text-foreground">{value}</p>
              </div>
            ))}
          </div>
          {contact.notes ? (
            <div className="mt-6 border-y border-border py-4">
              <p className="eyebrow mb-3">User notes</p>
              <p className="text-sm leading-6">{contact.notes}</p>
            </div>
          ) : null}
        </div>

        <div className="px-5 py-7 sm:px-8 lg:px-10">
          <p className="eyebrow mb-2">THESIS FIT</p>
          {contact.fitScores.length ? (
            <div className="divide-y divide-border border-y border-border">
              {contact.fitScores.map((score) => (
                <div key={score.id} className="py-5">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-mono text-4xl">{score.overall}</p>
                    <Badge variant="outline">confidence {score.confidence}</Badge>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">{score.explanation}</p>
                  {score.missingInfo.length ? (
                    <p className="mt-3 text-xs leading-5 text-[hsl(39_32%_70%)]">Missing: {score.missingInfo.join("; ")}</p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No score calculated" body="Generate a thesis-fit score after importing evidence or saving an investment thesis." />
          )}
        </div>
      </section>

      <Section eyebrow="EVIDENCE" title="Claims and sources">
        {contact.claims.length ? (
          <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
            <div className="divide-y divide-border border-y border-border">
              {contact.claims.map((claim) => (
                <div key={claim.id} className="py-4">
                  <p className="text-sm leading-6">{claim.text}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge variant={claim.provenance === "UNVERIFIED" ? "warning" : "muted"}>{claim.provenance.replaceAll("_", " ")}</Badge>
                    <Badge variant="outline">confidence {claim.confidence ?? "N/A"}</Badge>
                    {claim.sources.map((join, index) => (
                      <a key={join.sourceId} href={join.source.url} target="_blank" rel="noreferrer" className="font-mono text-[0.7rem] uppercase tracking-[0.08em] underline">
                        [{index + 1}]
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <SourcesList sources={Array.from(sourceList.values())} />
          </div>
        ) : (
          <EmptyState title="No research claims" body="Run research with a configured provider to extract public claims and cite sources. The profile will not display unsupported facts." />
        )}
      </Section>

      <section className="grid border-b border-border lg:grid-cols-2">
        <Panel title="Gmail threads" emptyTitle="No Gmail history" emptyBody="Connect and sync Gmail to view real conversation threads.">
          {contact.gmailThreads.map((thread) => (
            <a key={thread.id} href={thread.threadUrl ?? undefined} target="_blank" rel="noreferrer" className="block py-4 transition-colors hover:text-primary">
              <p className="text-sm font-semibold">{thread.subject ?? "Email thread"}</p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{thread.snippet ?? "No snippet available."}</p>
            </a>
          ))}
        </Panel>
        <Panel title="Calendar evidence" emptyTitle="No calendar history" emptyBody="Connect and sync Google Calendar to view calendar evidence for this contact.">
          {contact.calendarEvents.map((event) => (
            <a key={event.id} href={event.htmlLink ?? undefined} target="_blank" rel="noreferrer" className="block py-4 transition-colors hover:text-primary">
              <p className="text-sm font-semibold">{event.title ?? "Calendar event"}</p>
              <p className="mt-2 font-mono text-[0.7rem] uppercase tracking-[0.08em] text-muted-foreground"><Timestamp value={event.startsAt} /></p>
            </a>
          ))}
        </Panel>
      </section>
    </PageFrame>
  );
}

function SourcesList({ sources }: { sources: Array<{ id: string; title: string; url: string; publisher: string | null; publishedAt: Date | null; sourceType: string; origin: string; supportsClaims: string[] }> }) {
  if (!sources.length) return <EmptyState title="No sources used" body="No public source links have been persisted for this profile." />;
  return (
    <div className="divide-y divide-border border-y border-border">
      {sources.map((source) => (
        <a key={source.id} href={source.url} target="_blank" rel="noreferrer" className="block py-4 transition-colors hover:text-primary">
          <div className="flex items-start justify-between gap-4">
            <p className="text-sm font-semibold">{source.title}</p>
            <Badge variant="muted">{source.origin}</Badge>
          </div>
          <p className="mt-2 font-mono text-[0.68rem] uppercase tracking-[0.08em] text-muted-foreground">
            {source.publisher ?? sourceDomain(source.url)} / {source.sourceType} / {source.publishedAt ? <Timestamp value={source.publishedAt} /> : "date unavailable"}
          </p>
          {source.supportsClaims.length ? <p className="mt-3 text-xs leading-5 text-muted-foreground">{source.supportsClaims.join(" ")}</p> : null}
        </a>
      ))}
    </div>
  );
}

function Panel({ title, emptyTitle, emptyBody, children }: { title: string; emptyTitle: string; emptyBody: string; children: React.ReactNode[] }) {
  return (
    <div className="border-b border-border px-5 py-7 sm:px-8 lg:border-b-0 lg:border-r lg:px-10 lg:last:border-r-0">
      <p className="eyebrow mb-2">{title}</p>
      <h2 className="mb-5 text-xl font-semibold uppercase tracking-[0.06em]">{title}</h2>
      {children.length ? <div className="divide-y divide-border border-y border-border">{children}</div> : <EmptyState title={emptyTitle} body={emptyBody} />}
    </div>
  );
}
