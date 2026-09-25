import type { ClaimProvenance } from "@prisma/client";
import { safeExternalUrl } from "./safe-url";
import { ESTABLISHED_CLASSES, type EvidenceClass, type EvidenceItem, type KeyFact, type SourceRef } from "./types";

/**
 * Maps the repository's ClaimProvenance onto evidence classes. A PUBLIC_RESEARCH claim without any
 * stored source is downgraded to UNVERIFIED: a public claim is only as good as its citation.
 */
export function classifyClaim(provenance: ClaimProvenance, sourceCount: number): EvidenceClass {
  switch (provenance) {
    case "PUBLIC_RESEARCH":
      return sourceCount > 0 ? "PUBLIC_SOURCE" : "UNVERIFIED";
    case "CONNECTED_ACCOUNT":
      return "CONNECTED_ACCOUNT";
    case "USER_PROVIDED":
      return "USER_PROVIDED";
    case "AI_INFERENCE":
      return "AI_INFERENCE";
    default:
      return "UNVERIFIED";
  }
}

export function isEstablished(item: Pick<EvidenceItem, "evidenceClass">) {
  return ESTABLISHED_CLASSES.includes(item.evidenceClass);
}

export type StoredSource = {
  id: string;
  title: string;
  url: string;
  publisher: string | null;
  publishedAt: Date | null;
  accessedAt: Date;
  sourceType: string;
  origin: string;
};

export function toSourceRef(source: StoredSource): SourceRef {
  return {
    id: source.id,
    title: source.title,
    url: safeExternalUrl(source.url),
    publisher: source.publisher,
    publishedAt: source.publishedAt?.toISOString() ?? null,
    accessedAt: source.accessedAt.toISOString(),
    sourceType: source.sourceType,
    origin: source.origin,
  };
}

export type StoredClaim = {
  id: string;
  text: string;
  category: string;
  provenance: ClaimProvenance;
  confidence: number | null;
  extractedAt: Date;
  sources: StoredSource[];
};

export function claimToEvidence(claim: StoredClaim): EvidenceItem {
  return {
    id: `claim:${claim.id}`,
    text: claim.text,
    category: claim.category,
    evidenceClass: classifyClaim(claim.provenance, claim.sources.length),
    confidence: claim.confidence,
    sourceIds: claim.sources.map((source) => source.id),
    record: { type: "claim", id: claim.id },
    observedAt: claim.extractedAt.toISOString(),
  };
}

/**
 * Investment facts that must never be stated without evidence. A fact is ESTABLISHED only when a
 * connected-account, cited public-source or user-provided claim supports it.
 */
export const SENSITIVE_FACTS = [
  { key: "revenue", label: "Revenue", pattern: /\b(revenue|arr|mrr|annual recurring|bookings)\b/i },
  { key: "funding", label: "Funding raised", pattern: /\b(funding|raised|round|seed|series [a-e])\b/i },
  { key: "valuation", label: "Valuation", pattern: /\bvaluation|valued at|post-money|pre-money\b/i },
  { key: "employees", label: "Employee count", pattern: /\b(employees|headcount|team size|staff)\b/i },
  { key: "traction", label: "Traction", pattern: /\b(traction|growth|users|usage|retention|pilots?)\b/i },
  { key: "investors", label: "Investors", pattern: /\b(investors?|backed by|led by|participation from)\b/i },
  { key: "customers", label: "Customers", pattern: /\b(customers?|clients?|contracts?)\b/i },
] as const;

export type SensitiveFactKey = (typeof SENSITIVE_FACTS)[number]["key"];

export function resolveKeyFacts(items: EvidenceItem[]): KeyFact[] {
  return SENSITIVE_FACTS.map((fact) => {
    const matching = items.filter((item) => fact.pattern.test(`${item.category ?? ""} ${item.text}`));
    const established = matching.filter(isEstablished);
    return {
      key: fact.key,
      label: fact.label,
      status: established.length ? "ESTABLISHED" : matching.length ? "UNVERIFIED" : "UNAVAILABLE",
      items: established.length ? established : matching,
    };
  });
}
