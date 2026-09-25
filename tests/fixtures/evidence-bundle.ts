import type { ClaimProvenance } from "@prisma/client";
import { calculateRelationshipHealth } from "@/lib/domain/relationship-health";
import type { EvidenceBundle } from "@/lib/evidence/loader";

/** Deterministic evidence-bundle builders shared by brief and memo tests. */
export const NOW = new Date("2026-09-01T12:00:00.000Z");
export const DAY = 86_400_000;
export const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY);

type ClaimInput = { id: string; text: string; category: string; provenance: ClaimProvenance; researchRunId?: string | null; sources?: Array<{ id: string; url: string; accessedDaysAgo?: number }> };

export function claim(input: ClaimInput): EvidenceBundle["claims"][number] {
  return {
    id: input.id,
    text: input.text,
    category: input.category,
    provenance: input.provenance,
    confidence: 70,
    extractedAt: daysAgo(3),
    researchRunId: input.researchRunId ?? null,
    subject: "company",
    contactId: null,
    sources: (input.sources ?? []).map((source) => ({
      id: source.id,
      title: `Source ${source.id}`,
      url: source.url,
      publisher: "example.com",
      publishedAt: null,
      accessedAt: daysAgo(source.accessedDaysAgo ?? 5),
      sourceType: "news",
      origin: "hermes",
    })),
  };
}

export function person(input: { id: string; name: string; role: string; interactions?: Array<{ type: "EMAIL_SENT" | "EMAIL_RECEIVED" | "CALENDAR_MEETING"; daysAgo: number }> }) {
  return {
    contactId: input.id,
    name: input.name,
    email: `${input.id}@example.com`,
    title: null,
    organization: null,
    role: input.role,
    health: calculateRelationshipHealth({
      now: NOW,
      interactions: (input.interactions ?? []).map((item) => ({ type: item.type, occurredAt: daysAgo(item.daysAgo) })),
      coverage: { gmailConnected: true, calendarConnected: true },
    }),
  };
}

/** A bundle with nothing but a company name: the minimum a brief must handle. */
export function emptyBundle(overrides: Partial<EvidenceBundle> = {}): EvidenceBundle {
  return {
    now: NOW,
    opportunity: {
      id: "opp-1",
      title: null,
      stage: "SCREENING",
      priority: "MEDIUM",
      source: "OTHER",
      sourceDetail: null,
      ownerName: null,
      nextAction: null,
      nextActionAt: null,
      notes: null,
      passReason: null,
      stageChangedAt: daysAgo(10),
      createdAt: daysAgo(20),
    },
    company: {
      id: "co-1",
      name: "Acme Robotics",
      domain: null,
      website: null,
      description: null,
      sector: null,
      stage: null,
      geography: null,
      businessModel: null,
      source: "user",
      updatedAt: daysAgo(20),
    },
    thesis: null,
    fitScore: null,
    people: [],
    introducer: null,
    claims: [],
    emails: [],
    meetings: [],
    edges: [],
    stageEvents: [],
    targetMeeting: null,
    coverage: { gmailConnected: true, calendarConnected: true },
    ...overrides,
  };
}
