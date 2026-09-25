import { Badge } from "@/components/ui/badge";
import type { RelationshipHealthState } from "@/lib/domain/relationship-health";

const LABELS: Record<RelationshipHealthState, string> = {
  STRENGTHENING: "Strengthening",
  STABLE: "Stable",
  COOLING: "Cooling",
  DORMANT: "Dormant",
  INSUFFICIENT_DATA: "Insufficient data",
};

export function healthStateLabel(state: RelationshipHealthState | null | undefined) {
  return state ? LABELS[state] : "Not calculated";
}

export function HealthStateBadge({ state, score }: { state: RelationshipHealthState | null | undefined; score?: number | null }) {
  const variant = !state || state === "INSUFFICIENT_DATA" ? "muted" : state === "COOLING" || state === "DORMANT" ? "warning" : "success";
  return (
    <Badge variant={variant}>
      {healthStateLabel(state)}
      {typeof score === "number" ? ` / ${score}` : ""}
    </Badge>
  );
}
