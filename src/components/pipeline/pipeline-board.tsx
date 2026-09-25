import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { HealthStateBadge } from "@/components/relationships/health-state-badge";
import type { PipelineCard } from "@/lib/pipeline/queries";
import { ACTIVE_STAGES, CLOSED_STAGES, STAGE_LABELS } from "@/lib/pipeline/stages";
import { formatDate, formatDay, isDayOverdue } from "@/lib/utils";
import { daysSince, enumLabel } from "./labels";

export function PipelineBoard({ cards, now }: { cards: PipelineCard[]; now: Date }) {
  return (
    <div className="space-y-10">
      <div className="grid auto-cols-[minmax(250px,1fr)] grid-flow-col gap-4 overflow-x-auto pb-3 xl:grid-flow-row xl:grid-cols-5">
        {ACTIVE_STAGES.map((stage) => {
          const stageCards = cards.filter((card) => card.stage === stage);
          return (
            <section key={stage} aria-labelledby={`stage-${stage}`} className="min-w-0 border-t border-border pt-4">
              <h3 id={`stage-${stage}`} className="eyebrow flex items-center justify-between">
                <span>{STAGE_LABELS[stage]}</span>
                <span aria-label={`${stageCards.length} opportunities`}>{stageCards.length}</span>
              </h3>
              {stageCards.length ? (
                <ol className="mt-4 space-y-3">
                  {stageCards.map((card) => (
                    <li key={card.id}>
                      <OpportunityCard card={card} now={now} />
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-4 text-xs leading-5 text-muted-foreground">No opportunities in this stage.</p>
              )}
            </section>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {CLOSED_STAGES.map((stage) => {
          const stageCards = cards.filter((card) => card.stage === stage);
          return (
            <section key={stage} aria-labelledby={`stage-${stage}`} className="border-t border-border pt-4">
              <h3 id={`stage-${stage}`} className="eyebrow">
                {STAGE_LABELS[stage]} ({stageCards.length})
              </h3>
              {stageCards.length ? (
                <ul className="mt-3 divide-y divide-border">
                  {stageCards.map((card) => (
                    <li key={card.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                      <Link href={`/pipeline/${card.id}`} className="font-medium underline-offset-4 hover:underline">
                        {card.company.name}
                        {card.title ? ` / ${card.title}` : ""}
                      </Link>
                      <span className="font-mono text-[0.66rem] uppercase tracking-[0.08em] text-muted-foreground">
                        {formatDate(card.stageChangedAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">None.</p>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function OpportunityCard({ card, now }: { card: PipelineCard; now: Date }) {
  const overdue = card.nextActionAt ? isDayOverdue(card.nextActionAt, now) : false;
  return (
    <Link
      href={`/pipeline/${card.id}`}
      className="block border border-border p-4 transition-colors hover:border-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 break-words text-sm font-semibold">{card.company.name}</p>
        <Badge variant={card.priority === "HIGH" ? "default" : "outline"}>{enumLabel(card.priority)}</Badge>
      </div>
      {card.title ? <p className="mt-1 text-xs text-muted-foreground">{card.title}</p> : null}
      <dl className="mt-3 space-y-1 font-mono text-[0.66rem] uppercase tracking-[0.08em] text-muted-foreground">
        <div className="flex justify-between gap-2">
          <dt>Fit</dt>
          <dd>{card.currentFitScore ? card.currentFitScore.overall : "Not scored"}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>In stage</dt>
          <dd>{daysSince(card.stageChangedAt, now)}d</dd>
        </div>
      </dl>
      <div className="mt-3">
        {card.relationship.status === "ASSESSED" ? (
          <HealthStateBadge state={card.relationship.state} score={card.relationship.score} />
        ) : (
          <Badge variant="muted">{card.relationship.status === "NO_CONTACTS" ? "No people linked" : enumLabel(card.relationship.status)}</Badge>
        )}
      </div>
      {card.nextAction ? (
        <p className={overdue ? "mt-3 text-xs leading-5 text-[hsl(39_32%_70%)]" : "mt-3 text-xs leading-5 text-muted-foreground"}>
          Next: {card.nextAction}
          {card.nextActionAt ? ` (${overdue ? "overdue, " : ""}${formatDay(card.nextActionAt)})` : ""}
        </p>
      ) : null}
    </Link>
  );
}
