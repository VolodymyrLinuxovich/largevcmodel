/**
 * Shared evidence vocabulary for briefs and memos. Every item states where it came from so the UI
 * can separate verified facts, user input, AI inference and missing information.
 * All dates are ISO strings so assembled documents can be stored as JSON snapshots.
 */

export type EvidenceClass = "CONNECTED_ACCOUNT" | "PUBLIC_SOURCE" | "USER_PROVIDED" | "AI_INFERENCE" | "UNVERIFIED";

export const EVIDENCE_CLASS_LABELS: Record<EvidenceClass, string> = {
  CONNECTED_ACCOUNT: "Connected account",
  PUBLIC_SOURCE: "Public source",
  USER_PROVIDED: "User provided",
  AI_INFERENCE: "AI inference",
  UNVERIFIED: "Unverified",
};

/** Classes that may be presented as established facts. */
export const ESTABLISHED_CLASSES: readonly EvidenceClass[] = ["CONNECTED_ACCOUNT", "PUBLIC_SOURCE", "USER_PROVIDED"];

export type SourceRef = {
  id: string;
  title: string;
  /** Only http(s) URLs survive; anything else is null and rendered as plain text. */
  url: string | null;
  publisher: string | null;
  publishedAt: string | null;
  accessedAt: string;
  sourceType: string;
  origin: string;
};

export type RecordRef = { type: "company" | "claim" | "gmail_thread" | "calendar_event" | "contact" | "fit_score" | "relationship_edge"; id: string; href?: string | null };

export type EvidenceItem = {
  id: string;
  text: string;
  category: string | null;
  evidenceClass: EvidenceClass;
  confidence: number | null;
  sourceIds: string[];
  record: RecordRef;
  observedAt: string | null;
};

/** Content produced by LargeVCModel rules rather than found in evidence. Always labelled as generated. */
export type GeneratedItem = {
  kind: "GENERATED_SUGGESTION";
  text: string;
  /** Why the rule fired, pointing at the evidence (or its absence) that triggered it. */
  basis: string;
};

export type KeyFactStatus = "ESTABLISHED" | "UNVERIFIED" | "UNAVAILABLE";

export type KeyFact = {
  key: string;
  label: string;
  status: KeyFactStatus;
  items: EvidenceItem[];
};
