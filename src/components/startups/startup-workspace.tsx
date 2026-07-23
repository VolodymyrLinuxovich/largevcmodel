"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type StartupDto = {
  id: string;
  name: string;
  website?: string | null;
  logoUrl?: string | null;
  oneLineDescription?: string | null;
  description?: string | null;
  industry?: string | null;
  subIndustries: string[];
  product?: string | null;
  problem?: string | null;
  solution?: string | null;
  targetCustomers?: string | null;
  customerSegments: string[];
  businessModel?: string | null;
  revenueModel?: string | null;
  fundingStage?: string | null;
  fundingTarget?: number | null;
  minCheckSize?: number | null;
  maxCheckSize?: number | null;
  headquarters?: string | null;
  targetGeographies: string[];
  traction?: string | null;
  revenue?: string | null;
  customerCount?: number | null;
  pilots?: string | null;
  partnerships?: string | null;
  team?: string | null;
  founderBackgrounds?: string | null;
  keywords: string[];
  technologies: string[];
  moat?: string | null;
  competitors: string[];
  preferredInvestorTypes: string[];
  excludedInvestors: string[];
  excludedOrganizations: string[];
  fundraisingStatus?: string | null;
  fundraisingTimeline?: string | null;
  customNotes?: string | null;
  searchCriteria?: Record<string, unknown> | null;
  profileCompleteness: number;
  updatedAt: string;
  pitchDeck?: PitchDeckDto | null;
  savedLists: Array<{ id: string; name: string; count: number }>;
};

type PitchDeckDto = {
  id: string;
  filename: string;
  fileSize: number;
  uploadedAt: string;
  extractionStatus: string;
  extractionConfidence?: number | null;
  extractionWarnings: string[];
  lastProcessedAt?: string | null;
  extraction?: {
    id: string;
    status: string;
    extractionConfidence?: number | null;
    fields: Array<{ id: string; fieldKey: string; extractedValue?: string | null; currentValue?: string | null; confidence?: number | null; sourcePage?: number | null; status: string }>;
  } | null;
};

type FormState = Partial<Omit<StartupDto, "updatedAt" | "pitchDeck" | "savedLists" | "profileCompleteness">> & {
  id?: string;
  name: string;
  subIndustries: string[];
  customerSegments: string[];
  targetGeographies: string[];
  keywords: string[];
  technologies: string[];
  competitors: string[];
  preferredInvestorTypes: string[];
  excludedInvestors: string[];
  excludedOrganizations: string[];
};

const emptyForm: FormState = {
  name: "",
  subIndustries: [],
  customerSegments: [],
  targetGeographies: [],
  keywords: [],
  technologies: [],
  competitors: [],
  preferredInvestorTypes: [],
  excludedInvestors: [],
  excludedOrganizations: [],
};

const sections = [
  "Overview",
  "Product",
  "Market",
  "Traction",
  "Fundraising",
  "Team",
  "Pitch Deck",
  "Search Criteria",
  "Saved People",
];

export function StartupWorkspace({ startups }: { startups: StartupDto[] }) {
  const [selectedId, setSelectedId] = useState(startups[0]?.id ?? "new");
  const selected = startups.find((startup) => startup.id === selectedId);
  const [form, setForm] = useState<FormState>(() => (selected ? toForm(selected) : emptyForm));
  const [deck, setDeck] = useState<PitchDeckDto | null>(selected?.pitchDeck ?? null);
  const [activeSection, setActiveSection] = useState(sections[0]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function selectStartup(id: string) {
    setSelectedId(id);
    const next = startups.find((startup) => startup.id === id);
    setForm(next ? toForm(next) : emptyForm);
    setDeck(next?.pitchDeck ?? null);
    setStatus(null);
    setError(null);
  }

  async function saveProfile() {
    setStatus(null);
    setError(null);
    startTransition(async () => {
      try {
        const response = await fetch("/api/startups", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(form),
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Startup profile save failed.");
        setForm(toForm(body.startup));
        setSelectedId(body.startup.id);
        setStatus("Startup profile saved.");
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : "Startup profile save failed.");
      }
    });
  }

  async function uploadDeck(file: File) {
    if (!form.id) {
      setError("Save the startup profile before uploading a pitch deck.");
      return;
    }
    setStatus("Uploading pitch deck...");
    setError(null);
    const payload = new FormData();
    payload.set("file", file);
    const response = await fetch(`/api/startups/${form.id}/pitch-deck`, { method: "POST", body: payload });
    const body = await response.json();
    if (!response.ok) {
      setError(body.error ?? "Pitch deck upload failed.");
      setStatus(null);
      return;
    }
    setDeck({ ...body.deck, uploadedAt: new Date().toISOString(), extractionWarnings: [] });
    setStatus("Pitch deck uploaded.");
  }

  async function refreshDeck() {
    if (!form.id) return;
    const response = await fetch(`/api/startups/${form.id}/pitch-deck`);
    const body = await response.json();
    if (response.ok) setDeck(body.deck);
  }

  async function runExtraction() {
    if (!form.id) return;
    setStatus("Parsing pitch deck...");
    setError(null);
    const response = await fetch(`/api/startups/${form.id}/pitch-deck/extract`, { method: "POST" });
    const body = await response.json();
    if (!response.ok) {
      setError(body.error ?? "Pitch deck extraction failed.");
      setStatus(null);
      return;
    }
    setStatus("Extraction ready for review.");
    await refreshDeck();
  }

  async function approveAllPending() {
    const extraction = deck?.extraction;
    if (!form.id || !extraction) return;
    const fields = extraction.fields
      .filter((field) => field.status === "PENDING")
      .map((field) => ({ fieldId: field.id, action: "accept" as const }));
    if (!fields.length) return;
    const response = await fetch(`/api/startups/${form.id}/pitch-deck/merge`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ extractionId: extraction.id, fields }),
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.error ?? "Extraction approval failed.");
      return;
    }
    setForm(toForm(body.startup));
    setStatus("Approved extracted fields and updated the startup profile.");
    await refreshDeck();
  }

  const sectionBody = useMemo(() => {
    switch (activeSection) {
      case "Product":
        return (
          <FieldGroup>
            <Field label="Product"><Textarea value={form.product ?? ""} onChange={(event) => update("product", event.target.value)} /></Field>
            <Field label="Problem"><Textarea value={form.problem ?? ""} onChange={(event) => update("problem", event.target.value)} /></Field>
            <Field label="Solution"><Textarea value={form.solution ?? ""} onChange={(event) => update("solution", event.target.value)} /></Field>
            <Field label="Technologies"><Input value={join(form.technologies)} onChange={(event) => updateArray("technologies", event.target.value)} /></Field>
            <Field label="Moat"><Textarea value={form.moat ?? ""} onChange={(event) => update("moat", event.target.value)} /></Field>
          </FieldGroup>
        );
      case "Market":
        return (
          <FieldGroup>
            <Field label="Industry"><Input value={form.industry ?? ""} onChange={(event) => update("industry", event.target.value)} /></Field>
            <Field label="Sub-industries"><Input value={join(form.subIndustries)} onChange={(event) => updateArray("subIndustries", event.target.value)} /></Field>
            <Field label="Target customers"><Textarea value={form.targetCustomers ?? ""} onChange={(event) => update("targetCustomers", event.target.value)} /></Field>
            <Field label="Customer segments"><Input value={join(form.customerSegments)} onChange={(event) => updateArray("customerSegments", event.target.value)} /></Field>
            <Field label="Target geographies"><Input value={join(form.targetGeographies)} onChange={(event) => updateArray("targetGeographies", event.target.value)} /></Field>
            <Field label="Competitors"><Input value={join(form.competitors)} onChange={(event) => updateArray("competitors", event.target.value)} /></Field>
          </FieldGroup>
        );
      case "Traction":
        return (
          <FieldGroup>
            <Field label="Traction"><Textarea value={form.traction ?? ""} onChange={(event) => update("traction", event.target.value)} /></Field>
            <Field label="Revenue"><Input value={form.revenue ?? ""} onChange={(event) => update("revenue", event.target.value)} /></Field>
            <Field label="Customer count"><Input type="number" value={form.customerCount ?? ""} onChange={(event) => updateNumber("customerCount", event.target.value)} /></Field>
            <Field label="Pilots"><Textarea value={form.pilots ?? ""} onChange={(event) => update("pilots", event.target.value)} /></Field>
            <Field label="Partnerships"><Textarea value={form.partnerships ?? ""} onChange={(event) => update("partnerships", event.target.value)} /></Field>
          </FieldGroup>
        );
      case "Fundraising":
        return (
          <FieldGroup>
            <Field label="Funding stage"><Input value={form.fundingStage ?? ""} onChange={(event) => update("fundingStage", event.target.value)} /></Field>
            <Field label="Funding target"><Input type="number" value={form.fundingTarget ?? ""} onChange={(event) => updateNumber("fundingTarget", event.target.value)} /></Field>
            <Field label="Minimum check size"><Input type="number" value={form.minCheckSize ?? ""} onChange={(event) => updateNumber("minCheckSize", event.target.value)} /></Field>
            <Field label="Maximum check size"><Input type="number" value={form.maxCheckSize ?? ""} onChange={(event) => updateNumber("maxCheckSize", event.target.value)} /></Field>
            <Field label="Fundraising status"><Textarea value={form.fundraisingStatus ?? ""} onChange={(event) => update("fundraisingStatus", event.target.value)} /></Field>
            <Field label="Timeline"><Input value={form.fundraisingTimeline ?? ""} onChange={(event) => update("fundraisingTimeline", event.target.value)} /></Field>
          </FieldGroup>
        );
      case "Team":
        return (
          <FieldGroup>
            <Field label="Team"><Textarea value={form.team ?? ""} onChange={(event) => update("team", event.target.value)} /></Field>
            <Field label="Founder backgrounds"><Textarea value={form.founderBackgrounds ?? ""} onChange={(event) => update("founderBackgrounds", event.target.value)} /></Field>
            <Field label="Headquarters"><Input value={form.headquarters ?? ""} onChange={(event) => update("headquarters", event.target.value)} /></Field>
          </FieldGroup>
        );
      case "Pitch Deck":
        return (
          <div className="space-y-6">
            <div className="border-y border-border py-5">
              {deck ? (
                <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
                  <div>
                    <p className="text-sm font-medium">{deck.filename}</p>
                    <p className="mt-2 font-mono text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground">
                      {deck.extractionStatus} / {(deck.fileSize / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    <Button asChild variant="outline" size="sm"><Link href={`/api/startups/${form.id}/pitch-deck/file`} target="_blank">Open deck</Link></Button>
                    <Button type="button" variant="outline" size="sm" onClick={runExtraction}>Rerun extraction</Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No pitch deck is uploaded for this startup profile.</p>
              )}
              <label className="mt-5 block border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground transition-colors hover:border-primary hover:text-foreground">
                Upload or replace PDF pitch deck
                <input type="file" accept="application/pdf" className="sr-only" onChange={(event) => event.target.files?.[0] && uploadDeck(event.target.files[0])} />
              </label>
            </div>
            {deck?.extraction?.fields.length ? (
              <div className="divide-y divide-border border-y border-border">
                <div className="grid gap-3 py-4 md:grid-cols-[180px_1fr_1fr_100px]">
                  <p className="eyebrow">Field</p>
                  <p className="eyebrow">Extracted</p>
                  <p className="eyebrow">Current</p>
                  <p className="eyebrow">Confidence</p>
                </div>
                {deck.extraction.fields.map((field) => (
                  <div key={field.id} className="grid gap-3 py-4 text-sm md:grid-cols-[180px_1fr_1fr_100px]">
                    <p className="font-medium">{labelize(field.fieldKey)}</p>
                    <p className="text-muted-foreground">{field.extractedValue || "Empty"}</p>
                    <p className="text-muted-foreground">{field.currentValue || "Empty"}</p>
                    <p className="font-mono text-xs text-muted-foreground">{field.confidence ?? "N/A"}</p>
                  </div>
                ))}
                <div className="py-4">
                  <Button type="button" onClick={approveAllPending}>Approve pending extracted fields</Button>
                </div>
              </div>
            ) : null}
          </div>
        );
      case "Search Criteria":
        return (
          <FieldGroup>
            <Field label="Preferred investor types"><Input value={join(form.preferredInvestorTypes)} onChange={(event) => updateArray("preferredInvestorTypes", event.target.value)} /></Field>
            <Field label="Keywords"><Input value={join(form.keywords)} onChange={(event) => updateArray("keywords", event.target.value)} /></Field>
            <Field label="Excluded investors"><Input value={join(form.excludedInvestors)} onChange={(event) => updateArray("excludedInvestors", event.target.value)} /></Field>
            <Field label="Excluded organizations"><Input value={join(form.excludedOrganizations)} onChange={(event) => updateArray("excludedOrganizations", event.target.value)} /></Field>
            <Field label="Custom notes"><Textarea value={form.customNotes ?? ""} onChange={(event) => update("customNotes", event.target.value)} /></Field>
          </FieldGroup>
        );
      case "Saved People":
        return selected?.savedLists.length ? (
          <div className="divide-y divide-border border-y border-border">
            {selected.savedLists.map((list) => (
              <div key={list.id} className="grid gap-3 py-4 md:grid-cols-[1fr_auto]">
                <p className="text-sm font-medium">{list.name}</p>
                <p className="font-mono text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground">{list.count} saved</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="border-y border-dashed border-border py-8 text-sm text-muted-foreground">People saved from search results will appear here.</p>
        );
      default:
        return (
          <FieldGroup>
            <Field label="Company name"><Input value={form.name} onChange={(event) => update("name", event.target.value)} required /></Field>
            <Field label="Website"><Input value={form.website ?? ""} onChange={(event) => update("website", event.target.value)} /></Field>
            <Field label="Logo URL"><Input value={form.logoUrl ?? ""} onChange={(event) => update("logoUrl", event.target.value)} /></Field>
            <Field label="One-line description"><Input value={form.oneLineDescription ?? ""} onChange={(event) => update("oneLineDescription", event.target.value)} /></Field>
            <Field label="Full description"><Textarea value={form.description ?? ""} onChange={(event) => update("description", event.target.value)} /></Field>
            <Field label="Business model"><Input value={form.businessModel ?? ""} onChange={(event) => update("businessModel", event.target.value)} /></Field>
            <Field label="Revenue model"><Input value={form.revenueModel ?? ""} onChange={(event) => update("revenueModel", event.target.value)} /></Field>
          </FieldGroup>
        );
    }
  }, [activeSection, deck, form, selected]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value || undefined }));
  }
  function updateArray(key: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [key]: split(value) }));
  }
  function updateNumber(key: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [key]: value === "" ? null : Number(value) }));
  }

  return (
    <div className="space-y-10">
      <div className="grid gap-4 border-y border-border py-5 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <p className="eyebrow">Startup profile</p>
          <h2 className="mt-3 text-2xl font-medium sm:text-4xl">{form.name || "Create startup profile"}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
            Build the structured company context used for external people discovery, pitch-deck extraction, fit scoring, and saved people lists.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          <select className="h-10 border border-border bg-transparent px-3 text-xs uppercase tracking-[0.08em]" value={selectedId} onChange={(event) => selectStartup(event.target.value)}>
            {startups.map((startup) => <option key={startup.id} value={startup.id}>{startup.name}</option>)}
            <option value="new">New startup</option>
          </select>
          <Button type="button" onClick={saveProfile} disabled={isPending || !form.name.trim()}>{isPending ? "Saving..." : "Save profile"}</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">{selected?.profileCompleteness ?? 0}% complete</Badge>
        <Badge variant="muted">{deck?.extractionStatus ?? "No deck"}</Badge>
        {selected?.updatedAt ? <Badge variant="muted">Updated {new Date(selected.updatedAt).toLocaleDateString()}</Badge> : null}
      </div>
      {status ? <p className="border-y border-border py-3 text-sm text-muted-foreground">{status}</p> : null}
      {error ? <p className="border-y border-border py-3 text-sm text-[hsl(39_42%_68%)]">{error}</p> : null}

      <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
        <nav className="lg:sticky lg:top-24 lg:self-start">
          <div className="divide-y divide-border border-y border-border">
            {sections.map((section) => (
              <button
                key={section}
                type="button"
                onClick={() => setActiveSection(section)}
                className={`block w-full px-0 py-3 text-left text-[0.68rem] uppercase tracking-[0.14em] transition-colors ${activeSection === section ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {section}
              </button>
            ))}
          </div>
        </nav>
        <section>
          <p className="eyebrow">{activeSection}</p>
          <div className="mt-6">{sectionBody}</div>
        </section>
      </div>
    </div>
  );
}

function FieldGroup({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-5">{children}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-3 border-b border-border pb-5 md:grid-cols-[220px_1fr] md:items-start">
      <span className="eyebrow pt-3">{label}</span>
      <span>{children}</span>
    </label>
  );
}

function toForm(startup: Partial<StartupDto>): FormState {
  return {
    ...emptyForm,
    ...startup,
    ...(startup.id ? { id: startup.id } : {}),
    name: startup.name ?? "",
    subIndustries: startup.subIndustries ?? [],
    customerSegments: startup.customerSegments ?? [],
    targetGeographies: startup.targetGeographies ?? [],
    keywords: startup.keywords ?? [],
    technologies: startup.technologies ?? [],
    competitors: startup.competitors ?? [],
    preferredInvestorTypes: startup.preferredInvestorTypes ?? [],
    excludedInvestors: startup.excludedInvestors ?? [],
    excludedOrganizations: startup.excludedOrganizations ?? [],
  };
}

function split(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function join(value?: string[]) {
  return (value ?? []).join(", ");
}

function labelize(value: string) {
  return value.replace(/([A-Z])/g, " $1").replace(/^./, (match) => match.toUpperCase());
}
