"use client";

import { useMemo, useState } from "react";
import { CalendarCheck, Check, Copy, Loader2, Play, RefreshCw, RotateCcw, Send, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CandidateCard } from "./candidate-card";
import { SourcesPanel, type SourcePanelSource } from "./source-panel";
import { DEFAULT_SCORING_WEIGHTS } from "@/lib/domain/scoring";
import type { ScoringWeights } from "@/lib/domain/types";
import { formatTime } from "@/lib/utils";

const DEMO_QUERY =
  "Find early-stage AI infrastructure founders in the Bay Area who appear relevant to a technical seed fund and have a credible reason to speak with us now.";

type ResearchPayload = {
  run: {
    id: string;
    query: string;
    provider: string;
    status: string;
    summary: string;
    executionSteps: Array<{ label: string; status: "pending" | "running" | "complete" | "error"; summary: string }>;
  };
  candidates: Array<any>;
  sources: SourcePanelSource[];
};

type WorkflowState = {
  draft?: any;
  reply?: any;
  slots?: any[];
  meeting?: any;
  status: string;
};

export function ResearchConsole({ recentRuns }: { recentRuns: Array<{ id: string; query: string; provider: string; createdAt: Date }> }) {
  const [query, setQuery] = useState(DEMO_QUERY);
  const [filters, setFilters] = useState({
    stage: "Seed",
    sector: "AI Infrastructure",
    geography: "Bay Area",
    fundingDate: "Last 9 months",
    checkSize: "$500K-$2.5M",
    relationshipStrength: "Prefer warm paths",
  });
  const [weights, setWeights] = useState<ScoringWeights>(DEFAULT_SCORING_WEIGHTS);
  const [payload, setPayload] = useState<ResearchPayload | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | undefined>();
  const [selectedSourceId, setSelectedSourceId] = useState<string | undefined>();
  const [workflow, setWorkflow] = useState<WorkflowState>({ status: "Draft-only mode. No external sends." });
  const [loading, setLoading] = useState(false);
  const [steps, setSteps] = useState<ResearchPayload["run"]["executionSteps"]>([]);
  const [replyType, setReplyType] = useState("interested");

  const sourceNumberById = useMemo(() => {
    const map = new Map<string, number>();
    payload?.sources.forEach((source, index) => map.set(source.id, index + 1));
    return map;
  }, [payload]);

  const selectedCandidate = payload?.candidates.find((candidate) => candidate.contact.id === selectedCandidateId) ?? payload?.candidates[0];

  async function startResearch(prepared = false, queryOverride?: string) {
    const effectiveQuery = queryOverride ?? query;
    setLoading(true);
    setWorkflow({ status: "Research in progress. Outreach remains draft-only." });
    setPayload(null);
    setSteps([
      { label: "Parsing investment objective", status: "running", summary: "Normalizing partner intent." },
      { label: "Searching internal CRM", status: "pending", summary: "Waiting for parsed filters." },
      { label: "Researching public information through Hermes", status: "pending", summary: "Provider not called yet." },
      { label: "Deduplicating candidates", status: "pending", summary: "Waiting for sources." },
      { label: "Calculating thesis fit", status: "pending", summary: "Waiting for evidence." },
      { label: "Identifying warm introduction paths", status: "pending", summary: "Waiting for graph data." },
      { label: "Generating outreach drafts", status: prepared ? "pending" : "complete", summary: prepared ? "Will run after ranking." : "Manual step." },
    ]);
    await pause(350);
    setSteps((current) => current.map((step, index) => (index === 0 ? { ...step, status: "complete" } : index === 1 ? { ...step, status: "running" } : step)));

    const response = await fetch("/api/query", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: effectiveQuery, filters, weights }),
    });
    if (!response.ok) {
      setLoading(false);
      setSteps((current) => current.map((step) => (step.status === "running" ? { ...step, status: "error", summary: "API request failed." } : step)));
      return;
    }
    const result = (await response.json()) as ResearchPayload;
    setPayload(result);
    setSelectedCandidateId(result.candidates[0]?.contact.id);
    setSelectedSourceId(result.sources[0]?.id);
    setSteps(result.run.executionSteps);
    setLoading(false);
    setWorkflow({ status: "Ranked candidates returned. Draft outreach requires approval." });
    if (prepared && result.candidates[0]) {
      await runWorkflow(result, result.candidates[0].contact.id);
    }
  }

  async function runDemo() {
    setQuery(DEMO_QUERY);
    await startResearch(true, DEMO_QUERY);
  }

  async function resetDemo() {
    setLoading(true);
    await fetch("/api/demo/reset", { method: "POST" });
    setPayload(null);
    setSelectedCandidateId(undefined);
    setSelectedSourceId(undefined);
    setSteps([]);
    setWorkflow({ status: "Demo data reset. Ready to replay." });
    setLoading(false);
  }

  async function runWorkflow(currentPayload = payload, contactId = selectedCandidate?.contact.id) {
    if (!currentPayload || !contactId) return;
    setWorkflow({ status: "Generating approval-required outreach draft..." });
    const draftResponse = await fetch("/api/outreach/draft", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contactId, researchRunId: currentPayload.run.id, format: "email", tone: "thoughtful", version: "short" }),
    });
    const draftResult = await draftResponse.json();
    const rationaleParsed = draftResult.draft.rationaleParsed;
    setWorkflow({ status: "Draft created. Simulating partner approval...", draft: draftResult.draft });
    await pause(350);

    const approveResponse = await fetch("/api/outreach/approve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ draftId: draftResult.draft.id }),
    });
    const approveResult = await approveResponse.json();
    setWorkflow((state) => ({ ...state, status: "Approved by partner. Simulating send...", draft: { ...approveResult.draft, rationaleParsed } }));
    await pause(350);

    const sendResponse = await fetch("/api/outreach/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ draftId: draftResult.draft.id }),
    });
    const sendResult = await sendResponse.json();
    setWorkflow((state) => ({ ...state, status: "Simulated send complete. Ingesting positive reply...", draft: { ...sendResult.draft, rationaleParsed } }));
    await pause(350);

    const replyResponse = await fetch("/api/replies/ingest", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contactId, draftId: draftResult.draft.id, sampleType: "interested" }),
    });
    const replyResult = await replyResponse.json();
    setWorkflow((state) => ({ ...state, status: "Positive reply detected. Loading availability...", reply: replyResult.reply }));
    await pause(350);

    const slotsResponse = await fetch("/api/calendar/availability");
    const slotsResult = await slotsResponse.json();
    const slot = slotsResult.slots[0];
    setWorkflow((state) => ({ ...state, status: "Availability loaded. Holding the best slot...", slots: slotsResult.slots }));
    await pause(350);

    await fetch("/api/calendar/book", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slotId: slot.id, contactId }),
    });
    const meetingResponse = await fetch("/api/meetings/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contactId, partnerId: slot.partnerId, startTime: slot.startTime, endTime: slot.endTime }),
    });
    const meetingResult = await meetingResponse.json();
    await fetch("/api/crm/update", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contactId, status: "Meeting Booked", details: "Demo workflow completed after interested reply." }),
    });
    setWorkflow((state) => ({ ...state, status: "Meeting booked and CRM updated.", meeting: meetingResult.meeting }));
  }

  async function copyDraft() {
    if (!workflow.draft?.body) return;
    await navigator.clipboard.writeText(workflow.draft.body);
    setWorkflow((state) => ({ ...state, status: "Draft copied to clipboard." }));
  }

  async function ingestReply() {
    if (!selectedCandidate) return;
    const response = await fetch("/api/replies/ingest", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contactId: selectedCandidate.contact.id, draftId: workflow.draft?.id, sampleType: replyType }),
    });
    const result = await response.json();
    setWorkflow((state) => ({ ...state, status: `Reply classified as ${result.classification.classification}.`, reply: result.reply }));
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="space-y-5">
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <CardTitle>Partner Research Console</CardTitle>
                <CardDescription>Operational trace, structured intent, source-backed ranking, and approval-gated outreach.</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={runDemo} disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
                  Run Demo
                </Button>
                <Button variant="outline" onClick={resetDemo} disabled={loading}>
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  Reset
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Natural language research query" />
            <div className="grid gap-3 md:grid-cols-3">
              <Filter label="Stage" value={filters.stage} onChange={(stage) => setFilters((current) => ({ ...current, stage }))} options={["Seed", "Pre-seed", "Series A"]} />
              <Filter label="Sector" value={filters.sector} onChange={(sector) => setFilters((current) => ({ ...current, sector }))} options={["AI Infrastructure", "Model Observability", "Data Infrastructure", "AI Security", "Developer Tools"]} />
              <Filter label="Geography" value={filters.geography} onChange={(geography) => setFilters((current) => ({ ...current, geography }))} options={["Bay Area", "San Francisco", "Palo Alto", "Oakland"]} />
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <Input value={filters.fundingDate} onChange={(event) => setFilters((current) => ({ ...current, fundingDate: event.target.value }))} aria-label="Funding date filter" />
              <Input value={filters.checkSize} onChange={(event) => setFilters((current) => ({ ...current, checkSize: event.target.value }))} aria-label="Check size filter" />
              <Input value={filters.relationshipStrength} onChange={(event) => setFilters((current) => ({ ...current, relationshipStrength: event.target.value }))} aria-label="Relationship strength filter" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => startResearch(false)} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
                Start Research
              </Button>
              <Badge variant={payload?.run.provider === "hermes" ? "success" : "muted"}>{payload ? `Provider: ${payload.run.provider}` : "Provider: mock default"}</Badge>
              <Badge variant="outline">Draft-only by default</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Agent Execution Steps</CardTitle>
            <CardDescription>Operational status only; no hidden reasoning is exposed.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {(payload?.run.executionSteps ?? steps).map((step, index) => (
              <div key={`${step.label}-${index}`} className="rounded-md border border-border bg-white p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">{index + 1}. {step.label}</span>
                  <Badge variant={step.status === "complete" ? "success" : step.status === "running" ? "warning" : step.status === "error" ? "warning" : "muted"}>
                    {step.status}
                  </Badge>
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{step.summary}</p>
              </div>
            ))}
            {!steps.length && !payload ? (
              <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground md:col-span-2">
                Run a query to see staged execution.
              </div>
            ) : null}
          </CardContent>
        </Card>

        <ScoringPanel weights={weights} onChange={setWeights} />

        <section className="space-y-3" aria-label="Ranked candidates">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Ranked Candidates</h2>
              <p className="text-sm text-muted-foreground">Scores prioritize the fund workflow; they are not objective evaluations of founder quality.</p>
            </div>
            {payload ? <Badge variant="outline">{payload.candidates.length} results</Badge> : null}
          </div>
          {payload?.candidates.length ? (
            payload.candidates.map((candidate, index) => (
              <CandidateCard
                key={candidate.contact.id}
                candidate={candidate}
                rank={index + 1}
                selected={selectedCandidate?.contact.id === candidate.contact.id}
                sourceNumberById={sourceNumberById}
                onSelect={() => setSelectedCandidateId(candidate.contact.id)}
                onCitationClick={(sourceId) => {
                  setSelectedSourceId(sourceId);
                  document.getElementById(`source-${sourceId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
              />
            ))
          ) : (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">No candidates yet. Run the prepared scenario or enter a partner request.</CardContent>
            </Card>
          )}
        </section>
      </div>

      <aside className="space-y-5">
        <SavedSearches recentRuns={recentRuns} onPick={setQuery} />
        <WorkflowPanel
          selectedCandidateName={selectedCandidate?.contact.fullName}
          workflow={workflow}
          onRun={() => runWorkflow()}
          onCopy={copyDraft}
          replyType={replyType}
          onReplyTypeChange={setReplyType}
          onIngestReply={ingestReply}
          disabled={!selectedCandidate || !payload}
        />
        <SourcesPanel sources={payload?.sources ?? []} selectedSourceId={selectedSourceId} onSelectSource={setSelectedSourceId} />
      </aside>
    </div>
  );
}

function Filter({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="space-y-1 text-xs font-medium text-muted-foreground">
      <span>{label}</span>
      <Select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </Select>
    </label>
  );
}

function ScoringPanel({ weights, onChange }: { weights: ScoringWeights; onChange: (weights: ScoringWeights) => void }) {
  const entries = [
    ["thesisMatch", "Thesis match"],
    ["stageFit", "Stage/check size"],
    ["geographyFit", "Geographic fit"],
    ["momentum", "Momentum"],
    ["relationship", "Relationship"],
    ["evidence", "Evidence quality"],
  ] as const;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          Scoring Weights
        </CardTitle>
        <CardDescription>Overall Fit = 30% thesis, 20% stage/check, 15% geography, 15% momentum, 10% relationship, 10% evidence by default.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2">
        {entries.map(([key, label]) => (
          <label key={key} className="rounded-md border border-border bg-white p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span>{label}</span>
              <span className="font-mono text-xs">{weights[key]}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={50}
              value={weights[key]}
              onChange={(event) => onChange({ ...weights, [key]: Number(event.target.value) })}
              className="mt-3 w-full accent-emerald-800"
            />
          </label>
        ))}
      </CardContent>
    </Card>
  );
}

function SavedSearches({ recentRuns, onPick }: { recentRuns: Array<{ id: string; query: string; provider: string }>; onPick: (query: string) => void }) {
  const searches = [DEMO_QUERY, "Find AI security founders with warm paths and recent financing.", ...recentRuns.map((run) => run.query)].slice(0, 5);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Saved Searches</CardTitle>
        <CardDescription>Reusable partner requests.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {Array.from(new Set(searches)).map((search) => (
          <button
            key={search}
            type="button"
            onClick={() => onPick(search)}
            className="w-full rounded-md border border-border bg-white p-3 text-left text-xs leading-5 hover:bg-accent"
          >
            {search}
          </button>
        ))}
      </CardContent>
    </Card>
  );
}

function WorkflowPanel({
  selectedCandidateName,
  workflow,
  onRun,
  onCopy,
  replyType,
  onReplyTypeChange,
  onIngestReply,
  disabled,
}: {
  selectedCandidateName?: string;
  workflow: WorkflowState;
  onRun: () => void;
  onCopy: () => void;
  replyType: string;
  onReplyTypeChange: (value: string) => void;
  onIngestReply: () => void;
  disabled?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Outreach and Scheduling</CardTitle>
        <CardDescription>{selectedCandidateName ? `Selected: ${selectedCandidateName}` : "Select a candidate after ranking."}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border border-border bg-muted p-3 text-sm">{workflow.status}</div>
        <Button className="w-full" onClick={onRun} disabled={disabled}>
          <Send className="h-4 w-4" aria-hidden="true" />
          Generate, Approve, Send, Book
        </Button>
        {workflow.draft ? (
          <div className="space-y-3 rounded-md border border-border bg-white p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold">{workflow.draft.subject}</div>
              <Badge variant={workflow.draft.status === "Sent" ? "success" : workflow.draft.status === "Approved" ? "warning" : "muted"}>{workflow.draft.status}</Badge>
            </div>
            <Textarea value={workflow.draft.body} readOnly aria-label="Generated outreach draft" />
            <Button variant="outline" size="sm" onClick={onCopy}>
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              Copy
            </Button>
            <div className="rounded-md bg-muted p-3 text-xs leading-5">
              <div className="font-semibold">Why this was personalized</div>
              {workflow.draft.rationaleParsed?.claims?.map((claim: any) => (
                <div key={`${claim.sourceId}-${claim.claim}`} className="mt-1">
                  {claim.claim} <span className="text-muted-foreground">({claim.origin}, {claim.sourceType})</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <Select value={replyType} onChange={(event) => onReplyTypeChange(event.target.value)} aria-label="Sample reply type">
            <option value="interested">Interested</option>
            <option value="not_interested">Not interested</option>
            <option value="follow_up_later">Follow up later</option>
            <option value="introduction_request">Introduction request</option>
            <option value="wrong_person">Wrong person</option>
            <option value="ambiguous">Ambiguous</option>
          </Select>
          <Button variant="outline" onClick={onIngestReply} disabled={disabled}>
            <Check className="h-4 w-4" aria-hidden="true" />
            Classify
          </Button>
        </div>
        {workflow.reply ? (
          <div className="rounded-md border border-border bg-white p-3 text-xs leading-5">
            <div className="font-semibold">Latest reply</div>
            <p className="mt-1 text-muted-foreground">{workflow.reply.body}</p>
            <Badge className="mt-2" variant={workflow.reply.requiresHumanReview ? "warning" : "success"}>
              {workflow.reply.classification}
            </Badge>
          </div>
        ) : null}
        {workflow.slots?.length ? (
          <div className="space-y-2">
            <div className="text-sm font-semibold">Proposed slots</div>
            {workflow.slots.slice(0, 3).map((slot) => (
              <div key={slot.id} className="rounded-md border border-border bg-white p-3 text-xs">
                <div className="font-medium">{formatTime(slot.startTime)}</div>
                <div className="mt-1 text-muted-foreground">{slot.partner.name} - {slot.label}</div>
              </div>
            ))}
          </div>
        ) : null}
        {workflow.meeting ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">
            <div className="flex items-center gap-2 font-semibold">
              <CalendarCheck className="h-4 w-4" aria-hidden="true" />
              Meeting booked
            </div>
            <a className="mt-1 block break-all text-xs underline" href={workflow.meeting.meetingUrl} target="_blank" rel="noreferrer">
              {workflow.meeting.meetingUrl}
            </a>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function pause(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
