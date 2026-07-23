import { EntityResolutionOutcome, type DiscoveredPerson } from "@prisma/client";
import type { PeopleProviderPerson } from "./types";
import { canonicalUrl, normalizeEmail, normalizedName } from "./normalization";

export type EntityResolutionCandidate = Pick<
  DiscoveredPerson,
  "id" | "fullName" | "currentOrganizationName" | "organizationDomain" | "linkedinUrl" | "emailAddresses" | "normalizedFingerprint"
>;

export type EntityResolutionResult = {
  outcome: EntityResolutionOutcome;
  confidence: number;
  canonicalPersonId?: string;
  rationale: string;
  signals: string[];
  incomingFingerprint: string;
};

export function fingerprintPerson(input: {
  fullName: string;
  currentOrganizationName?: string | null;
  organizationDomain?: string | null;
  linkedinUrl?: string | null;
}) {
  const parts = [
    normalizedName(input.fullName),
    input.currentOrganizationName?.toLowerCase().trim() ?? "",
    input.organizationDomain?.toLowerCase().replace(/^www\./, "") ?? "",
    input.linkedinUrl ? canonicalUrl(input.linkedinUrl) : "",
  ].filter(Boolean);
  return parts.join("|");
}

export function resolveIncomingPerson(
  incoming: PeopleProviderPerson,
  existing: EntityResolutionCandidate[],
): EntityResolutionResult {
  const incomingEmails = new Set((incoming.emailAddresses ?? []).map(normalizeEmail).filter(Boolean) as string[]);
  const incomingLinkedIn = incoming.linkedinUrl ? canonicalUrl(incoming.linkedinUrl) : null;
  const incomingFingerprint = fingerprintPerson({
    fullName: incoming.fullName,
    currentOrganizationName: incoming.currentOrganizationName ?? incoming.currentOrganization?.name ?? null,
    organizationDomain: incoming.organizationDomain ?? incoming.currentOrganization?.domain ?? null,
    linkedinUrl: incoming.linkedinUrl ?? null,
  });

  for (const candidate of existing) {
    if (incomingLinkedIn && candidate.linkedinUrl && canonicalUrl(candidate.linkedinUrl) === incomingLinkedIn) {
      return exact(candidate.id, incomingFingerprint, ["LinkedIn URL exact match"]);
    }
    const sharedEmail = candidate.emailAddresses.map(normalizeEmail).find((email) => email && incomingEmails.has(email));
    if (sharedEmail) return exact(candidate.id, incomingFingerprint, [`Shared verified email ${sharedEmail}`]);
  }

  for (const candidate of existing) {
    const sameName = normalizedName(candidate.fullName) === normalizedName(incoming.fullName);
    const org = incoming.currentOrganizationName ?? incoming.currentOrganization?.name ?? null;
    const sameOrg = org && candidate.currentOrganizationName && org.toLowerCase().trim() === candidate.currentOrganizationName.toLowerCase().trim();
    const domain = incoming.organizationDomain ?? incoming.currentOrganization?.domain ?? null;
    const sameDomain = domain && candidate.organizationDomain && domain.toLowerCase().replace(/^www\./, "") === candidate.organizationDomain.toLowerCase().replace(/^www\./, "");
    if (sameName && (sameOrg || sameDomain)) {
      return {
        outcome: EntityResolutionOutcome.PROBABLE_MATCH,
        confidence: sameOrg && sameDomain ? 88 : 76,
        canonicalPersonId: candidate.id,
        rationale: "Name matched with organization or organization-domain evidence.",
        signals: ["Normalized full name match", sameOrg ? "Current organization match" : "Organization domain match"],
        incomingFingerprint,
      };
    }
  }

  const nameOnly = existing.find((candidate) => normalizedName(candidate.fullName) === normalizedName(incoming.fullName));
  if (nameOnly) {
    return {
      outcome: EntityResolutionOutcome.UNCERTAIN_MATCH,
      confidence: 44,
      rationale: "Name matched but no email, LinkedIn, organization, or domain evidence was available. Not merged automatically.",
      signals: ["Name-only match refused"],
      incomingFingerprint,
    };
  }

  return {
    outcome: EntityResolutionOutcome.NO_MATCH,
    confidence: 95,
    rationale: "No reliable existing person match found.",
    signals: ["No exact provider, email, profile URL, or organization-backed match"],
    incomingFingerprint,
  };
}

function exact(canonicalPersonId: string, incomingFingerprint: string, signals: string[]): EntityResolutionResult {
  return {
    outcome: EntityResolutionOutcome.EXACT_MATCH,
    confidence: 98,
    canonicalPersonId,
    rationale: "A stable identifier matched an existing person.",
    signals,
    incomingFingerprint,
  };
}
