import type { OutreachStatus } from "@prisma/client";

type OutreachContact = {
  fullName: string | null;
  primaryEmail: string | null;
  organization: string | null;
  title: string | null;
};

type OutreachSource = {
  id: string;
  title: string;
  sourceType: string;
  origin: string;
  supportsClaims: string[];
};

type OutreachOptions = {
  tone?: string;
  version?: string;
  format?: string;
  goal?: string;
  senderName?: string | null;
};

export function canApproveOutreachDraft(status: OutreachStatus) {
  return status === "AI_GENERATED";
}

function displayName(contact: OutreachContact) {
  return contact.fullName || contact.primaryEmail || "there";
}

function firstName(contact: OutreachContact) {
  const name = displayName(contact);
  return name.includes("@") ? "there" : name.split(" ")[0] || name;
}

export function generateOutreachDraft(contact: OutreachContact, sources: OutreachSource[], options: OutreachOptions = {}) {
  const tone = options.tone ?? "direct";
  const version = options.version ?? "short";
  const format = options.format ?? "email";
  const goal = options.goal || "start a focused conversation";
  const sender = options.senderName || "LargeVCModel user";
  const evidenceClaims = sources.flatMap((source) => source.supportsClaims.map((claim) => ({ source, claim }))).slice(0, 3);
  const evidenceLine = evidenceClaims[0]
    ? `I am reaching out because ${evidenceClaims[0].claim}`
    : `I am reaching out based on the context available in my connected workspace.`;
  const longContext = evidenceClaims
    .slice(1)
    .map((item) => `I also noted: ${item.claim}`)
    .join("\n");

  const body =
    version === "long"
      ? `Hi ${firstName(contact)},\n\n${evidenceLine}\n${longContext ? `\n${longContext}\n` : ""}\nI would like to ${goal}. If useful, I can keep the conversation practical and focused on where your current priorities overlap with our investment thesis.\n\nWould you be open to a short conversation next week?\n\n${sender}`
      : `Hi ${firstName(contact)},\n\n${evidenceLine}\n\nI would like to ${goal}. Would you be open to a short conversation next week?\n\n${sender}`;

  const subject = contact.organization
    ? `${contact.organization} and a focused investor conversation`
    : `A focused investor conversation`;

  return {
    format,
    tone,
    version,
    goal,
    subject,
    body,
    rationale:
      "The founder-facing message excludes citations. Personalization is limited to stored workspace evidence and public research sources.",
    rationaleClaims: evidenceClaims.map((item) => ({
      sourceId: item.source.id,
      sourceTitle: item.source.title,
      origin: item.source.origin,
      sourceType: item.source.sourceType,
      claim: item.claim,
    })),
    warning: evidenceClaims.length ? null : "No sourced personalization claims are available; the draft uses only generic context.",
  };
}
