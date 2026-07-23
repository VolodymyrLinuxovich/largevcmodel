"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type ParsedNetworkQuery = {
  rawQuery: string;
  entityTypes: string[];
  roles: string[];
  topics: string[];
  geographies: string[];
  institutions: string[];
  companies: string[];
  fundingStages: string[];
  dateRange?: { preset: string; start?: string; end?: string };
  relationshipRequirements: string[];
  interactionTypes: string[];
  followUpState?: string;
  introductionPathRequired: boolean;
  positiveKeywords: string[];
  negativeKeywords: string[];
  strictness: "strict" | "balanced" | "exploratory";
  requestedAutomatedContent: boolean;
  unavailableVerification: string[];
  sources: string[];
};

type SearchEvidence = {
  criterion: string;
  state: "matched" | "missing" | "contradicted" | "unavailable";
  label: string;
  value?: string | null;
  source: string;
};

type SearchResult = {
  id: string;
  entityType: "PERSON" | "COMPANY" | "ORGANIZATION" | "CONVERSATION" | "MEETING";
  title: string;
  subtitle?: string | null;
  href?: string | null;
  score: number;
  confidence: number;
  classification: string;
  classificationConfidence: number;
  classificationSignals: string[];
  whyMatched: string;
  evidence: SearchEvidence[];
  missingCriteria: SearchEvidence[];
  contradictedCriteria: SearchEvidence[];
  unavailableCriteria: SearchEvidence[];
  sourceTypes: string[];
  lastInteractionAt?: string | null;
  metadata?: { contactId?: string; companyId?: string; [key: string]: unknown };
};

type SearchResponse = {
  interpreted: ParsedNetworkQuery;
  results: SearchResult[];
  emptyReasons: string[];
  counts: {
    contacts: number;
    companies: number;
    conversations: number;
    meetings: number;
    candidates: number;
  };
};

type ResearchRun = {
  id: string;
  query: string;
  provider: string;
  status: string;
  summary?: string | null;
  error?: string | null;
  claims?: Array<{ id: string; text: string; provenance: string; confidence?: number | null }>;
};

const ENTITY_OPTIONS = [
  ["", "Auto"],
  ["person", "People"],
  ["company", "Companies"],
  ["organization", "Organizations"],
  ["conversation", "Conversations"],
  ["meeting", "Meetings"],
  ["mixed", "Mixed"],
];

export function ResearchConsole({
  providerConfigured,
  contactsConnected,
  initialQuery = "",
}: {
  providerConfigured: boolean;
  contactsConnected: boolean;
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [stage, setStage] = useState("");
  const [sector, setSector] = useState("");
  const [geography, setGeography] = useState("");
  const [dateRange, setDateRange] = useState("");
  const [entityType, setEntityType] = useState("");
  const [relationshipFilter, setRelationshipFilter] = useState("");
  const [strictness, setStrictness] = useState<"strict" | "balanced" | "exploratory">("balanced");
  const [loading, setLoading] = useState<"idle" | "interpreting" | "searching" | "researching">("idle");
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);
  const [interpretation, setInterpretation] = useState<ParsedNetworkQuery | null>(null);
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [run, setRun] = useState<ResearchRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [researchNotice, setResearchNotice] = useState<string | null>(null);

  const payload = useMemo(
    () => ({
      query,
      stage: stage || undefined,
      sector: sector || undefined,
      geography: geography || undefined,
      dateRange: dateRange || undefined,
      entityType: entityType || undefined,
      relationshipFilter: relationshipFilter || undefined,
      strictness,
    }),
    [dateRange, entityType, geography, query, relationshipFilter, sector, stage, strictness],
  );
  const selectedResult = results?.results.find((result) => result.id === selectedResultId) ?? null;
  const selectedResearchSubject = selectedResult?.metadata?.contactId
    ? { contactId: selectedResult.metadata.contactId }
    : selectedResult?.metadata?.companyId
      ? { companyId: selectedResult.metadata.companyId }
      : null;

  async function interpretObjective() {
    setLoading("interpreting");
    setError(null);
    setResearchNotice(null);
    setRun(null);
    try {
      const response = await fetch("/api/query/interpret", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Interpretation failed");
      setInterpretation(body.interpreted);
    } catch (interpretError) {
      setError(interpretError instanceof Error ? interpretError.message : "Interpretation failed");
    } finally {
      setLoading("idle");
    }
  }

  async function searchNetwork() {
    setLoading("searching");
    setError(null);
    setResearchNotice(null);
    setRun(null);
    try {
      const response = await fetch("/api/query", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Search failed");
      setResults(body);
      setInterpretation(body.interpreted);
      setSelectedResultId(body.results?.[0]?.id ?? null);
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : "Search failed");
    } finally {
      setLoading("idle");
    }
  }

  async function researchSelected() {
    if (!selectedResearchSubject) return;
    if (!providerConfigured) {
      setResearchNotice("Public research is unavailable until a provider is connected.");
      return;
    }
    setLoading("researching");
    setError(null);
    setResearchNotice(null);
    try {
      const response = await fetch("/api/research", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...selectedResearchSubject, query: query || "Research this selected record." }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Research failed");
      setRun(body.run);
    } catch (researchError) {
      setError(researchError instanceof Error ? researchError.message : "Research failed");
    } finally {
      setLoading("idle");
    }
  }

  return (
    <div className="space-y-8">
      <section className="border-y border-border">
        <div className="border-b border-border p-4">
          <p className="eyebrow mb-2">COMMAND</p>
          <h2 className="text-sm font-semibold uppercase tracking-[0.08em]">What are you looking for?</h2>
        </div>
        <div className="space-y-4 p-4">
          <Textarea
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setInterpretation(null);
            }}
            placeholder="Find investors I spoke with last year, conversations about robotics, people who could introduce me to someone at Anduril..."
            aria-label="Natural language network intelligence query"
          />
          <button
            type="button"
            className="text-[0.68rem] uppercase tracking-[0.14em] text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground"
            onClick={() => setShowFilters((value) => !value)}
          >
            {showFilters ? "Hide filters" : "Filters"}
          </button>
          {showFilters ? (
            <div className="grid gap-3 border-y border-border py-4 sm:grid-cols-2 lg:grid-cols-3">
              <Input value={sector} onChange={(event) => setSector(event.target.value)} placeholder="Sector or topic" aria-label="Sector or topic filter" />
              <Input value={geography} onChange={(event) => setGeography(event.target.value)} placeholder="Geography" aria-label="Geography filter" />
              <Input value={dateRange} onChange={(event) => setDateRange(event.target.value)} placeholder="Date range, e.g. last year" aria-label="Date range filter" />
              <Input value={relationshipFilter} onChange={(event) => setRelationshipFilter(event.target.value)} placeholder="Relationship filter" aria-label="Relationship filter" />
              <Select value={entityType} onChange={(event) => setEntityType(event.target.value)} aria-label="Entity type filter">
                {ENTITY_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
              <Select value={stage} onChange={(event) => setStage(event.target.value)} aria-label="Stage filter">
                <option value="">Any stage</option>
                <option value="pre-seed">Pre-seed</option>
                <option value="seed">Seed</option>
                <option value="Series A">Series A</option>
                <option value="growth">Growth</option>
              </Select>
              <Select value={strictness} onChange={(event) => setStrictness(event.target.value as typeof strictness)} aria-label="Match strictness">
                <option value="strict">Strict</option>
                <option value="balanced">Balanced</option>
                <option value="exploratory">Exploratory</option>
              </Select>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button onClick={interpretObjective} disabled={!contactsConnected || !query || loading !== "idle"} variant="outline">
              Review interpretation
            </Button>
            <Button onClick={searchNetwork} disabled={!contactsConnected || !query || loading !== "idle"}>
              Search network
            </Button>
            <Button onClick={researchSelected} disabled={!selectedResearchSubject || loading !== "idle"} variant="outline">
              Research selected
            </Button>
          </div>
          {!contactsConnected ? (
            <p className="text-xs leading-5 text-[hsl(39_32%_70%)]">Connect and sync Google Contacts, Gmail, or Calendar before searching your network.</p>
          ) : null}
          {researchNotice ? <p className="text-xs leading-5 text-[hsl(39_32%_70%)]">{researchNotice}</p> : null}
          {error ? <p className="border-y border-border py-3 text-xs leading-5 text-[hsl(39_32%_70%)]">{error}</p> : null}
        </div>
      </section>

      <details className="border-y border-border">
        <summary className="cursor-pointer list-none border-b border-border p-4">
          <p className="eyebrow mb-2">INTERPRETATION</p>
          <h2 className="text-sm font-semibold uppercase tracking-[0.08em]">Review before execution</h2>
        </summary>
        {interpretation ? (
          <div className="divide-y divide-border">
            <InterpretationRow label="Looking for" values={interpretation.entityTypes.map(titleCase)} />
            <InterpretationRow label="Roles" values={interpretation.roles} />
            <InterpretationRow label="Topics" values={interpretation.topics} />
            <InterpretationRow label="Geography" values={interpretation.geographies} />
            <InterpretationRow label="Companies" values={interpretation.companies} />
            <InterpretationRow label="Date range" values={interpretation.dateRange ? [interpretation.dateRange.preset] : []} />
            <InterpretationRow label="Relationship" values={interpretation.relationshipRequirements} />
            <InterpretationRow label="Sources" values={interpretation.sources} />
            <InterpretationRow label="Unavailable verification" values={interpretation.unavailableVerification} warning />
          </div>
        ) : (
          <div className="p-6 text-sm leading-6 text-muted-foreground">
            Review the parser output before searching. Empty criteria stay empty rather than being forced into an investment template.
          </div>
        )}
      </details>

      <section className="border-y border-border">
        <div className="grid gap-3 border-b border-border p-4 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <p className="eyebrow mb-2">RESULTS</p>
            <h2 className="text-sm font-semibold uppercase tracking-[0.08em]">Search results</h2>
          </div>
          {results ? (
            <p className="font-mono text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground">
              {results.results.length} results / {results.counts.candidates} candidates reviewed
            </p>
          ) : null}
        </div>
        {results?.results.length ? (
          <div className="divide-y divide-border">
            {results.results.map((result) => (
              <ResultRow
                key={result.id}
                result={result}
                selected={selectedResultId === result.id}
                onSelect={() => setSelectedResultId(result.id)}
              />
            ))}
          </div>
        ) : (
          <div className="p-6 text-sm leading-6 text-muted-foreground">
            {results ? (
              <div>
                <p className="font-semibold text-foreground">No sufficiently supported results matched this search.</p>
                <ul className="mt-3 space-y-2">
                  {results.emptyReasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              </div>
            ) : (
              "Run a search to inspect supported records from connected sources."
            )}
          </div>
        )}
      </section>

      {run ? (
        <section className="border-y border-border">
          <div className="border-b border-border p-4">
            <p className="eyebrow mb-2">RESEARCH RUN</p>
            <h2 className="text-sm font-semibold uppercase tracking-[0.08em]">{run.status}</h2>
          </div>
          <div className="space-y-4 p-4">
            {run.summary ? <p className="text-sm leading-6">{run.summary}</p> : null}
            {run.error ? <p className="text-sm leading-6 text-[hsl(39_32%_70%)]">{run.error}</p> : null}
            {run.claims?.length ? (
              <div className="divide-y divide-border border-y border-border">
                {run.claims.map((claim) => (
                  <div key={claim.id} className="px-4 py-3">
                    <p className="text-sm">{claim.text}</p>
                    <p className="mt-2 font-mono text-[0.68rem] uppercase tracking-[0.08em] text-muted-foreground">
                      {claim.provenance} / confidence {claim.confidence ?? "N/A"}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function InterpretationRow({ label, values, warning = false }: { label: string; values: string[]; warning?: boolean }) {
  return (
    <div className="grid gap-3 px-4 py-3 md:grid-cols-[180px_1fr]">
      <p className="eyebrow">{label}</p>
      <div className="flex flex-wrap gap-2">
        {values.length ? (
          values.map((value) => (
            <Badge key={value} variant={warning ? "warning" : "muted"}>
              {value}
            </Badge>
          ))
        ) : (
          <span className="text-sm text-muted-foreground">Not specified</span>
        )}
      </div>
    </div>
  );
}

function ResultRow({ result, selected, onSelect }: { result: SearchResult; selected: boolean; onSelect: () => void }) {
  const internalHref = result.href?.startsWith("/") ? result.href : null;
  const externalHref = result.href && !result.href.startsWith("/") ? result.href : null;
  return (
    <label className="grid cursor-pointer gap-4 px-4 py-5 transition-colors hover:text-primary xl:grid-cols-[32px_1fr_220px]">
      <input
        type="radio"
        name="selectedResult"
        checked={selected}
        onChange={onSelect}
        className="mt-1"
        aria-label={`Select ${result.title}`}
      />
      <span>
        <span className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{titleCase(result.entityType)}</Badge>
          <Badge variant={result.classification === "AUTOMATED_SENDER" || result.classification === "MAILING_LIST" ? "warning" : "muted"}>
            {titleCase(result.classification)}
          </Badge>
          <span className="font-mono text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground">
            score {result.score} / confidence {result.confidence}
          </span>
        </span>
        <span className="mt-3 block text-base font-semibold">{result.title}</span>
        {result.subtitle ? <span className="mt-1 block text-xs leading-5 text-muted-foreground">{result.subtitle}</span> : null}
        <span className="mt-3 block text-sm leading-6 text-muted-foreground">{result.whyMatched}</span>
        <span className="mt-4 grid gap-3 lg:grid-cols-3">
          <EvidenceList title="Evidence" items={result.evidence.filter((item) => item.state === "matched").slice(0, 4)} />
          <EvidenceList title="Missing" items={result.missingCriteria.slice(0, 4)} />
          <EvidenceList title="Unavailable" items={result.unavailableCriteria.slice(0, 4)} />
        </span>
        {result.classificationSignals.length ? (
          <span className="mt-4 flex flex-wrap gap-2">
            {result.classificationSignals.slice(0, 4).map((signal) => (
              <Badge key={signal} variant="muted">
                {signal}
              </Badge>
            ))}
          </span>
        ) : null}
      </span>
      <span className="space-y-2 xl:text-right">
        <span className="block font-mono text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground">
          {result.lastInteractionAt ? new Date(result.lastInteractionAt).toLocaleDateString() : "Date unavailable"}
        </span>
        {internalHref ? (
          <Link href={internalHref} className="block font-mono text-[0.68rem] uppercase tracking-[0.12em] underline underline-offset-4">
            Open
          </Link>
        ) : null}
        {externalHref ? (
          <a href={externalHref} target="_blank" rel="noreferrer" className="block font-mono text-[0.68rem] uppercase tracking-[0.12em] underline underline-offset-4">
            Open source
          </a>
        ) : null}
      </span>
    </label>
  );
}

function EvidenceList({ title, items }: { title: string; items: SearchEvidence[] }) {
  return (
    <span>
      <span className="eyebrow mb-2 block">{title}</span>
      {items.length ? (
        <span className="space-y-2">
          {items.map((item) => (
            <span key={`${title}-${item.criterion}-${item.label}-${item.value ?? ""}`} className="block text-xs leading-5 text-muted-foreground">
              {item.label}: {item.value ?? item.source}
            </span>
          ))}
        </span>
      ) : (
        <span className="text-xs text-muted-foreground">None</span>
      )}
    </span>
  );
}

function titleCase(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}
