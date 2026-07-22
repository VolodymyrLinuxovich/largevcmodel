"use client";

import Link from "next/link";
import { ArrowUpRight, CheckCircle2, CircleAlert, Database, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";

type Candidate = {
  contact: {
    id: string;
    fullName: string;
    role: string;
    location: string;
    sector: string;
    stage: string;
    relationshipStrength: number;
    researchConfidence: number;
    dataBoundary: string;
    company?: {
      name: string;
      sector: string;
      stage: string;
      headquarters: string;
      latestFundingRound?: string | null;
      latestFundingAmount?: string | null;
      latestFundingDate?: string | Date | null;
      checkSizeFit: string;
    } | null;
  };
  score: {
    overall: number;
    thesisMatch: number;
    stageFit: number;
    geographyFit: number;
    momentum: number;
    relationship: number;
    evidence: number;
    explanation: string;
    citations: string[];
  };
  claims: Array<{
    id: string;
    text: string;
    provenance: string;
    confidence: number;
    sourceIds: string[];
  }>;
  warmPath: string;
};

export function CandidateCard({
  candidate,
  rank,
  sourceNumberById,
  selected,
  onSelect,
  onCitationClick,
}: {
  candidate: Candidate;
  rank: number;
  sourceNumberById: Map<string, number>;
  selected?: boolean;
  onSelect: () => void;
  onCitationClick: (sourceId: string) => void;
}) {
  const company = candidate.contact.company;
  const unverifiedCount = candidate.claims.filter((claim) => claim.provenance === "unverified").length;
  const inferenceCount = candidate.claims.filter((claim) => claim.provenance === "ai_inference").length;
  const internalCount = candidate.claims.filter((claim) => claim.provenance === "internal_crm").length;
  return (
    <Card className={selected ? "border-primary" : undefined}>
      <CardContent className="p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">#{rank}</Badge>
              <h3 className="text-base font-semibold">{candidate.contact.fullName}</h3>
              <span className="text-sm text-muted-foreground">{candidate.contact.role}</span>
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              {company?.name ?? "Unknown company"} - {candidate.contact.location} - {company?.sector ?? candidate.contact.sector}
            </div>
            <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2 xl:grid-cols-4">
              <Fact label="Stage" value={company?.stage ?? candidate.contact.stage} />
              <Fact label="Latest funding" value={`${company?.latestFundingRound ?? "Unknown"} ${company?.latestFundingAmount ?? ""}`} />
              <Fact label="Funding date" value={formatDate(company?.latestFundingDate)} />
              <Fact label="Relationship" value={`${candidate.contact.relationshipStrength}/10`} />
            </div>
            <p className="mt-3 text-sm leading-6">
              {candidate.score.explanation}{" "}
              {candidate.score.citations.map((sourceId) => (
                <button
                  key={sourceId}
                  type="button"
                  onClick={() => onCitationClick(sourceId)}
                  className="font-mono text-xs font-semibold text-primary underline-offset-2 hover:underline"
                >
                  [{sourceNumberById.get(sourceId) ?? "?"}]
                </button>
              ))}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="success">
                <CheckCircle2 className="mr-1 h-3 w-3" aria-hidden="true" />
                {candidate.contact.researchConfidence}% confidence
              </Badge>
              <Badge variant="warning">
                <Database className="mr-1 h-3 w-3" aria-hidden="true" />
                {internalCount} Internal CRM claims
              </Badge>
              <Badge variant="muted">
                <Sparkles className="mr-1 h-3 w-3" aria-hidden="true" />
                {inferenceCount} AI inference
              </Badge>
              {unverifiedCount ? (
                <Badge variant="warning">
                  <CircleAlert className="mr-1 h-3 w-3" aria-hidden="true" />
                  {unverifiedCount} Unverified
                </Badge>
              ) : null}
            </div>
          </div>
          <div className="grid w-full gap-2 sm:grid-cols-3 xl:w-72 xl:grid-cols-1">
            <div className="rounded-md bg-primary px-4 py-3 text-primary-foreground">
              <div className="text-xs opacity-80">Overall fit</div>
              <div className="text-3xl font-semibold">{candidate.score.overall}</div>
              <div className="mt-1 text-xs opacity-80">Prioritization heuristic</div>
            </div>
            <ScoreRow label="Thesis" value={candidate.score.thesisMatch} />
            <ScoreRow label="Timing" value={candidate.score.momentum} />
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-3 border-t border-border pt-3 md:flex-row md:items-center md:justify-between">
          <div className="text-xs leading-5 text-muted-foreground">
            Warm path: {candidate.warmPath} This is not an objective judgment of founder quality.
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onSelect}>Select</Button>
            <Button asChild variant="secondary" size="sm">
              <Link href={`/contacts/${candidate.contact.id}`}>
                Profile
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted px-3 py-2">
      <div className="text-[11px] uppercase text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-medium">{value}</div>
    </div>
  );
}

function ScoreRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-white px-3 py-2">
      <div className="flex items-center justify-between text-xs">
        <span>{label}</span>
        <span className="font-semibold">{value}</span>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-muted">
        <div className="h-1.5 rounded-full bg-primary" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
