import { Badge } from "@/components/ui/badge";
import { EVIDENCE_CLASS_LABELS, type EvidenceClass } from "@/lib/evidence/types";

export function EvidenceClassBadge({ evidenceClass }: { evidenceClass: EvidenceClass }) {
  const variant = evidenceClass === "AI_INFERENCE" || evidenceClass === "UNVERIFIED" ? "warning" : evidenceClass === "PUBLIC_SOURCE" ? "success" : "muted";
  return <Badge variant={variant}>{EVIDENCE_CLASS_LABELS[evidenceClass]}</Badge>;
}

export function GeneratedBadge() {
  return <Badge variant="warning">Generated suggestion</Badge>;
}
