import { Timestamp } from "@/components/workspace/core";
import type { OpportunityDetail } from "@/lib/pipeline/queries";
import { STAGE_LABELS } from "@/lib/pipeline/stages";
import { enumLabel } from "./labels";

function describe(event: OpportunityDetail["events"][number]) {
  if (event.type === "STAGE_CHANGED" && event.fromStage && event.toStage) {
    return `${STAGE_LABELS[event.fromStage]} to ${STAGE_LABELS[event.toStage]}`;
  }
  if (event.type === "CREATED") return `Created in ${event.toStage ? STAGE_LABELS[event.toStage] : "pipeline"}`;
  if (event.type === "SCORE_UPDATED" && event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata)) {
    const { previous, current } = event.metadata as { previous?: number | null; current?: number };
    return `Fit score ${previous ?? "none"} to ${current ?? "unknown"}`;
  }
  if (event.type === "UPDATED" && event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata)) {
    const fields = (event.metadata as { fields?: string[] }).fields ?? [];
    return `Updated ${fields.join(", ") || "details"}`;
  }
  return enumLabel(event.type);
}

export function OpportunityTimeline({ events }: { events: OpportunityDetail["events"] }) {
  if (!events.length) return <p className="text-sm text-muted-foreground">No activity recorded.</p>;
  return (
    <ol className="divide-y divide-border border-y border-border">
      {events.map((event) => (
        <li key={event.id} className="grid gap-1 py-3 sm:grid-cols-[180px_1fr]">
          <p className="font-mono text-[0.66rem] uppercase tracking-[0.08em] text-muted-foreground">
            <Timestamp value={event.createdAt} />
          </p>
          <div>
            <p className="text-sm">{describe(event)}</p>
            {event.note ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{event.note}</p> : null}
            <p className="mt-1 font-mono text-[0.62rem] uppercase tracking-[0.08em] text-muted-foreground">{event.actor}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
