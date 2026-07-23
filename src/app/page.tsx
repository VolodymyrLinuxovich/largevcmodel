import Link from "next/link";
import { ResearchStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, PageFrame, Section, Timestamp } from "@/components/workspace/core";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isDatabaseConfigured, isGoogleOAuthConfigured } from "@/lib/config";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const user = await getCurrentUser();
  if (!user) return <PublicHome canConnect={isDatabaseConfigured() && isGoogleOAuthConfigured()} />;

  const [profile, researchRuns, profileActivity] = await Promise.all([
    prisma.userProfile.findUnique({
      where: { userId: user.id },
      select: { username: true },
    }),
    prisma.researchRun.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { id: true, query: true, status: true, createdAt: true },
    }),
    prisma.profileActivity.findMany({
      where: { ownerUserId: user.id },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { id: true, activityType: true, text: true, createdAt: true },
    }),
  ]);

  const recentWork = [
    ...researchRuns.map((run) => ({
      id: `research-${run.id}`,
      label: "Research",
      title: run.query,
      detail: statusLabel(run.status),
      href: "/research",
      timestamp: run.createdAt,
    })),
    ...profileActivity.map((activity) => ({
      id: `profile-${activity.id}`,
      label: "Profile",
      title: activity.text,
      detail: activity.activityType.replaceAll("_", " ").toLowerCase(),
      href: profile?.username ? `/profile/${profile.username}` : "/profile",
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
            Search your network, review contacts, or continue recent research without exposing raw inbox or calendar data on the overview.
          </p>

          <form action="/research" className="mt-12 grid max-w-3xl gap-3 sm:grid-cols-[1fr_auto]">
            <Input
              name="q"
              placeholder="Search people, companies, conversations, or professional context..."
              aria-label="Search network"
              className="h-12 bg-transparent text-base"
            />
            <Button type="submit" size="lg">
              Search
            </Button>
          </form>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild variant="outline">
              <Link href="/research">Start research</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/contacts">Browse contacts</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/settings/profile">Edit profile</Link>
            </Button>
          </div>
        </div>
      </section>

      <Section eyebrow="Recent work" title="Continue where you left off.">
        {recentWork.length ? (
          <div className="divide-y divide-border border-y border-border">
            {recentWork.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                className="grid gap-4 py-5 transition-colors hover:text-primary md:grid-cols-[140px_1fr_160px]"
              >
                <p className="eyebrow">{item.label}</p>
                <div>
                  <p className="line-clamp-2 text-sm font-medium">{item.title}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.detail}</p>
                </div>
                <p className="font-mono text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground md:text-right">
                  <Timestamp value={item.timestamp} />
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No recent work"
            body="Recent searches, saved research, opened contacts, and profile updates will appear here after you create them."
          />
        )}
      </Section>
    </PageFrame>
  );
}

function PublicHome({ canConnect }: { canConnect: boolean }) {
  return (
    <PageFrame>
      <section className="px-5 py-24 sm:px-8 lg:min-h-[calc(100svh-72px)] lg:px-10 lg:py-32">
        <div className="mx-auto w-full max-w-[1480px]">
          <p className="eyebrow">Network intelligence</p>
          <h1 className="mt-8 max-w-4xl text-6xl font-medium leading-[0.94] sm:text-8xl lg:text-9xl">
            LargeVCModel
          </h1>
          <p className="mt-8 max-w-2xl text-xl leading-8 text-foreground sm:text-2xl">
            Network intelligence for founders, investors, and operators.
          </p>
          <p className="mt-5 max-w-xl text-sm leading-7 text-muted-foreground sm:text-base">
            Research people and companies, understand your professional network, and turn connected data into useful context.
            Private, evidence-based, and built around real relationships.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            {canConnect ? (
              <Button asChild size="lg">
                <Link href="/api/auth/google/start?service=signin">Explore</Link>
              </Button>
            ) : (
              <Button size="lg" disabled>
                Explore
              </Button>
            )}
          </div>
        </div>
      </section>

      <Section eyebrow="Product statement" title="Connected intelligence">
        <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
          LargeVCModel combines contact context, communication history, profile data, and research evidence in one private workspace.
        </p>
      </Section>

      <Section eyebrow="Core capabilities" title="Built around useful context.">
        <div className="grid border-y border-border lg:grid-cols-3">
          {[
            ["Research", "Search people, organizations, conversations, and professional context using natural language."],
            ["Contacts", "Organize real contacts and understand where relationships come from."],
            ["Profiles", "Showcase products, projects, achievements, and professional activity."],
          ].map(([title, body]) => (
            <div key={title} className="border-b border-border py-8 lg:border-b-0 lg:border-r lg:px-8 lg:first:pl-0 lg:last:border-r-0">
              <p className="eyebrow">{title}</p>
              <p className="mt-5 max-w-sm text-sm leading-7 text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </Section>

      <section className="px-5 py-24 sm:px-8 lg:px-10 lg:py-32">
        <div className="mx-auto w-full max-w-[1480px]">
          <p className="eyebrow">Workspace</p>
          <h2 className="mt-5 max-w-3xl text-4xl font-medium leading-tight sm:text-6xl">
            Build with the network you already have.
          </h2>
          <div className="mt-10">
            {canConnect ? (
              <Button asChild size="lg" variant="outline">
                <Link href="/api/auth/google/start?service=signin">Connect workspace</Link>
              </Button>
            ) : (
              <Button size="lg" variant="outline" disabled>
                Connect workspace
              </Button>
            )}
          </div>
        </div>
      </section>
    </PageFrame>
  );
}

function firstName(value: string) {
  return value.split(/[ @]/).filter(Boolean)[0] ?? "there";
}

function statusLabel(status: ResearchStatus) {
  return status.replaceAll("_", " ").toLowerCase();
}
