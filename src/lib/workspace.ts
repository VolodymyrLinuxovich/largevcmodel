import "server-only";

import { IntegrationService, IntegrationStatus, OutreachStatus, Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth/session";
import { isDatabaseConfigured, isGoogleOAuthConfigured, getResearchProviderName } from "@/lib/config";
import { prisma } from "@/lib/prisma";

export type MetricValue = number | null;

export type WorkspaceData = {
  user: { id: string; email: string; name: string | null; imageUrl: string | null } | null;
  configuration: {
    databaseConfigured: boolean;
    googleOAuthConfigured: boolean;
    researchProvider: string;
    researchConfigured: boolean;
  };
  databaseAvailable: boolean;
  integrations: Awaited<ReturnType<typeof loadIntegrations>>;
  metrics: {
    connectedContacts: MetricValue;
    activeConversations: MetricValue;
    repliesReceived: MetricValue;
    meetingsScheduled: MetricValue;
    researchRunsCompleted: MetricValue;
    averageThesisFitScore: MetricValue;
  };
  relationshipActivity: Array<{
    id: string;
    type: "email" | "calendar";
    title: string;
    detail: string | null;
    timestamp: Date | null;
    href?: string | null;
  }>;
  priorityContacts: Array<{
    id: string;
    fullName: string | null;
    primaryEmail: string | null;
    organization: string | null;
    title: string | null;
    source: string;
    relationshipStrength: number | null;
    lastInteractionAt: Date | null;
    interactionCount: number;
  }>;
  recentResearch: Array<{
    id: string;
    query: string;
    status: string;
    provider: string;
    sourceCount: number;
    claimCount: number;
    fitScore: number | null;
    createdAt: Date;
  }>;
  upcomingMeetings: Array<{
    id: string;
    title: string | null;
    startsAt: Date;
    endsAt: Date;
    attendees: string[];
    htmlLink: string | null;
    meetingUrl: string | null;
  }>;
  outreachStatus: Array<{
    id: string;
    subject: string;
    status: string;
    contactName: string | null;
    updatedAt: Date;
  }>;
  auditEvents: Array<{
    id: string;
    action: string;
    outcome: string;
    actor: string;
    dataSource: string | null;
    timestamp: Date;
  }>;
};

function researchConfigured() {
  const provider = getResearchProviderName();
  if (provider === "hermes") return Boolean(process.env.HERMES_API_URL || process.env.HERMES_COMMAND);
  return provider !== "none";
}

async function loadIntegrations(userId: string) {
  return prisma.integration.findMany({
    where: { userId },
    orderBy: [{ service: "asc" }],
    select: {
      id: true,
      service: true,
      status: true,
      accountEmail: true,
      scopes: true,
      syncStatus: true,
      lastSyncedAt: true,
      lastError: true,
      disconnectedAt: true,
    },
  });
}

function hasConnected(
  integrations: Awaited<ReturnType<typeof loadIntegrations>>,
  service: IntegrationService,
) {
  return integrations.some((integration) => integration.service === service && integration.status === IntegrationStatus.CONNECTED);
}

export async function getWorkspaceData(): Promise<WorkspaceData> {
  const configuration = {
    databaseConfigured: isDatabaseConfigured(),
    googleOAuthConfigured: isGoogleOAuthConfigured(),
    researchProvider: getResearchProviderName(),
    researchConfigured: researchConfigured(),
  };

  const session = await getSession();
  const base: WorkspaceData = {
    user: null,
    configuration,
    databaseAvailable: true,
    integrations: [],
    metrics: {
      connectedContacts: null,
      activeConversations: null,
      repliesReceived: null,
      meetingsScheduled: null,
      researchRunsCompleted: null,
      averageThesisFitScore: null,
    },
    relationshipActivity: [],
    priorityContacts: [],
    recentResearch: [],
    upcomingMeetings: [],
    outreachStatus: [],
    auditEvents: [],
  };

  if (!session) return base;

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, email: true, name: true, imageUrl: true },
    });
    if (!user) return base;

    const integrations = await loadIntegrations(user.id);
    const contactsConnected = hasConnected(integrations, IntegrationService.GOOGLE_CONTACTS) || hasConnected(integrations, IntegrationService.GMAIL);
    const gmailConnected = hasConnected(integrations, IntegrationService.GMAIL);
    const calendarConnected = hasConnected(integrations, IntegrationService.GOOGLE_CALENDAR);

    const [
      contactCount,
      threadCount,
      replyCount,
      meetingCount,
      completedResearchCount,
      fitAggregate,
      recentMessages,
      upcomingEvents,
      contacts,
      researchRuns,
      outreachDrafts,
      auditEvents,
    ] = await Promise.all([
      contactsConnected ? prisma.contact.count({ where: { userId: user.id } }) : Promise.resolve(null),
      gmailConnected ? prisma.gmailThread.count({ where: { userId: user.id } }) : Promise.resolve(null),
      gmailConnected ? prisma.reply.count({ where: { userId: user.id } }) : Promise.resolve(null),
      calendarConnected
        ? prisma.calendarEvent.count({ where: { userId: user.id, startsAt: { gte: new Date() } } })
        : Promise.resolve(null),
      prisma.researchRun.count({ where: { userId: user.id, status: "COMPLETED" } }),
      prisma.fitScore.aggregate({ where: { userId: user.id }, _avg: { overall: true } }),
      gmailConnected
        ? prisma.gmailMessage.findMany({
            where: { thread: { userId: user.id } },
            include: { thread: true },
            orderBy: { internalDate: "desc" },
            take: 8,
          })
        : Promise.resolve([]),
      calendarConnected
        ? prisma.calendarEvent.findMany({
            where: { userId: user.id, startsAt: { gte: new Date() } },
            orderBy: { startsAt: "asc" },
            take: 6,
          })
        : Promise.resolve([]),
      contactsConnected
        ? prisma.contact.findMany({
            where: { userId: user.id },
            orderBy: [{ relationshipStrength: "desc" }, { lastInteractionAt: "desc" }],
            take: 8,
          })
        : Promise.resolve([]),
      prisma.researchRun.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 6,
        include: { claims: true, fitScores: { orderBy: { calculatedAt: "desc" }, take: 1 } },
      }),
      gmailConnected
        ? prisma.outreachDraft.findMany({
            where: { userId: user.id },
            include: { contact: true },
            orderBy: { updatedAt: "desc" },
            take: 8,
          })
        : Promise.resolve([]),
      prisma.auditEvent.findMany({
        where: { userId: user.id },
        orderBy: { timestamp: "desc" },
        take: 8,
      }),
    ]);

    const sourceCounts = researchRuns.length
      ? await prisma.source.groupBy({
          by: ["userId"],
          where: {
            userId: user.id,
            claims: { some: { claim: { researchRunId: { in: researchRuns.map((run) => run.id) } } } },
          },
          _count: { id: true },
        })
      : [];
    const totalSources = sourceCounts[0]?._count.id ?? 0;

    return {
      ...base,
      user,
      integrations,
      metrics: {
        connectedContacts: contactCount,
        activeConversations: threadCount,
        repliesReceived: replyCount,
        meetingsScheduled: meetingCount,
        researchRunsCompleted: completedResearchCount,
        averageThesisFitScore: fitAggregate._avg.overall ? Math.round(fitAggregate._avg.overall) : null,
      },
      relationshipActivity: [
        ...recentMessages.map((message) => ({
          id: message.id,
          type: "email" as const,
          title: message.subject || message.thread.subject || "Email conversation",
          detail: message.snippet,
          timestamp: message.internalDate,
          href: message.messageUrl,
        })),
        ...upcomingEvents.slice(0, 3).map((event) => ({
          id: event.id,
          type: "calendar" as const,
          title: event.title || "Calendar event",
          detail: event.attendees.join(", ") || null,
          timestamp: event.startsAt,
          href: event.htmlLink,
        })),
      ]
        .sort((a, b) => (b.timestamp?.getTime() ?? 0) - (a.timestamp?.getTime() ?? 0))
        .slice(0, 8),
      priorityContacts: contacts.map((contact) => ({
        id: contact.id,
        fullName: contact.fullName,
        primaryEmail: contact.primaryEmail,
        organization: contact.organization,
        title: contact.title,
        source: contact.source,
        relationshipStrength: contact.relationshipStrength,
        lastInteractionAt: contact.lastInteractionAt,
        interactionCount: contact.interactionCount,
      })),
      recentResearch: researchRuns.map((run) => ({
        id: run.id,
        query: run.query,
        status: run.status,
        provider: run.provider,
        sourceCount: totalSources,
        claimCount: run.claims.length,
        fitScore: run.fitScores[0]?.overall ?? null,
        createdAt: run.createdAt,
      })),
      upcomingMeetings: upcomingEvents.map((event) => ({
        id: event.id,
        title: event.title,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        attendees: event.attendees,
        htmlLink: event.htmlLink,
        meetingUrl: event.meetingUrl,
      })),
      outreachStatus: outreachDrafts.map((draft) => ({
        id: draft.id,
        subject: draft.subject,
        status: draft.status,
        contactName: draft.contact.fullName,
        updatedAt: draft.updatedAt,
      })),
      auditEvents: auditEvents.map((event) => ({
        id: event.id,
        action: event.action,
        outcome: event.outcome,
        actor: event.actor,
        dataSource: event.dataSource,
        timestamp: event.timestamp,
      })),
    };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError || error instanceof Prisma.PrismaClientInitializationError) {
      return { ...base, databaseAvailable: false };
    }
    return { ...base, databaseAvailable: false };
  }
}

export function statusForService(data: WorkspaceData, service: IntegrationService) {
  return data.integrations.find((integration) => integration.service === service);
}

export function integrationConnected(data: WorkspaceData, service: IntegrationService) {
  return statusForService(data, service)?.status === IntegrationStatus.CONNECTED;
}

export function outreachStatusLabel(status: OutreachStatus | string) {
  return String(status).replaceAll("_", " ").toLowerCase();
}
