import type { RelationshipHealthState } from "@/lib/domain/relationship-health";

export type LinkedContactHealth = {
  contactId: string;
  name: string;
  role: string;
  healthScore: number | null;
  healthState: RelationshipHealthState | null;
  healthCalculatedAt: Date | null;
};

export type OpportunityRelationshipSummary =
  | { status: "NO_CONTACTS"; explanation: string }
  | { status: "NOT_CALCULATED" | "INSUFFICIENT_DATA"; explanation: string }
  | {
      status: "ASSESSED";
      score: number;
      state: RelationshipHealthState;
      strongest: LinkedContactHealth;
      calculatedAt: Date | null;
      explanation: string;
    };

/**
 * An opportunity's relationship health is the strongest assessed relationship among its linked
 * people. Contacts without enough evidence are never averaged in as zero.
 */
export function summarizeOpportunityRelationships(contacts: LinkedContactHealth[]): OpportunityRelationshipSummary {
  if (!contacts.length) return { status: "NO_CONTACTS", explanation: "No people are linked to this opportunity." };
  const assessed = contacts.filter(
    (contact): contact is LinkedContactHealth & { healthScore: number; healthState: RelationshipHealthState } =>
      contact.healthScore !== null && contact.healthState !== null && contact.healthState !== "INSUFFICIENT_DATA",
  );
  if (!assessed.length) {
    const calculated = contacts.some((contact) => contact.healthState === "INSUFFICIENT_DATA");
    return calculated
      ? { status: "INSUFFICIENT_DATA", explanation: "Linked people have too little observed interaction history to assess." }
      : { status: "NOT_CALCULATED", explanation: "Relationship health has not been calculated for the linked people yet." };
  }
  const strongest = assessed.reduce((best, contact) => (contact.healthScore > best.healthScore ? contact : best));
  return {
    status: "ASSESSED",
    score: strongest.healthScore,
    state: strongest.healthState,
    strongest,
    calculatedAt: strongest.healthCalculatedAt,
    explanation: `Strongest observed relationship: ${strongest.name} (${strongest.role.toLowerCase().replaceAll("_", " ")}).`,
  };
}
