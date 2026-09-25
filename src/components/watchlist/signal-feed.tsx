import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { enumLabel } from "@/components/pipeline/labels";
import { formatTime } from "@/lib/utils";

export type FeedSignal = {
  id: string;
  type: string;
  title: string;
  detail: string | null;
  provenance: string;
  occurredAt: Date;
  detectedAt: Date;
  readAt: Date | null;
  targetLabel: string;
  targetHref: string | null;
};

export function SignalFeed({ signals }: { signals: FeedSignal[] }) {
  return (
    <ol className="divide-y divide-border border-y border-border">
      {signals.map((signal) => (
        <li key={signal.id} className="grid gap-2 py-4 md:grid-cols-[1fr_260px]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {signal.readAt ? null : <Badge variant="default">New</Badge>}
              <Badge variant="outline">{enumLabel(signal.type)}</Badge>
              {signal.targetHref ? (
                <Link href={signal.targetHref} className="text-xs underline-offset-4 hover:underline">
                  {signal.targetLabel}
                </Link>
              ) : (
                <span className="text-xs">{signal.targetLabel}</span>
              )}
            </div>
            <p className={signal.readAt ? "mt-2 text-sm text-muted-foreground" : "mt-2 text-sm font-semibold"}>{signal.title}</p>
            {signal.detail ? <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">{signal.detail}</p> : null}
          </div>
          <dl className="space-y-1 font-mono text-[0.64rem] uppercase tracking-[0.08em] text-muted-foreground md:text-right">
            <div>
              <dt className="inline">Occurred </dt>
              <dd className="inline">{formatTime(signal.occurredAt)}</dd>
            </div>
            <div>
              <dt className="inline">Detected </dt>
              <dd className="inline">{formatTime(signal.detectedAt)}</dd>
            </div>
            <div>
              <dt className="sr-only">Provenance</dt>
              <dd className="normal-case tracking-normal">{signal.provenance}</dd>
            </div>
          </dl>
        </li>
      ))}
    </ol>
  );
}
