import { EmptyState, Timestamp } from "@/components/workspace/core";
import { ApiActionButton } from "@/components/workspace/api-action-button";
import type { RelationshipHealth } from "@/lib/domain/relationship-health";
import { formatDate } from "@/lib/utils";
import { HealthStateBadge } from "./health-state-badge";

export function RelationshipHealthPanel({ contactId, health }: { contactId: string; health: RelationshipHealth }) {
  const insufficient = health.state === "INSUFFICIENT_DATA";
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-4xl">{health.score ?? "N/A"}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <HealthStateBadge state={health.state} />
            <span className="font-mono text-[0.66rem] uppercase tracking-[0.08em] text-muted-foreground">{health.algorithmVersion}</span>
          </div>
        </div>
        <ApiActionButton
          endpoint="/api/relationships/health/refresh"
          payload={{ contactIds: [contactId] }}
          variant="outline"
          size="sm"
          refreshOnSuccess
        >
          Save snapshot
        </ApiActionButton>
      </div>

      <dl className="mt-5 divide-y divide-border border-y border-border text-sm">
        {[
          ["Last interaction", health.lastInteractionAt ? <Timestamp value={health.lastInteractionAt} /> : "None observed"],
          [
            "Trend",
            health.trend.direction === "UNKNOWN"
              ? "Unknown"
              : `${health.trend.recentCount} in last ${health.trend.windowDays}d vs ${health.trend.priorCount} prior`,
          ],
          ["Upcoming meeting", health.upcomingMeetingAt ? <Timestamp value={health.upcomingMeetingAt} /> : "None scheduled"],
          [
            "Follow up",
            health.followUp.recommendedAt
              ? `${formatDate(health.followUp.recommendedAt)}${health.followUp.overdueDays ? ` (${health.followUp.overdueDays} days overdue)` : ""}`
              : "No recommendation",
          ],
        ].map(([label, value]) => (
          <div key={String(label)} className="grid gap-2 py-3 sm:grid-cols-[150px_1fr]">
            <dt className="eyebrow">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">{health.followUp.reason}</p>

      {insufficient ? (
        <div className="mt-5">
          <EmptyState title="Insufficient evidence" body={health.insufficientReasons.join(" ")} />
        </div>
      ) : (
        <table className="mt-5 w-full text-left text-xs">
          <caption className="eyebrow mb-2 text-left">Score components</caption>
          <thead className="font-mono uppercase tracking-[0.08em] text-muted-foreground">
            <tr>
              <th scope="col" className="py-2">Signal</th>
              <th scope="col" className="py-2">Weight</th>
              <th scope="col" className="py-2">Score</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border border-y border-border">
            {health.components.map((component) => (
              <tr key={component.key} className="align-top">
                <th scope="row" className="py-2 pr-3 font-normal">
                  {component.label}
                  <span className="mt-1 block text-muted-foreground">{component.detail}</span>
                </th>
                <td className="py-2 pr-3 font-mono">{component.available ? component.weight : "excluded"}</td>
                <td className="py-2 font-mono">{component.score ?? "N/A"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <ul className="mt-5 space-y-2 text-xs leading-5 text-muted-foreground">
        {health.explanation.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {health.evidence.length ? (
        <p className="mt-4 font-mono text-[0.66rem] uppercase tracking-[0.08em] text-muted-foreground">
          Evidence: {health.evidence.map((item) => `${item.source} ${item.kind.replaceAll("_", " ").toLowerCase()}${item.count > 1 ? ` x${item.count}` : ""}`).join(" / ")}
        </p>
      ) : null}
    </div>
  );
}
