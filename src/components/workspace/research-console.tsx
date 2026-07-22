"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

type SearchContact = {
  id: string;
  fullName: string | null;
  primaryEmail: string | null;
  organization: string | null;
  title: string | null;
  relationshipStrength: number | null;
  interactionCount: number;
};

type SearchResponse = {
  intent: {
    sectors: string[];
    stages: string[];
    geographies: string[];
    minimumRelationshipStrength?: number;
  };
  contacts: SearchContact[];
};

type ResearchRun = {
  id: string;
  query: string;
  provider: string;
  status: string;
  summary?: string | null;
  error?: string | null;
  createdAt?: string | Date;
  claims?: Array<{ id: string; text: string; provenance: string; confidence?: number | null }>;
};

export function ResearchConsole({
  provider,
  providerConfigured,
  contactsConnected,
}: {
  provider: string;
  providerConfigured: boolean;
  contactsConnected: boolean;
}) {
  const [query, setQuery] = useState("");
  const [stage, setStage] = useState("");
  const [sector, setSector] = useState("");
  const [geography, setGeography] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [run, setRun] = useState<ResearchRun | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function searchNetwork() {
    setLoading(true);
    setError(null);
    setRun(null);
    try {
      const response = await fetch("/api/query", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query, stage: stage || undefined, sector: sector || undefined, geography: geography || undefined }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Search failed");
      setResults(payload);
      setSelectedContactId(payload.contacts?.[0]?.id ?? null);
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  async function researchSelectedContact() {
    if (!selectedContactId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/research", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contactId: selectedContactId, query: query || "Research this contact and associated company." }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Research failed");
      setRun(payload.run);
    } catch (researchError) {
      setError(researchError instanceof Error ? researchError.message : "Research failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
      <section className="border border-border">
        <div className="border-b border-border p-4">
          <p className="eyebrow mb-2">COMMAND</p>
          <h2 className="text-sm font-semibold uppercase tracking-[0.08em]">Research objective</h2>
        </div>
        <div className="space-y-4 p-4">
          <Textarea
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search real contacts and companies from connected accounts..."
            aria-label="Natural language research query"
          />
          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <Input value={sector} onChange={(event) => setSector(event.target.value)} placeholder="Sector filter" aria-label="Sector filter" />
            <Input value={geography} onChange={(event) => setGeography(event.target.value)} placeholder="Geography filter" aria-label="Geography filter" />
            <Select value={stage} onChange={(event) => setStage(event.target.value)} aria-label="Stage filter">
              <option value="">Any stage</option>
              <option value="Pre-seed">Pre-seed</option>
              <option value="Seed">Seed</option>
              <option value="Series A">Series A</option>
              <option value="Growth">Growth</option>
            </Select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={searchNetwork} disabled={!contactsConnected || !query || loading}>
              Search network
            </Button>
            <Button onClick={researchSelectedContact} disabled={!providerConfigured || !selectedContactId || loading} variant="outline">
              Research selected
            </Button>
          </div>
          {!contactsConnected ? (
            <p className="text-xs leading-5 text-[hsl(39_32%_70%)]">Connect Google Contacts or Gmail before searching your network.</p>
          ) : null}
          {!providerConfigured ? (
            <p className="text-xs leading-5 text-[hsl(39_32%_70%)]">Research provider is {provider}. Configure Hermes before public-source research.</p>
          ) : null}
          {error ? <p className="border border-border p-3 text-xs leading-5 text-[hsl(39_32%_70%)]">{error}</p> : null}
        </div>
      </section>

      <section className="border border-border">
        <div className="border-b border-border p-4">
          <p className="eyebrow mb-2">AGENT TRACE</p>
          <h2 className="text-sm font-semibold uppercase tracking-[0.08em]">Operational status</h2>
        </div>
        <div className="grid divide-y divide-border">
          {[
            ["Parsing investment objective", results ? "complete" : loading ? "running" : "waiting"],
            ["Searching connected account records", results ? "complete" : "waiting"],
            ["Researching public information through provider", run ? run.status.toLowerCase() : "waiting"],
            ["Preserving claims and citations", run?.claims?.length ? "complete" : "waiting"],
            ["Calculating thesis fit", "available from contact profile scoring"],
          ].map(([step, status]) => (
            <div key={step} className="grid gap-3 px-4 py-3 md:grid-cols-[1fr_160px]">
              <p className="text-sm">{step}</p>
              <Badge variant={status === "complete" ? "success" : status === "running" ? "warning" : "muted"}>{status}</Badge>
            </div>
          ))}
        </div>
      </section>

      <section className="border border-border xl:col-span-2">
        <div className="border-b border-border p-4">
          <p className="eyebrow mb-2">RESULTS</p>
          <h2 className="text-sm font-semibold uppercase tracking-[0.08em]">Candidate records</h2>
        </div>
        {results?.contacts.length ? (
          <div className="divide-y divide-border">
            {results.contacts.map((contact) => (
              <label key={contact.id} className="grid cursor-pointer gap-3 px-4 py-4 hover:bg-muted md:grid-cols-[32px_1fr_180px_120px]">
                <input
                  type="radio"
                  name="selectedContact"
                  checked={selectedContactId === contact.id}
                  onChange={() => setSelectedContactId(contact.id)}
                  className="mt-1"
                  aria-label={`Select ${contact.fullName ?? contact.primaryEmail ?? "contact"}`}
                />
                <span>
                  <span className="block text-sm font-semibold">{contact.fullName ?? contact.primaryEmail ?? "Unnamed contact"}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {[contact.title, contact.organization].filter(Boolean).join(" / ") || "Role unavailable"}
                  </span>
                </span>
                <span className="font-mono text-[0.7rem] uppercase tracking-[0.08em] text-muted-foreground">
                  {contact.interactionCount} interactions
                </span>
                <Link href={`/contacts/${contact.id}`} className="font-mono text-[0.7rem] uppercase tracking-[0.08em] underline">
                  Open profile
                </Link>
              </label>
            ))}
          </div>
        ) : (
          <div className="p-6 text-sm leading-6 text-muted-foreground">
            {results ? "No results found in connected account data." : "Run a search to inspect real contacts from connected sources."}
          </div>
        )}
      </section>

      {run ? (
        <section className="border border-border xl:col-span-2">
          <div className="border-b border-border p-4">
            <p className="eyebrow mb-2">RESEARCH RUN</p>
            <h2 className="text-sm font-semibold uppercase tracking-[0.08em]">{run.status}</h2>
          </div>
          <div className="space-y-4 p-4">
            {run.summary ? <p className="text-sm leading-6">{run.summary}</p> : null}
            {run.error ? <p className="text-sm leading-6 text-[hsl(39_32%_70%)]">{run.error}</p> : null}
            {run.claims?.length ? (
              <div className="divide-y divide-border border border-border">
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
