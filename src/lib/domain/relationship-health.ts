/**
 * Deterministic relationship-health engine.
 *
 * Health is derived only from observable connected-account records (Gmail and Calendar
 * interactions, relationship-graph edges). No model is asked to judge a relationship.
 * The function is pure: every time-dependent value is computed from the injected `now`.
 */

export const HEALTH_ALGORITHM_VERSION = "relationship-health-v1";

export const HEALTH_PARAMETERS = {
  recencyHalfLifeDays: 45,
  recentWindowDays: 90,
  meetingWindowDays: 180,
  dormantAfterDays: 180,
  coolingAfterDays: 60,
  lookbackDays: 730,
  minDirectInteractions: 2,
  minCadenceDays: 14,
  maxCadenceDays: 90,
  defaultCadenceDays: 30,
} as const;

const DAY_MS = 86_400_000;

export type HealthInteractionType = "EMAIL_SENT" | "EMAIL_RECEIVED" | "CALENDAR_MEETING" | "CONTACT_IMPORTED" | "MANUAL_NOTE";

export type RelationshipHealthState = "STRENGTHENING" | "STABLE" | "COOLING" | "DORMANT" | "INSUFFICIENT_DATA";

export type HealthInteraction = { type: HealthInteractionType; occurredAt: Date };

export type HealthEdge = { relationship: string; source: string; strength: number };

export type RelationshipHealthInput = {
  now: Date;
  /** Interactions inside the lookback window. Future calendar meetings are allowed and treated as upcoming. */
  interactions: HealthInteraction[];
  /** Lifetime aggregate for past direct interactions, which may extend beyond the lookback window. */
  lifetime?: { directCount: number; firstAt: Date | null; lastAt?: Date | null } | null;
  edges?: HealthEdge[];
  coverage: { gmailConnected: boolean; calendarConnected: boolean };
};

export type HealthComponentKey = "recency" | "frequency" | "reciprocity" | "meetings" | "depth";

export type HealthComponent = {
  key: HealthComponentKey;
  label: string;
  weight: number;
  available: boolean;
  score: number | null;
  detail: string;
};

export type HealthEvidence = {
  kind: "EMAIL_SENT" | "EMAIL_RECEIVED" | "CALENDAR_MEETING" | "UPCOMING_MEETING" | "CONTACT_IMPORTED" | "RELATIONSHIP_EDGE";
  source: string;
  count: number;
  lastAt: Date | null;
  detail?: string;
};

export type RelationshipHealth = {
  algorithmVersion: string;
  calculatedAt: Date;
  state: RelationshipHealthState;
  /** 0-100, or null when evidence is insufficient. Null never means "weak". */
  score: number | null;
  lastInteractionAt: Date | null;
  lastInteractionType: HealthInteractionType | null;
  firstInteractionAt: Date | null;
  daysSinceLastInteraction: number | null;
  upcomingMeetingAt: Date | null;
  trend: {
    windowDays: number;
    recentCount: number;
    priorCount: number;
    direction: "UP" | "FLAT" | "DOWN" | "UNKNOWN";
  };
  /** recommendedAt is the actual due date (stable across recalculations); overdueDays > 0 when it has passed. */
  followUp: { recommendedAt: Date | null; overdueDays: number; reason: string };
  components: HealthComponent[];
  evidence: HealthEvidence[];
  explanation: string[];
  insufficientReasons: string[];
};

const COMPONENT_WEIGHTS: Record<HealthComponentKey, number> = {
  recency: 35,
  frequency: 20,
  reciprocity: 15,
  meetings: 15,
  depth: 15,
};

const DIRECT_TYPES = new Set<HealthInteractionType>(["EMAIL_SENT", "EMAIL_RECEIVED", "CALENDAR_MEETING"]);

function daysBetween(later: Date, earlier: Date) {
  return (later.getTime() - earlier.getTime()) / DAY_MS;
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number) {
  return Math.round(value);
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function utcDayKey(date: Date) {
  return Math.floor(date.getTime() / DAY_MS);
}

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function calculateRelationshipHealth(input: RelationshipHealthInput): RelationshipHealth {
  const { now } = input;
  const params = HEALTH_PARAMETERS;
  const lookbackStart = new Date(now.getTime() - params.lookbackDays * DAY_MS);
  const inWindow = input.interactions.filter((item) => item.occurredAt >= lookbackStart);

  const past = inWindow.filter((item) => item.occurredAt <= now);
  const direct = past.filter((item) => DIRECT_TYPES.has(item.type)).sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
  const upcoming = inWindow
    .filter((item) => item.type === "CALENDAR_MEETING" && item.occurredAt > now)
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  const sent = direct.filter((item) => item.type === "EMAIL_SENT");
  const received = direct.filter((item) => item.type === "EMAIL_RECEIVED");
  const meetings = direct.filter((item) => item.type === "CALENDAR_MEETING");
  const imported = past.filter((item) => item.type === "CONTACT_IMPORTED");
  const edges = input.edges ?? [];

  const lifetimeLast = input.lifetime?.lastAt && input.lifetime.lastAt <= now ? input.lifetime.lastAt : null;
  // The newest direct interaction, which may predate the lookback window for long-standing relationships.
  const last: HealthInteraction | null = direct[0] ?? (lifetimeLast ? { type: "EMAIL_SENT", occurredAt: lifetimeLast } : null);
  const lastType = direct[0]?.type ?? null;
  const lifetimeDirect = Math.max(input.lifetime?.directCount ?? 0, direct.length);
  const windowFirst = direct.length ? direct[direct.length - 1]!.occurredAt : null;
  const firstAt =
    input.lifetime?.firstAt && (!windowFirst || input.lifetime.firstAt < windowFirst) ? input.lifetime.firstAt : windowFirst;
  const daysSince = last ? daysBetween(now, last.occurredAt) : null;
  const upcomingMeetingAt = upcoming[0]?.occurredAt ?? null;

  const recentStart = new Date(now.getTime() - params.recentWindowDays * DAY_MS);
  const priorStart = new Date(now.getTime() - 2 * params.recentWindowDays * DAY_MS);
  const recentCount = direct.filter((item) => item.occurredAt > recentStart).length;
  const priorCount = direct.filter((item) => item.occurredAt > priorStart && item.occurredAt <= recentStart).length;

  const evidence = buildEvidence({ sent, received, meetings, upcoming, imported, edges });
  const explanation: string[] = [];
  const insufficientReasons: string[] = [];
  const coverageNotes = coverageExplanation(input.coverage);

  const hasPastMeeting = meetings.length > 0;
  if (lifetimeDirect === 0) {
    insufficientReasons.push("No email or meeting interactions with this contact have been observed.");
  } else if (lifetimeDirect < params.minDirectInteractions && !hasPastMeeting) {
    insufficientReasons.push(
      `Only ${plural(lifetimeDirect, "direct interaction")} observed in total; at least ${params.minDirectInteractions} emails or one meeting are required to assess health.`,
    );
  }

  if (insufficientReasons.length) {
    if (upcomingMeetingAt) explanation.push(`A meeting is scheduled for ${isoDay(upcomingMeetingAt)}.`);
    explanation.push(...coverageNotes);
    explanation.push("Missing interaction history is not treated as evidence of a weak relationship.");
    return {
      algorithmVersion: HEALTH_ALGORITHM_VERSION,
      calculatedAt: now,
      state: "INSUFFICIENT_DATA",
      score: null,
      lastInteractionAt: last?.occurredAt ?? null,
      lastInteractionType: lastType,
      firstInteractionAt: firstAt,
      daysSinceLastInteraction: daysSince === null ? null : Math.floor(daysSince),
      upcomingMeetingAt,
      trend: { windowDays: params.recentWindowDays, recentCount, priorCount, direction: "UNKNOWN" },
      followUp: {
        recommendedAt: null,
        overdueDays: 0,
        reason: upcomingMeetingAt
          ? `A meeting is already scheduled for ${isoDay(upcomingMeetingAt)}.`
          : "Not enough interaction history to infer a follow-up cadence.",
      },
      components: [],
      evidence,
      explanation,
      insufficientReasons,
    };
  }

  const components = buildComponents({
    daysSince: daysSince!,
    recentCount,
    sentCount: sent.length,
    receivedCount: received.length,
    meetingsInWindow: meetings.filter((item) => daysBetween(now, item.occurredAt) <= params.meetingWindowDays).length,
    upcomingCount: upcoming.length,
    lifetimeDirect,
    spanDays: firstAt ? daysBetween(now, firstAt) : 0,
    maxEdgeStrength: edges.reduce((max, edge) => Math.max(max, edge.strength), 0),
    coverage: input.coverage,
  });
  const available = components.filter((component) => component.available);
  const totalWeight = available.reduce((sum, component) => sum + component.weight, 0);
  const score = round(available.reduce((sum, component) => sum + component.weight * (component.score ?? 0), 0) / totalWeight);

  const state = classifyState({ daysSince: daysSince!, recentCount, priorCount });
  const direction: RelationshipHealth["trend"]["direction"] =
    recentCount > priorCount ? "UP" : recentCount < priorCount ? "DOWN" : "FLAT";

  explanation.push(
    lastType
      ? `Last direct interaction ${Math.floor(daysSince!)} days ago (${lastType.replaceAll("_", " ").toLowerCase()} on ${isoDay(last!.occurredAt)}).`
      : `Last direct interaction ${Math.floor(daysSince!)} days ago (${isoDay(last!.occurredAt)}), outside the two-year detail window.`,
    `${plural(recentCount, "direct interaction")} in the last ${params.recentWindowDays} days versus ${priorCount} in the prior ${params.recentWindowDays} days.`,
  );
  if (sent.length || received.length) {
    explanation.push(`Email history in the lookback window: ${sent.length} sent, ${received.length} received.`);
  }
  if (meetings.length) explanation.push(`${plural(meetings.length, "past meeting")} observed in Google Calendar.`);
  if (upcomingMeetingAt) explanation.push(`Next scheduled meeting: ${isoDay(upcomingMeetingAt)}.`);
  explanation.push(stateExplanation(state));
  explanation.push(...coverageNotes);

  const followUp = recommendFollowUp({ now, state, last: last!.occurredAt, direct, upcomingMeetingAt });

  return {
    algorithmVersion: HEALTH_ALGORITHM_VERSION,
    calculatedAt: now,
    state,
    score,
    lastInteractionAt: last!.occurredAt,
    lastInteractionType: lastType,
    firstInteractionAt: firstAt,
    daysSinceLastInteraction: Math.floor(daysSince!),
    upcomingMeetingAt,
    trend: { windowDays: params.recentWindowDays, recentCount, priorCount, direction },
    followUp,
    components,
    evidence,
    explanation,
    insufficientReasons,
  };
}

function classifyState(input: { daysSince: number; recentCount: number; priorCount: number }): RelationshipHealthState {
  const params = HEALTH_PARAMETERS;
  if (input.daysSince > params.dormantAfterDays) return "DORMANT";
  if (input.daysSince > params.coolingAfterDays) return "COOLING";
  if (input.priorCount >= 2 && input.recentCount <= input.priorCount * 0.5) return "COOLING";
  if (input.recentCount >= 2 && input.recentCount >= input.priorCount * 1.5 + 1) return "STRENGTHENING";
  return "STABLE";
}

function stateExplanation(state: RelationshipHealthState) {
  const params = HEALTH_PARAMETERS;
  switch (state) {
    case "DORMANT":
      return `No direct interaction for more than ${params.dormantAfterDays} days; the relationship is stale.`;
    case "COOLING":
      return "Interaction activity is declining or has paused for more than two months.";
    case "STRENGTHENING":
      return "Recent interaction activity is materially higher than the prior period.";
    case "STABLE":
      return "Recent interaction activity is consistent with the prior period.";
    default:
      return "Insufficient evidence.";
  }
}

function coverageExplanation(coverage: RelationshipHealthInput["coverage"]) {
  const notes: string[] = [];
  if (!coverage.gmailConnected) notes.push("Gmail is not connected, so email history may be incomplete.");
  if (!coverage.calendarConnected) notes.push("Google Calendar is not connected, so meeting history may be incomplete.");
  return notes;
}

function buildComponents(input: {
  daysSince: number;
  recentCount: number;
  sentCount: number;
  receivedCount: number;
  meetingsInWindow: number;
  upcomingCount: number;
  lifetimeDirect: number;
  spanDays: number;
  maxEdgeStrength: number;
  coverage: RelationshipHealthInput["coverage"];
}): HealthComponent[] {
  const params = HEALTH_PARAMETERS;
  const recency = clamp(100 * Math.pow(0.5, input.daysSince / params.recencyHalfLifeDays));
  const frequency = clamp(100 * (1 - Math.exp(-input.recentCount / 4)));

  const emailTotal = input.sentCount + input.receivedCount;
  let reciprocity: number | null = null;
  let reciprocityDetail: string;
  if (emailTotal === 0) {
    reciprocityDetail = input.coverage.gmailConnected
      ? "No email exchanged in the lookback window; reciprocity not evaluated."
      : "Gmail is not connected; reciprocity not evaluated.";
  } else if (input.sentCount && input.receivedCount) {
    reciprocity = clamp((100 * Math.min(input.sentCount, input.receivedCount)) / Math.max(input.sentCount, input.receivedCount));
    reciprocityDetail = `${input.sentCount} sent / ${input.receivedCount} received.`;
  } else if (input.sentCount) {
    reciprocity = 10;
    reciprocityDetail = `${plural(input.sentCount, "email")} sent with no replies observed.`;
  } else {
    reciprocity = 25;
    reciprocityDetail = `${plural(input.receivedCount, "email")} received with no reply observed from you.`;
  }

  const meetingsAvailable = input.coverage.calendarConnected || input.meetingsInWindow > 0 || input.upcomingCount > 0;
  const meetings = meetingsAvailable ? clamp(input.meetingsInWindow * 30 + (input.upcomingCount ? 25 : 0)) : null;

  const depth = clamp(
    0.5 * clamp(input.lifetimeDirect * 4) + 0.3 * clamp((input.spanDays / 365) * 100) + 0.2 * clamp(input.maxEdgeStrength * 10),
  );

  return [
    {
      key: "recency",
      label: "Recency",
      weight: COMPONENT_WEIGHTS.recency,
      available: true,
      score: round(recency),
      detail: `Decays by half every ${params.recencyHalfLifeDays} days since the last direct interaction.`,
    },
    {
      key: "frequency",
      label: "Frequency",
      weight: COMPONENT_WEIGHTS.frequency,
      available: true,
      score: round(frequency),
      detail: `${plural(input.recentCount, "direct interaction")} in the last ${params.recentWindowDays} days.`,
    },
    {
      key: "reciprocity",
      label: "Email reciprocity",
      weight: COMPONENT_WEIGHTS.reciprocity,
      available: reciprocity !== null,
      score: reciprocity === null ? null : round(reciprocity),
      detail: reciprocityDetail,
    },
    {
      key: "meetings",
      label: "Meetings",
      weight: COMPONENT_WEIGHTS.meetings,
      available: meetings !== null,
      score: meetings === null ? null : round(meetings),
      detail:
        meetings === null
          ? "Google Calendar is not connected; meetings not evaluated."
          : `${plural(input.meetingsInWindow, "meeting")} in the last ${params.meetingWindowDays} days${input.upcomingCount ? ", plus a scheduled meeting" : ""}.`,
    },
    {
      key: "depth",
      label: "Historical depth",
      weight: COMPONENT_WEIGHTS.depth,
      available: true,
      score: round(depth),
      detail: `${plural(input.lifetimeDirect, "lifetime direct interaction")} over ${Math.floor(input.spanDays)} days${input.maxEdgeStrength ? `; strongest graph edge ${input.maxEdgeStrength}/10` : ""}.`,
    },
  ];
}

function buildEvidence(input: {
  sent: HealthInteraction[];
  received: HealthInteraction[];
  meetings: HealthInteraction[];
  upcoming: HealthInteraction[];
  imported: HealthInteraction[];
  edges: HealthEdge[];
}): HealthEvidence[] {
  const latest = (items: HealthInteraction[]) =>
    items.reduce<Date | null>((max, item) => (!max || item.occurredAt > max ? item.occurredAt : max), null);
  const evidence: HealthEvidence[] = [];
  if (input.sent.length) evidence.push({ kind: "EMAIL_SENT", source: "Gmail", count: input.sent.length, lastAt: latest(input.sent) });
  if (input.received.length) {
    evidence.push({ kind: "EMAIL_RECEIVED", source: "Gmail", count: input.received.length, lastAt: latest(input.received) });
  }
  if (input.meetings.length) {
    evidence.push({ kind: "CALENDAR_MEETING", source: "Google Calendar", count: input.meetings.length, lastAt: latest(input.meetings) });
  }
  if (input.upcoming.length) {
    evidence.push({
      kind: "UPCOMING_MEETING",
      source: "Google Calendar",
      count: input.upcoming.length,
      lastAt: input.upcoming[0]!.occurredAt,
    });
  }
  if (input.imported.length) {
    evidence.push({ kind: "CONTACT_IMPORTED", source: "Google Contacts", count: 1, lastAt: latest(input.imported) });
  }
  for (const edge of input.edges) {
    evidence.push({
      kind: "RELATIONSHIP_EDGE",
      source: edge.source,
      count: 1,
      lastAt: null,
      detail: `${edge.relationship} (strength ${edge.strength}/10)`,
    });
  }
  return evidence;
}

function recommendFollowUp(input: {
  now: Date;
  state: RelationshipHealthState;
  last: Date;
  direct: HealthInteraction[];
  upcomingMeetingAt: Date | null;
}): RelationshipHealth["followUp"] {
  const params = HEALTH_PARAMETERS;
  if (input.upcomingMeetingAt) {
    return { recommendedAt: null, overdueDays: 0, reason: `A meeting is already scheduled for ${isoDay(input.upcomingMeetingAt)}.` };
  }
  if (input.state === "DORMANT") {
    // Due when the relationship crossed the dormancy threshold; a fixed date keeps snapshots stable.
    const due = new Date(input.last.getTime() + params.dormantAfterDays * DAY_MS);
    return {
      recommendedAt: due,
      overdueDays: Math.floor(daysBetween(input.now, due)),
      reason: "The relationship is dormant; re-engage if it is still relevant.",
    };
  }

  const days = Array.from(new Set(input.direct.map((item) => utcDayKey(item.occurredAt)))).sort((a, b) => a - b);
  const gaps = days.slice(1).map((day, index) => day - days[index]!);
  const observed = median(gaps);
  const cadence = observed === null ? params.defaultCadenceDays : clamp(observed, params.minCadenceDays, params.maxCadenceDays);
  const due = new Date(input.last.getTime() + cadence * DAY_MS);
  const cadenceText =
    observed === null
      ? `a default ${params.defaultCadenceDays}-day cadence (only one interaction day observed)`
      : `the observed median cadence of ${Math.round(observed)} days${cadence !== observed ? `, bounded to ${cadence} days` : ""}`;

  if (due <= input.now) {
    const overdueDays = Math.floor(daysBetween(input.now, due));
    return {
      recommendedAt: due,
      overdueDays,
      reason: `Follow-up is ${overdueDays} days past ${cadenceText}.`,
    };
  }
  return { recommendedAt: due, overdueDays: 0, reason: `Based on ${cadenceText}.` };
}
