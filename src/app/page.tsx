import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, PageFrame, Section, Timestamp } from "@/components/workspace/core";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isDatabaseConfigured, isGoogleOAuthConfigured } from "@/lib/config";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (user) return <AuthenticatedOverview user={user} />;
  return <PublicHome canConnect={isDatabaseConfigured() && isGoogleOAuthConfigured()} />;
}

async function AuthenticatedOverview({ user }: { user: { id: string; email: string; name?: string | null } }) {
  const [startup, recentSearches, savedPeople, profileActivity] = await Promise.all([
    prisma.startupProfile.findFirst({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, profileCompleteness: true },
    }),
    prisma.peopleSearchRun.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 4,
      select: { id: true, query: true, status: true, total: true, createdAt: true },
    }),
    prisma.savedPerson.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { id: true, createdAt: true, person: { select: { fullName: true, currentOrganizationName: true } } },
    }),
    prisma.profileActivity.findMany({
      where: { ownerUserId: user.id, visibility: "PRIVATE" },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { id: true, text: true, activityType: true, createdAt: true },
    }),
  ]);

  const recentWork = [
    ...recentSearches.map((run) => ({
      id: `search-${run.id}`,
      label: "Search",
      title: run.query,
      detail: `${run.status.toLowerCase()} / ${run.total} results`,
      href: "/research",
      timestamp: run.createdAt,
    })),
    ...savedPeople.map((saved) => ({
      id: `saved-${saved.id}`,
      label: "Saved",
      title: saved.person.fullName,
      detail: saved.person.currentOrganizationName ?? "Organization unavailable",
      href: "/profile",
      timestamp: saved.createdAt,
    })),
    ...profileActivity.map((activity) => ({
      id: `activity-${activity.id}`,
      label: "Profile",
      title: activity.text,
      detail: activity.activityType.replaceAll("_", " ").toLowerCase(),
      href: "/profile",
      timestamp: activity.createdAt,
    })),
  ]
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, 5);

  return (
    <PageFrame>
      <section className="px-5 py-24 sm:px-8 lg:min-h-[calc(100svh-72px)] lg:px-10 lg:py-32">
        <div className="mx-auto w-full max-w-[1480px]">
          <p className="eyebrow">Network intelligence / private workspace</p>
          <h1 className="mt-8 max-w-5xl text-5xl font-medium leading-[0.96] sm:text-7xl lg:text-8xl">
            Welcome back, {firstName(user.name ?? user.email)}.
          </h1>
          <p className="mt-7 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
            Search external people sources from your startup profile, then use private relationship data only as enrichment.
          </p>
          <form action="/research" className="mt-12 grid max-w-3xl gap-3 sm:grid-cols-[1fr_auto]">
            <Input name="q" placeholder="Search investors, operators, advisors, researchers, or customers..." aria-label="Search people" className="h-12 bg-transparent text-base" />
            <Button type="submit" size="lg">Search</Button>
          </form>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild variant="outline"><Link href={startup ? "/research" : "/profile"}>{startup ? "Start people search" : "Create startup profile"}</Link></Button>
            <Button asChild variant="outline"><Link href="/contacts">Review relationships</Link></Button>
            <Button asChild variant="outline"><Link href="/profile">Startup profile</Link></Button>
          </div>
          {startup ? (
            <p className="mt-8 font-mono text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground">
              Active startup: {startup.name} / profile {startup.profileCompleteness}% complete
            </p>
          ) : null}
        </div>
      </section>
      <Section eyebrow="Recent work" title="Your latest saved activity.">
        {recentWork.length ? (
          <div className="divide-y divide-border border-y border-border">
            {recentWork.map((item) => (
              <Link key={item.id} href={item.href} className="grid gap-4 py-5 transition-colors hover:text-primary md:grid-cols-[140px_1fr_160px]">
                <p className="eyebrow">{item.label}</p>
                <div>
                  <p className="line-clamp-2 text-sm font-medium">{item.title}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.detail}</p>
                </div>
                <p className="font-mono text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground md:text-right"><Timestamp value={item.timestamp} /></p>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState title="No recent work" body="Recent people searches, saved candidates, and startup-profile edits will appear here after you create them." />
        )}
      </Section>
    </PageFrame>
  );
}

function PublicHome({ canConnect }: { canConnect: boolean }) {
  return (
    <PageFrame>
      <section className="px-5 py-20 sm:px-8 lg:min-h-[calc(100svh-72px)] lg:px-10 lg:py-28">
        <div className="mx-auto grid w-full max-w-[1480px] gap-14 lg:grid-cols-[0.96fr_1.04fr] lg:items-center">
          <div className="animate-reveal">
            <p className="eyebrow">Network intelligence for high-conviction relationships</p>
            <h1 className="mt-8 max-w-5xl text-5xl font-medium leading-[0.96] sm:text-7xl lg:text-8xl">
              Find the people who can move your company forward.
            </h1>
            <p className="mt-8 max-w-2xl text-base leading-8 text-muted-foreground sm:text-lg">
              Turn your startup profile, pitch deck, external public intelligence, and private relationship context into ranked people discovery.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              {canConnect ? (
                <Button asChild size="lg"><Link href="/api/auth/google/start?service=signin">Connect workspace</Link></Button>
              ) : (
                <Button size="lg" disabled>Connect workspace</Button>
              )}
              <Button asChild size="lg" variant="outline"><Link href="/research">Review workflow</Link></Button>
            </div>
            <p className="mt-8 font-mono text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground">
              External discovery first / Gmail and Contacts enrich relationships only
            </p>
          </div>
          <SystemMap />
        </div>
      </section>

      <Section eyebrow="Product preview" title="A startup profile becomes a search instrument.">
        <div className="grid gap-8 border-y border-border py-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="text-sm leading-7 text-muted-foreground">
              LargeVCModel starts with structured company context: product, market, fundraising stage, traction, team, and excluded investors. A pitch deck can populate fields, but the founder approves extracted values before they drive search.
            </p>
          </div>
          <div className="grid gap-3 font-mono text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground">
            {["Startup profile", "Pitch deck extraction", "External people discovery", "Fit scoring", "Relationship enrichment", "Saved people lists"].map((item) => (
              <div key={item} className="grid grid-cols-[24px_1fr] gap-3 border-b border-border pb-3 last:border-b-0">
                <span className="text-primary">+</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section eyebrow="Core workflow" title="From company context to ranked relationships.">
        <div className="grid border-y border-border lg:grid-cols-4">
          {[
            ["01", "Upload or write the startup profile.", "Define what the company is building, selling, raising, and excluding."],
            ["02", "Discover externally.", "Search configured public people and investor sources for new candidates."],
            ["03", "Rank by fit.", "Score people against the startup with visible components and missing criteria."],
            ["04", "Enrich privately.", "Use Gmail and Google Contacts only to answer relationship questions."],
          ].map(([number, title, body]) => (
            <div key={number} className="border-b border-border py-8 lg:border-b-0 lg:border-r lg:px-7 lg:first:pl-0 lg:last:border-r-0">
              <p className="font-mono text-[0.68rem] uppercase tracking-[0.12em] text-primary">{number}</p>
              <h3 className="mt-5 text-lg font-medium">{title}</h3>
              <p className="mt-4 text-sm leading-7 text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section eyebrow="Discovery boundary" title="External discovery is not your inbox.">
        <div className="grid gap-8 lg:grid-cols-2">
          <Statement title="External people discovery" body="Find investors, founders, operators, advisors, scouts, accelerators, researchers, customers, and strategic partners who may not exist in your contacts." />
          <Statement title="Relationship intelligence" body="After candidates are found, Gmail and Google Contacts can show whether you have communicated, saved the person, or have a possible warm path." />
        </div>
      </Section>

      <Section eyebrow="Pitch-deck intelligence" title="Extract, review, then approve.">
        <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
          PDF pitch decks are stored as user-scoped files. Extracted fields remain uncertain until the owner reviews and accepts them. Manually edited data is not silently overwritten.
        </p>
      </Section>

      <Section eyebrow="Explainable matching" title="Scores show their work.">
        <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
          <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
            Every result includes matched criteria, missing criteria, uncertain criteria, source links, confidence, and a relationship contribution. The score is a prioritization heuristic, not a hidden verdict.
          </p>
          <div className="space-y-3 border-y border-border py-4">
            {["Thesis fit", "Stage fit", "Product and technology", "Check size", "Geography", "Portfolio relevance", "Relationship evidence"].map((item) => (
              <div key={item} className="grid grid-cols-[1fr_72px] text-xs">
                <span className="text-muted-foreground">{item}</span>
                <span className="font-mono text-foreground">visible</span>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section eyebrow="People categories" title="Search beyond investors.">
        <div className="flex flex-wrap gap-2">
          {["Investors", "Founders", "Operators", "Advisors", "Scouts", "Accelerators", "Researchers", "Potential customers", "Strategic partners"].map((item) => (
            <span key={item} className="border border-border px-3 py-2 text-xs uppercase tracking-[0.08em] text-muted-foreground">{item}</span>
          ))}
        </div>
      </Section>

      <Section eyebrow="Security and data boundaries" title="Private data stays in its lane.">
        <div className="grid gap-6 md:grid-cols-3">
          <Statement title="No fabricated people" body="Provider failure returns an unavailable or error state, never fake candidates." />
          <Statement title="Private relationship layer" body="Gmail and Contacts summarize relationship evidence without becoming public profile facts." />
          <Statement title="Human activation" body="Outreach is drafted only after a person is explicitly selected and external sends still require approval." />
        </div>
      </Section>

      <section className="px-5 py-24 sm:px-8 lg:px-10 lg:py-32">
        <div className="mx-auto w-full max-w-[1480px]">
          <p className="eyebrow">Start</p>
          <h2 className="mt-5 max-w-4xl text-4xl font-medium leading-tight sm:text-6xl">
            Build with the relationships you need, not just the contacts you already have.
          </h2>
          <div className="mt-10">
            {canConnect ? (
              <Button asChild size="lg"><Link href="/api/auth/google/start?service=signin">Connect workspace</Link></Button>
            ) : (
              <Button size="lg" disabled>Connect workspace</Button>
            )}
          </div>
        </div>
      </section>
      <footer className="border-t border-border px-5 py-8 sm:px-8 lg:px-10">
        <div className="mx-auto flex w-full max-w-[1480px] flex-wrap items-center justify-between gap-4 text-[0.68rem] uppercase tracking-[0.14em] text-muted-foreground">
          <span>LARGEVCMODEL</span>
          <span>Startup intelligence / external people discovery</span>
        </div>
      </footer>
    </PageFrame>
  );
}

function SystemMap() {
  return (
    <div className="animate-reveal-delay relative min-h-[520px] border-y border-border py-10">
      <div className="absolute inset-x-10 top-1/2 h-px bg-border" />
      <div className="absolute left-[18%] top-[24%] h-20 w-px bg-border" />
      <div className="absolute left-[48%] top-[42%] h-28 w-px bg-border" />
      <div className="absolute right-[18%] top-[24%] h-20 w-px bg-border" />
      {[
        ["STARTUP PROFILE", "Product, market, stage, traction", "left-[4%] top-[12%]"],
        ["EXTERNAL DISCOVERY", "People not already in your inbox", "left-[34%] top-[36%]"],
        ["FIT RANKING", "Evidence, confidence, missing criteria", "right-[4%] top-[12%]"],
        ["RELATIONSHIP ENRICHMENT", "Gmail and Contacts as private context", "left-[18%] bottom-[8%]"],
        ["SAVED PEOPLE", "Lists, notes, status, activation", "right-[18%] bottom-[8%]"],
      ].map(([title, body, position]) => (
        <div key={title} className={`absolute ${position} w-56 border border-border bg-background/95 p-4 transition-colors hover:border-primary`}>
          <p className="font-mono text-[0.62rem] uppercase tracking-[0.14em] text-primary">{title}</p>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">{body}</p>
        </div>
      ))}
      <div className="data-trace absolute left-8 top-1/2 h-px w-28 bg-primary" />
      <div className="data-trace data-trace-delay absolute right-8 top-1/2 h-px w-28 bg-primary" />
    </div>
  );
}

function Statement({ title, body }: { title: string; body: string }) {
  return (
    <div className="border-y border-border py-6">
      <p className="eyebrow">{title}</p>
      <p className="mt-5 text-sm leading-7 text-muted-foreground">{body}</p>
    </div>
  );
}

function firstName(value: string) {
  return value.split(/[ @]/).filter(Boolean)[0] ?? "there";
}
