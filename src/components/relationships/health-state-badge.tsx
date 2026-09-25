import { Badge } from "@/components/ui/badge";
import type { RelationshipHealthState } from "@/lib/domain/relationship-health";
import { formatDate } from "@/lib/utils";

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

export function HealthStateBadge({
  state,
  score,
  calculatedAt,
}: {
  state: RelationshipHealthState | null | undefined;
  score?: number | null;
  /** Stored health decays with time; show when a persisted value was computed. */
  calculatedAt?: Date | null;
}) {
  const variant = !state || state === "INSUFFICIENT_DATA" ? "muted" : state === "COOLING" || state === "DORMANT" ? "warning" : "success";
  const asOf = calculatedAt ? `as of ${formatDate(calculatedAt)}` : null;
  return (
    <Badge variant={variant} title={asOf ?? undefined}>
      {healthStateLabel(state)}
      {typeof score === "number" ? ` / ${score}` : ""}
      {asOf ? <span className="sr-only"> ({asOf})</span> : null}
    </Badge>
  );
}
