import { buildCitationMap } from "@/lib/domain/sources";
import type { EvidenceItem, GeneratedItem, SourceRef } from "@/lib/evidence/types";
import { formatDate } from "@/lib/utils";
import { EvidenceClassBadge, GeneratedBadge } from "./evidence-class-badge";

export function citationMapFor(sources: SourceRef[]) {
  return buildCitationMap(sources.map((source) => ({ ...source, url: source.url ?? "" })));
}

export function EvidenceList({
  items,
  citations,
  empty,
}: {
  items: EvidenceItem[];
  citations: Map<string, number>;
  empty: string;
}) {
  if (!items.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y divide-border border-y border-border">
      {items.map((item) => (
        <li key={item.id} className="py-3">
          <p className="break-words text-sm leading-6">
            {item.record.href ? (
              <a href={item.record.href} target="_blank" rel="noreferrer noopener" className="underline-offset-4 hover:underline">
                {item.text}
              </a>
            ) : (
              item.text
            )}
            {item.sourceIds.map((sourceId) => {
              const number = citations.get(sourceId);
              return number ? (
                <a key={sourceId} href={`#source-${number}`} className="ml-1 font-mono text-[0.7rem] underline" aria-label={`Source ${number}`}>
                  [{number}]
                </a>
              ) : null;
            })}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <EvidenceClassBadge evidenceClass={item.evidenceClass} />
            {item.category ? <span className="font-mono text-[0.64rem] uppercase tracking-[0.08em] text-muted-foreground">{item.category}</span> : null}
            {item.confidence !== null ? (
              <span className="font-mono text-[0.64rem] uppercase tracking-[0.08em] text-muted-foreground">confidence {item.confidence}</span>
            ) : null}
            {item.observedAt ? (
              <span className="font-mono text-[0.64rem] uppercase tracking-[0.08em] text-muted-foreground">{formatDate(item.observedAt)}</span>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function GeneratedList({ items, empty }: { items: GeneratedItem[]; empty: string }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y divide-border border-y border-border">
      {items.map((item) => (
        <li key={`${item.text}-${item.basis}`} className="py-3">
          <p className="text-sm leading-6">{item.text}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <GeneratedBadge />
            <span className="text-xs leading-5 text-muted-foreground">Basis: {item.basis}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function MissingList({ items }: { items: string[] }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">No gaps detected in the evaluated fields.</p>;
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-[hsl(39_32%_70%)]">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export function SourceAppendix({ sources }: { sources: SourceRef[] }) {
  if (!sources.length) return <p className="text-sm text-muted-foreground">No public sources were cited.</p>;
  return (
    <ol className="divide-y divide-border border-y border-border">
      {sources.map((source, index) => (
        <li key={source.id} id={`source-${index + 1}`} className="grid gap-1 py-3 sm:grid-cols-[48px_1fr]">
          <span className="font-mono text-sm">[{index + 1}]</span>
          <div className="min-w-0">
            {source.url ? (
              <a href={source.url} target="_blank" rel="noreferrer noopener" className="break-words text-sm font-semibold underline-offset-4 hover:underline">
                {source.title}
              </a>
            ) : (
              <p className="break-words text-sm font-semibold">{source.title} (link unavailable)</p>
            )}
            <p className="mt-1 font-mono text-[0.64rem] uppercase tracking-[0.08em] text-muted-foreground">
              {source.publisher ?? "publisher unavailable"} / {source.sourceType} / origin {source.origin} / published{" "}
              {source.publishedAt ? formatDate(source.publishedAt) : "date unavailable"} / accessed {formatDate(source.accessedAt)}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
