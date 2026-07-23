"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type StartupOption = {
  id: string;
  name: string;
  profileCompleteness: number;
  pitchDeckStatus?: string | null;
};

type ProviderStatus = {
  name: string;
  status: string;
  message: string;
};

type SearchResponse = {
  interpretedCriteria: {
    semanticText: string;
    personTypes: string[];
    industries: string[];
    stages: string[];
    checkSizeMin?: number | null;
    checkSizeMax?: number | null;
    locations: string[];
    geographyPreferences: string[];
    organizations: string[];
    titles: string[];
    portfolioKeywords: string[];
    technologyKeywords: string[];
    relationshipRequirements: string[];
    warmIntroductionPreference: boolean;
    excludedTerms: string[];
    sortPreference: string;
  };
  results: Array<{
    id: string;
    rank: number;
    person: { id: string; fullName: string; title?: string | null; organization?: string | null; location?: string | null; personTypes: string[]; linkedinUrl?: string | null; websiteUrl?: string | null };
    organization?: { id: string; name: string; domain?: string | null; website?: string | null } | null;
    fitScore: number;
    scoreComponents: Array<{ key: string; label: string; score: number; weight: number; evidence: string }>;
    confidence: number;
    explanation: string;
    matchedCriteria: Array<{ criterion: string; label: string; value?: string | null; confidence?: number | null }>;
    missingCriteria: Array<{ criterion: string; label: string }>;
    uncertainCriteria: Array<{ criterion: string; label: string; value?: string | null }>;
    relationship: { directEmailHistory: boolean; googleContactPresent: boolean; gmailThreadCount: number; messageCount: number; mostRecentInteraction?: string | null; relationshipStrength: number; summary: string };
    sources: Array<{ id: string; title: string; url: string; publisher?: string | null; publishedAt?: string | null; sourceType: string; supportsClaims: string[]; confidence?: number | null }>;
    discoveryType: string;
    savedState: { saved: boolean; lists: Array<{ id: string; name: string; status: string }> };
    lastResearchedAt: string;
  }>;
  providerStatus: ProviderStatus;
  total: number;
  searchRunId: string;
  emptyReasons: string[];
  diagnostics?: {
    normalizedFilters: Record<string, unknown>;
    providerStatus: ProviderStatus;
    providerDiagnostics?: {
      model?: string;
      toolType?: string;
      webSearchExecuted: boolean;
      webSearchCallCount: number;
      researchQueries: string[];
      rawCandidateCount: number;
      parsedCandidateCount: number;
      candidatesWithValidNames: number;
      candidatesWithValidSourceUrls: number;
    };
    counts: Record<string, number>;
    rejectionCounts: Record<string, number>;
    rejections: Array<{ candidate: string; rejectedAt: string; reasons: string[] }>;
    rankingThreshold: number;
    durationMs: number;
  };
};

const PERSON_TYPES = [
  ["INVESTOR", "Investor"],
  ["FOUNDER", "Founder"],
  ["OPERATOR", "Operator"],
  ["ADVISOR", "Advisor"],
  ["SCOUT", "Scout"],
  ["ACCELERATOR", "Accelerator"],
  ["RESEARCHER", "Researcher"],
  ["POTENTIAL_CUSTOMER", "Potential customer"],
  ["STRATEGIC_PARTNER", "Strategic partner"],
];

export function PeopleSearchWorkspace({
  startups,
  providerStatus,
  initialQuery = "",
}: {
  startups: StartupOption[];
  providerStatus: ProviderStatus;
  initialQuery?: string;
}) {
  const [startupId, setStartupId] = useState(startups[0]?.id ?? "");
  const [query, setQuery] = useState(initialQuery);
  const [personType, setPersonType] = useState("");
  const [industry, setIndustry] = useState("");
  const [stage, setStage] = useState("");
  const [location, setLocation] = useState("");
  const [checkMin, setCheckMin] = useState("");
  const [checkMax, setCheckMax] = useState("");
  const [relationshipStatus, setRelationshipStatus] = useState("any");
  const [showFilters, setShowFilters] = useState(false);
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedStartup = startups.find((startup) => startup.id === startupId);
  const filters = useMemo(
    () => ({
      personTypes: personType ? [personType] : [],
      industries: split(industry),
      stages: split(stage),
      locations: split(location),
      minCheckSize: checkMin ? Number(checkMin) : undefined,
      maxCheckSize: checkMax ? Number(checkMax) : undefined,
      relationshipStatus,
    }),
    [checkMax, checkMin, industry, location, personType, relationshipStatus, stage],
  );

  async function search() {
    setError(null);
    setResponse(null);
    startTransition(async () => {
      try {
        const result = await fetch("/api/people/search", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ startupId: startupId || undefined, query, filters, limit: 12, offset: 0 }),
        });
        const body = await result.json();
        if (!result.ok) throw new Error(body.error ?? "People search failed.");
        setResponse(body);
      } catch (searchError) {
        setError(searchError instanceof Error ? searchError.message : "People search failed.");
      }
    });
  }

  async function savePerson(result: SearchResponse["results"][number]) {
    const save = await fetch("/api/people/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        personId: result.person.id,
        startupId: startupId || undefined,
        searchRunId: response?.searchRunId,
        searchResultId: result.id,
        savedReason: result.explanation,
      }),
    });
    if (save.ok) {
      setResponse((current) =>
        current
          ? {
              ...current,
              results: current.results.map((item) =>
                item.id === result.id ? { ...item, savedState: { saved: true, lists: [{ id: "saved", name: "Saved People", status: "RESEARCHING" }] } } : item,
              ),
            }
          : current,
      );
    }
  }

  return (
    <div className="space-y-10">
      <section className="border-y border-border py-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div>
            <p className="eyebrow">Search command</p>
            <Textarea
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Seed investors in the Bay Area interested in defense AI..."
              className="mt-4 min-h-32 text-lg"
              aria-label="People search objective"
            />
            <div className="mt-4 flex flex-wrap gap-3">
              <Button onClick={search} disabled={query.trim().length < 2 || isPending}>
                {isPending ? "Searching..." : "Search external people"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowFilters((value) => !value)}>
                Filters
              </Button>
            </div>
          </div>
          <aside className="space-y-4">
            <div>
              <p className="eyebrow mb-2">Startup context</p>
              {startups.length ? (
                <>
                  <Select value={startupId} onChange={(event) => setStartupId(event.target.value)} aria-label="Startup profile">
                    {startups.map((startup) => <option key={startup.id} value={startup.id}>{startup.name}</option>)}
                  </Select>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge variant="muted">{selectedStartup?.profileCompleteness ?? 0}% complete</Badge>
                    <Badge variant="muted">{selectedStartup?.pitchDeckStatus ?? "No deck"}</Badge>
                  </div>
                </>
              ) : (
                <p className="text-sm leading-6 text-muted-foreground">
                  No saved startup profile. Search will use your plain-language objective and filters only.
                </p>
              )}
            </div>
            <div className="border-y border-border py-4">
              <p className="eyebrow mb-2">Provider</p>
              <p className="text-sm font-medium">{providerStatus.name}</p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">{providerStatus.message}</p>
            </div>
          </aside>
        </div>

        {showFilters ? (
          <div className="mt-8 grid gap-3 border-t border-border pt-5 sm:grid-cols-2 lg:grid-cols-4">
            <Select value={personType} onChange={(event) => setPersonType(event.target.value)} aria-label="Person type">
              <option value="">Any person type</option>
              {PERSON_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
            <Input value={industry} onChange={(event) => setIndustry(event.target.value)} placeholder="Industry or sub-industry" />
            <Input value={stage} onChange={(event) => setStage(event.target.value)} placeholder="Stage" />
            <Input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Location" />
            <Input value={checkMin} onChange={(event) => setCheckMin(event.target.value)} placeholder="Minimum check" type="number" />
            <Input value={checkMax} onChange={(event) => setCheckMax(event.target.value)} placeholder="Maximum check" type="number" />
            <Select value={relationshipStatus} onChange={(event) => setRelationshipStatus(event.target.value)} aria-label="Relationship status">
              <option value="any">Any relationship</option>
              <option value="known">Known relationship</option>
              <option value="unknown">No known relationship</option>
              <option value="warm">Warm relationship</option>
            </Select>
          </div>
        ) : null}
        {error ? <p className="mt-5 border-y border-border py-3 text-sm text-[hsl(39_42%_68%)]">{error}</p> : null}
      </section>

      {response ? (
        <section className="space-y-8">
          <InterpretedPanel response={response} />
          {process.env.NODE_ENV === "development" && response.diagnostics ? <DiagnosticsPanel diagnostics={response.diagnostics} /> : null}
          <div className="border-y border-border">
            <div className="grid gap-3 border-b border-border py-4 md:grid-cols-[1fr_auto] md:items-end">
              <div>
                <p className="eyebrow">Search results</p>
                <h2 className="mt-2 text-2xl font-medium">{response.total} externally discovered matches</h2>
              </div>
              <p className="font-mono text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground">Run {response.searchRunId}</p>
            </div>
            {response.results.length ? (
              <div className="divide-y divide-border">
                {response.results.map((result) => (
                  <ResultCard key={result.id} result={result} onSave={() => savePerson(result)} />
                ))}
              </div>
            ) : (
              <div className="py-10">
                <p className="text-sm font-medium">No sufficiently supported results matched this search.</p>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
                  {response.emptyReasons.map((reason) => <li key={reason}>{reason}</li>)}
                </ul>
              </div>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function DiagnosticsPanel({ diagnostics }: { diagnostics: NonNullable<SearchResponse["diagnostics"]> }) {
  return (
    <details className="border-y border-border">
      <summary className="cursor-pointer py-4">
        <p className="eyebrow">Search diagnostics</p>
      </summary>
      <div className="grid gap-5 pb-5 text-sm lg:grid-cols-2">
        <div>
          <p className="eyebrow mb-3">Provider</p>
          <dl className="grid gap-2 text-muted-foreground">
            <DiagnosticRow label="Status" value={diagnostics.providerStatus.status} />
            <DiagnosticRow label="Model" value={diagnostics.providerDiagnostics?.model ?? "Unavailable"} />
            <DiagnosticRow label="Tool" value={diagnostics.providerDiagnostics?.toolType ?? "Unavailable"} />
            <DiagnosticRow label="Web search" value={diagnostics.providerDiagnostics?.webSearchExecuted ? "executed" : "not executed"} />
            <DiagnosticRow label="Tool calls" value={String(diagnostics.providerDiagnostics?.webSearchCallCount ?? 0)} />
            <DiagnosticRow label="Duration" value={`${diagnostics.durationMs}ms`} />
          </dl>
        </div>
        <div>
          <p className="eyebrow mb-3">Counts</p>
          <dl className="grid gap-2 text-muted-foreground">
            {Object.entries(diagnostics.counts).map(([key, value]) => <DiagnosticRow key={key} label={key} value={String(value)} />)}
          </dl>
        </div>
        <div className="lg:col-span-2">
          <p className="eyebrow mb-3">Research queries</p>
          <div className="grid gap-2 text-xs text-muted-foreground">
            {(diagnostics.providerDiagnostics?.researchQueries ?? []).map((query) => <p key={query}>{query}</p>)}
          </div>
        </div>
        <div className="lg:col-span-2">
          <p className="eyebrow mb-3">Rejections</p>
          {diagnostics.rejections.length ? (
            <div className="divide-y divide-border border-y border-border">
              {diagnostics.rejections.slice(0, 20).map((rejection, index) => (
                <div key={`${rejection.candidate}-${index}`} className="grid gap-2 py-3 md:grid-cols-[1fr_140px_1fr]">
                  <p>{rejection.candidate}</p>
                  <p className="font-mono text-xs text-muted-foreground">{rejection.rejectedAt}</p>
                  <p className="text-muted-foreground">{rejection.reasons.join(", ")}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">No rejected candidates recorded.</p>
          )}
        </div>
      </div>
    </details>
  );
}

function DiagnosticRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[180px_1fr] gap-3">
      <dt className="font-mono text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function InterpretedPanel({ response }: { response: SearchResponse }) {
  const criteria = response.interpretedCriteria;
  return (
    <details className="border-y border-border">
      <summary className="cursor-pointer py-4">
        <p className="eyebrow">Interpreted criteria</p>
      </summary>
      <div className="grid gap-4 pb-5 md:grid-cols-2 lg:grid-cols-3">
        <Criteria label="Looking for" values={criteria.personTypes} />
        <Criteria label="Industries" values={criteria.industries} />
        <Criteria label="Stages" values={criteria.stages} />
        <Criteria label="Locations" values={criteria.locations} />
        <Criteria label="Organizations" values={criteria.organizations} />
        <Criteria label="Technologies" values={criteria.technologyKeywords} />
        <Criteria label="Relationship" values={criteria.relationshipRequirements} />
        <Criteria label="Excluded" values={criteria.excludedTerms} />
      </div>
    </details>
  );
}

function Criteria({ label, values }: { label: string; values: string[] }) {
  return (
    <div>
      <p className="eyebrow mb-2">{label}</p>
      <div className="flex flex-wrap gap-2">
        {values.length ? values.map((value) => <Badge key={value} variant="muted">{value}</Badge>) : <span className="text-sm text-muted-foreground">Not specified</span>}
      </div>
    </div>
  );
}

function ResultCard({ result, onSave }: { result: SearchResponse["results"][number]; onSave: () => void }) {
  return (
    <article className="grid gap-6 py-7 xl:grid-cols-[1fr_280px]">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Externally discovered</Badge>
          {result.relationship.directEmailHistory ? <Badge variant="muted">Gmail relationship</Badge> : null}
          {result.relationship.googleContactPresent ? <Badge variant="muted">Google Contact</Badge> : null}
          {result.savedState.saved ? <Badge variant="muted">Saved</Badge> : null}
        </div>
        <h3 className="mt-4 text-2xl font-medium">{result.person.fullName}</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {[result.person.title, result.person.organization, result.person.location].filter(Boolean).join(" / ") || "Public profile details unavailable"}
        </p>
        <p className="mt-4 max-w-3xl text-sm leading-7">{result.explanation}</p>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <Criteria label="Matched" values={result.matchedCriteria.slice(0, 5).map((item) => item.criterion)} />
          <Criteria label="Missing" values={result.missingCriteria.slice(0, 5).map((item) => item.criterion)} />
          <Criteria label="Uncertain" values={result.uncertainCriteria.slice(0, 5).map((item) => item.criterion)} />
        </div>
        {result.sources.length ? (
          <div className="mt-6">
            <p className="eyebrow mb-3">Sources</p>
            <div className="flex flex-wrap gap-2">
              {result.sources.slice(0, 6).map((source, index) => (
                <a key={source.id} href={source.url} target="_blank" rel="noreferrer" className="border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground">
                  [{index + 1}] {source.publisher ?? new URL(source.url).hostname}
                </a>
              ))}
            </div>
          </div>
        ) : (
          <p className="mt-6 text-xs leading-5 text-[hsl(39_42%_68%)]">No source links were returned for this candidate. Treat unsupported fields as unverified.</p>
        )}
      </div>
      <aside className="space-y-5 border-t border-border pt-5 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
        <div>
          <p className="eyebrow">Fit score</p>
          <p className="mt-2 text-5xl font-medium">{result.fitScore}</p>
          <p className="mt-1 font-mono text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground">confidence {result.confidence}</p>
        </div>
        <div className="space-y-2">
          {result.scoreComponents.map((component) => (
            <div key={component.key} className="grid grid-cols-[1fr_auto] gap-3 text-xs">
              <span className="text-muted-foreground">{component.label}</span>
              <span className="font-mono">{component.score} / {component.weight}%</span>
            </div>
          ))}
        </div>
        <p className="text-xs leading-5 text-muted-foreground">{result.relationship.summary}</p>
        <div className="flex flex-wrap gap-2">
          {result.person.linkedinUrl ? <Button asChild size="sm" variant="outline"><a href={result.person.linkedinUrl} target="_blank" rel="noreferrer">Open profile</a></Button> : null}
          <Button size="sm" onClick={onSave} disabled={result.savedState.saved}>{result.savedState.saved ? "Saved" : "Save"}</Button>
          <Button asChild size="sm" variant="outline"><Link href={`/research?person=${result.person.id}`}>Draft outreach</Link></Button>
        </div>
      </aside>
    </article>
  );
}

function split(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}
