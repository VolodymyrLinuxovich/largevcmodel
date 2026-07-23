import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { ConnectionStatus, ProfileActivityVisibility, ProfileVisibility, VerifiedStatus } from "@prisma/client";
import { ApiActionButton } from "@/components/workspace/api-action-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, HeroHeader, PageFrame, Section, Timestamp } from "@/components/workspace/core";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";
import { canViewProfile } from "@/lib/profile";

export const dynamic = "force-dynamic";

export default async function PublicProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const viewer = await getCurrentUser();
  const profile = await prisma.userProfile.findUnique({
    where: { username },
    include: {
      user: { select: { id: true, email: true, createdAt: true } },
    },
  });
  if (!profile) notFound();

  const isOwner = viewer?.id === profile.userId;
  const canView = await canViewProfile(prisma, profile, viewer?.id);
  if (!canView) {
    return (
      <PageFrame>
        <HeroHeader
          eyebrow="PROFILE / PRIVATE"
          title="This profile is not public."
          body="The owner controls profile visibility. Private Gmail, Calendar, contact, and relationship evidence is never exposed on public profiles."
          actions={<Button asChild variant="outline"><Link href="/overview">Return to workspace</Link></Button>}
        />
      </PageFrame>
    );
  }

  if (!isOwner) {
    const headerStore = await headers();
    await prisma.profileViewEvent.create({
      data: {
        profileUserId: profile.userId,
        viewerUserId: viewer?.id,
        referrer: headerStore.get("referer"),
        source: "profile_page",
      },
    }).catch(() => undefined);
  }

  const [products, projects, achievements, activities, followerCount, followingCount, connectionCount, featuredConnections, ownerMessages, analytics] =
    await Promise.all([
      prisma.product.findMany({ where: { ownerUserId: profile.userId }, orderBy: [{ isFeatured: "desc" }, { updatedAt: "desc" }], take: 6 }),
      prisma.project.findMany({ where: { ownerUserId: profile.userId }, orderBy: [{ status: "asc" }, { updatedAt: "desc" }], take: 8 }),
      prisma.achievement.findMany({ where: { ownerUserId: profile.userId, archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { date: "desc" }], take: 8 }),
      prisma.profileActivity.findMany({
        where: {
          ownerUserId: profile.userId,
          visibility: isOwner ? undefined : ProfileActivityVisibility.PUBLIC,
        },
        orderBy: { createdAt: "desc" },
        take: 12,
      }),
      prisma.follow.count({ where: { followedUserId: profile.userId } }),
      prisma.follow.count({ where: { followerUserId: profile.userId } }),
      prisma.connection.count({
        where: {
          status: ConnectionStatus.ACCEPTED,
          OR: [{ requesterUserId: profile.userId }, { recipientUserId: profile.userId }],
        },
      }),
      prisma.connection.findMany({
        where: {
          status: ConnectionStatus.ACCEPTED,
          OR: [{ requesterUserId: profile.userId }, { recipientUserId: profile.userId }],
        },
        include: {
          requester: { include: { profile: true } },
          recipient: { include: { profile: true } },
        },
        take: 6,
      }),
      isOwner
        ? prisma.messageParticipant.findMany({
            where: { userId: profile.userId },
            include: {
              thread: {
                include: {
                  messages: { orderBy: { createdAt: "desc" }, take: 1 },
                  participants: { include: { user: { include: { profile: true } } } },
                },
              },
            },
            take: 5,
          })
        : Promise.resolve([]),
      isOwner ? loadAnalytics(profile.userId) : Promise.resolve(null),
    ]);

  const featuredProduct = products.find((product) => product.isFeatured) ?? products[0] ?? null;
  const socialLinks =
    profile.socialLinks && typeof profile.socialLinks === "object" && !Array.isArray(profile.socialLinks)
      ? (profile.socialLinks as Record<string, string | undefined>)
      : {};

  return (
    <PageFrame>
      <HeroHeader
        eyebrow="PROFILE / NETWORK"
        title={profile.fullName ?? profile.username}
        body={profile.headline ?? "This profile has not added a professional headline yet."}
        supportingLine={[
          `@${profile.username}`,
          profile.location,
          profile.availability,
          profile.visibility === ProfileVisibility.PRIVATE ? "Private" : null,
        ].filter(Boolean).join(" / ")}
        actions={
          isOwner ? (
            <>
              <Button asChild><Link href="/settings/profile">Edit profile</Link></Button>
              <Button asChild variant="outline"><Link href="#analytics">View analytics</Link></Button>
            </>
          ) : viewer ? (
            <>
              <ApiActionButton endpoint={`/api/profile/${profile.username}/follow`} variant="outline">Follow</ApiActionButton>
              <ApiActionButton endpoint={`/api/profile/${profile.username}/connect`} variant="outline">Connect</ApiActionButton>
              <ApiActionButton endpoint={`/api/profile/${profile.username}/message`} payload={{ body: "I'd like to connect." }}>Message</ApiActionButton>
            </>
          ) : (
            <Button asChild><Link href="/api/auth/google/start?service=signin">Sign in to connect</Link></Button>
          )
        }
      />

      <Section eyebrow="IDENTITY" title="Professional surface">
        <div className="grid gap-8 xl:grid-cols-[360px_1fr]">
          <div className="border-y border-border py-6">
            {profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatarUrl} alt="" className="h-28 w-28 rounded-sm border border-border object-cover" />
            ) : (
              <div className="h-28 w-28 border border-border" />
            )}
            <div className="mt-6 flex flex-wrap gap-2">
              {profile.verifiedStatus === VerifiedStatus.VERIFIED ? <Badge variant="success">Verified</Badge> : null}
              <Badge variant="muted">Joined <Timestamp value={profile.user.createdAt} /></Badge>
              <Badge variant="muted">{followerCount} followers</Badge>
              <Badge variant="muted">{connectionCount} connections</Badge>
            </div>
            <p className="mt-6 text-sm leading-7 text-muted-foreground">{profile.bio ?? "No public bio has been added."}</p>
            <div className="mt-6 flex flex-wrap gap-2">
              {profile.websiteUrl ? <TrackedLink profileUserId={profile.userId} type="website" href={profile.websiteUrl} label="Website" /> : null}
              {socialLinks.linkedin ? <TrackedLink profileUserId={profile.userId} type="linkedin" href={socialLinks.linkedin} label="LinkedIn" /> : null}
              {socialLinks.github ? <TrackedLink profileUserId={profile.userId} type="github" href={socialLinks.github} label="GitHub" /> : null}
              {socialLinks.x ? <TrackedLink profileUserId={profile.userId} type="x" href={socialLinks.x} label="X" /> : null}
            </div>
          </div>
          <div className="border-y border-border py-6">
            <Tabs isOwner={isOwner} />
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              <Metric label="Followers" value={followerCount} />
              <Metric label="Following" value={followingCount} />
              <Metric label="Connections" value={connectionCount} />
            </div>
          </div>
        </div>
      </Section>

      <Section eyebrow="PRODUCT" title="Featured product">
        {featuredProduct ? (
          <div className="grid gap-8 border-y border-border py-8 xl:grid-cols-[1fr_320px]">
            <div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{featuredProduct.stage ? titleCase(featuredProduct.stage) : "Stage unavailable"}</Badge>
                <Badge variant="muted">{featuredProduct.verificationStatus === VerifiedStatus.VERIFIED ? "Verified" : "Unverified self-reported"}</Badge>
              </div>
              <h2 className="mt-5 text-3xl font-semibold uppercase tracking-[0.04em]">{featuredProduct.name}</h2>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-muted-foreground">{featuredProduct.description ?? "No product description has been added."}</p>
              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Metric label="Role" value={featuredProduct.role ?? "Unavailable"} />
                <Metric label="Category" value={featuredProduct.category ?? "Unavailable"} />
                <Metric label="Team size" value={featuredProduct.teamSize ?? "Unavailable"} />
                <Metric label="Funding" value={featuredProduct.fundingStatus ?? "Unavailable"} />
              </div>
              {tractionText(featuredProduct.tractionMetrics) ? (
                <p className="mt-5 text-xs leading-5 text-muted-foreground">Traction: {tractionText(featuredProduct.tractionMetrics)} (unverified self-reported)</p>
              ) : null}
            </div>
            <div className="space-y-2 xl:text-right">
              {featuredProduct.websiteUrl ? <TrackedLink profileUserId={profile.userId} type="product_website" href={featuredProduct.websiteUrl} label="View product" /> : null}
              {featuredProduct.demoUrl ? <TrackedLink profileUserId={profile.userId} type="product_demo" href={featuredProduct.demoUrl} label="Demo" /> : null}
              {featuredProduct.repositoryUrl ? <TrackedLink profileUserId={profile.userId} type="repository" href={featuredProduct.repositoryUrl} label="Repository" /> : null}
            </div>
          </div>
        ) : (
          <EmptyState title="No featured product" body={isOwner ? "Add a featured product from profile settings." : "This profile has not published a featured product."} />
        )}
      </Section>

      <Section eyebrow="PROJECTS" title="Projects">
        {projects.length ? (
          <div className="divide-y divide-border border-y border-border">
            {projects.map((project) => (
              <div key={project.id} className="grid gap-5 py-5 md:grid-cols-[1fr_180px_180px]">
                <div>
                  <p className="text-lg font-semibold">{project.name}</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{project.description ?? "No description provided."}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {[...project.technologies, ...project.categories].slice(0, 6).map((item) => <Badge key={item} variant="muted">{item}</Badge>)}
                  </div>
                </div>
                <Badge variant="outline">{titleCase(project.status)}</Badge>
                <p className="font-mono text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground md:text-right">{project.keyMetric ?? "Metric unavailable"}</p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No projects" body={isOwner ? "Add projects from profile settings." : "No public projects have been added."} />
        )}
      </Section>

      <Section eyebrow="ACHIEVEMENTS" title="Achievements">
        {achievements.length ? (
          <div className="divide-y divide-border border-y border-border">
            {achievements.map((achievement) => (
              <div key={achievement.id} className="grid gap-5 py-5 md:grid-cols-[1fr_180px_180px]">
                <div>
                  <p className="text-lg font-semibold">{achievement.title}</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{achievement.description ?? achievement.organization ?? "No description provided."}</p>
                </div>
                <Badge variant={achievement.verificationStatus === VerifiedStatus.VERIFIED ? "success" : "muted"}>{titleCase(achievement.verificationStatus)}</Badge>
                <p className="font-mono text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground md:text-right">
                  {achievement.date ? <Timestamp value={achievement.date} /> : "Date unavailable"}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No achievements" body={isOwner ? "Add achievements from profile settings. Verification remains a separate state." : "No public achievements have been added."} />
        )}
      </Section>

      <Section eyebrow="ACTIVITY" title="Activity">
        {activities.length ? (
          <div className="divide-y divide-border border-y border-border">
            {activities.map((activity) => (
              <div key={activity.id} className="grid gap-4 py-5 md:grid-cols-[1fr_160px]">
                <div>
                  <p className="text-sm font-semibold">{activity.text}</p>
                  <p className="mt-1 font-mono text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground">
                    {titleCase(activity.source)} / {titleCase(activity.visibility)}
                  </p>
                </div>
                <p className="font-mono text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground md:text-right"><Timestamp value={activity.createdAt} /></p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No activity" body="Profile activity is published only through explicit profile actions or approved imports." />
        )}
      </Section>

      <Section eyebrow="CONNECTIONS" title="Connections">
        {featuredConnections.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {featuredConnections.map((connection) => {
              const other = connection.requesterUserId === profile.userId ? connection.recipient : connection.requester;
              return (
                <Link key={connection.id} href={other.profile ? `/profile/${other.profile.username}` : "#"} className="border-y border-border py-4 transition-colors hover:text-primary">
                  <p className="text-sm font-semibold">{other.profile?.fullName ?? other.email}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{other.profile?.headline ?? "Headline unavailable"}</p>
                  <Badge className="mt-3" variant="muted">{connection.relationshipType ?? "Connection"}</Badge>
                </Link>
              );
            })}
          </div>
        ) : (
          <EmptyState title="No public connections" body="Connections appear only when accepted inside the platform. Gmail-derived private relationships are not exposed here." />
        )}
      </Section>

      {isOwner ? (
        <Section eyebrow="PRIVATE" title="Messages and analytics">
          <div id="analytics" className="grid gap-8 xl:grid-cols-2">
            <div>
              <p className="eyebrow mb-4">Messages preview</p>
              {ownerMessages.length ? (
                <div className="divide-y divide-border border-y border-border">
                  {ownerMessages.map((participant) => {
                    const last = participant.thread.messages[0];
                    const others = participant.thread.participants.filter((item) => item.userId !== profile.userId);
                    return (
                      <div key={participant.threadId} className="py-4">
                        <p className="text-sm font-semibold">{others.map((item) => item.user.profile?.fullName ?? item.user.email).join(", ") || "Conversation"}</p>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{last?.body ?? "No messages yet."}</p>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState title="No platform messages" body="Private messages appear only inside the owner view. Gmail content is not imported as profile messages." />
              )}
            </div>
            <div>
              <p className="eyebrow mb-4">Analytics</p>
              {analytics ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <Metric label="Profile views / 30d" value={analytics.views.current || "Insufficient data"} detail={analytics.views.change} />
                  <Metric label="Link clicks / 30d" value={analytics.linkClicks.current || "Insufficient data"} detail={analytics.linkClicks.change} />
                  <Metric label="Connection requests / 30d" value={analytics.connectionRequests.current || "Insufficient data"} detail={analytics.connectionRequests.change} />
                  <Metric label="Follower growth / 30d" value={analytics.followers.current || "Insufficient data"} detail={analytics.followers.change} />
                </div>
              ) : null}
            </div>
          </div>
        </Section>
      ) : null}
    </PageFrame>
  );
}

async function loadAnalytics(profileUserId: string) {
  const now = new Date();
  const start = new Date(now.getTime() - 30 * 86_400_000);
  const previousStart = new Date(now.getTime() - 60 * 86_400_000);
  const [viewsCurrent, viewsPrevious, clicksCurrent, clicksPrevious, requestsCurrent, requestsPrevious, followersCurrent, followersPrevious] =
    await Promise.all([
      prisma.profileViewEvent.count({ where: { profileUserId, createdAt: { gte: start } } }),
      prisma.profileViewEvent.count({ where: { profileUserId, createdAt: { gte: previousStart, lt: start } } }),
      prisma.profileLinkClick.count({ where: { profileUserId, createdAt: { gte: start } } }),
      prisma.profileLinkClick.count({ where: { profileUserId, createdAt: { gte: previousStart, lt: start } } }),
      prisma.connection.count({ where: { recipientUserId: profileUserId, createdAt: { gte: start } } }),
      prisma.connection.count({ where: { recipientUserId: profileUserId, createdAt: { gte: previousStart, lt: start } } }),
      prisma.follow.count({ where: { followedUserId: profileUserId, createdAt: { gte: start } } }),
      prisma.follow.count({ where: { followedUserId: profileUserId, createdAt: { gte: previousStart, lt: start } } }),
    ]);
  return {
    views: metricDelta(viewsCurrent, viewsPrevious),
    linkClicks: metricDelta(clicksCurrent, clicksPrevious),
    connectionRequests: metricDelta(requestsCurrent, requestsPrevious),
    followers: metricDelta(followersCurrent, followersPrevious),
  };
}

function metricDelta(current: number, previous: number) {
  if (!current && !previous) return { current, change: "Insufficient data" };
  if (!previous) return { current, change: "New activity" };
  const delta = Math.round(((current - previous) / previous) * 100);
  return { current, change: `${delta >= 0 ? "+" : ""}${delta}% vs previous period` };
}

function Metric({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return (
    <div className="border-y border-border py-4">
      <p className="eyebrow">{label}</p>
      <p className="mt-3 font-mono text-xl text-foreground">{value}</p>
      {detail ? <p className="mt-2 text-xs leading-5 text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

function Tabs({ isOwner }: { isOwner: boolean }) {
  const tabs = ["Overview", "Products", "Projects", "Achievements", "Activity", "Connections", ...(isOwner ? ["Analytics"] : [])];
  return (
    <div className="flex gap-5 overflow-x-auto border-y border-border py-3">
      {tabs.map((tab) => (
        <span key={tab} className="shrink-0 font-mono text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground">
          {tab}
        </span>
      ))}
    </div>
  );
}

function TrackedLink({ profileUserId, type, href, label }: { profileUserId: string; type: string; href: string; label: string }) {
  const target = `/api/profile/link-click?profileUserId=${encodeURIComponent(profileUserId)}&linkType=${encodeURIComponent(type)}&targetUrl=${encodeURIComponent(href)}`;
  return (
    <Button asChild variant="outline" size="sm">
      <a href={target} target="_blank" rel="noreferrer">{label}</a>
    </Button>
  );
}

function tractionText(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return String((value as Record<string, unknown>).selfReported ?? "") || null;
}

function titleCase(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (match) => match.toUpperCase());
}
