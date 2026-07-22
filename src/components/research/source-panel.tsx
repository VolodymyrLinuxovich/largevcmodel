"use client";

import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatDate } from "@/lib/utils";

export type SourcePanelSource = {
  id: string;
  title: string;
  url: string;
  publisher?: string | null;
  domain?: string;
  publishedAt?: string | Date | null;
  accessedAt: string | Date;
  sourceType: string;
  origin: string;
  snippet?: string | null;
  supportsClaims: string[];
};

export function SourcesPanel({
  sources,
  selectedSourceId,
  onSelectSource,
}: {
  sources: SourcePanelSource[];
  selectedSourceId?: string;
  onSelectSource?: (id: string) => void;
}) {
  const domains = new Set(sources.map((source) => source.domain ?? "local demo"));
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Sources Used</CardTitle>
            <CardDescription>
              {sources.length} sources across {domains.size} unique domains.
            </CardDescription>
          </div>
          <Badge variant="outline">Provenance required</Badge>
        </div>
      </CardHeader>
      <CardContent className="max-h-[720px] space-y-3 overflow-auto pr-2">
        {sources.length ? (
          sources.map((source, index) => (
            <article
              key={source.id}
              id={`source-${source.id}`}
              className={cn(
                "rounded-md border border-border bg-white p-3 transition-colors",
                selectedSourceId === source.id && "citation-highlight bg-accent/55",
              )}
            >
              <button
                type="button"
                className="w-full text-left"
                onClick={() => onSelectSource?.(source.id)}
                aria-label={`Select source ${index + 1}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">[{index + 1}] {source.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {source.publisher ?? source.domain ?? "Unknown publisher"} - Published {formatDate(source.publishedAt)} - Accessed {formatDate(source.accessedAt)}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-1">
                    <Badge variant={source.origin === "internal_demo" ? "warning" : source.origin === "hermes" ? "success" : "muted"}>
                      {source.origin === "internal_demo" ? "Internal CRM" : source.origin}
                    </Badge>
                    <Badge variant="outline">{source.sourceType}</Badge>
                  </div>
                </div>
              </button>
              {source.snippet ? <p className="mt-2 text-xs leading-5 text-muted-foreground">{source.snippet}</p> : null}
              <div className="mt-3 space-y-1">
                {source.supportsClaims.slice(0, 4).map((claim) => (
                  <div key={claim} className="rounded-md bg-muted px-2 py-1.5 text-xs leading-5">
                    Supports: {claim}
                  </div>
                ))}
              </div>
              <Button asChild variant="outline" size="sm" className="mt-3">
                <a href={source.url} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  Open source
                </a>
              </Button>
            </article>
          ))
        ) : (
          <div className="rounded-md border border-dashed border-border p-5 text-sm text-muted-foreground">
            Sources will appear after a research run.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
