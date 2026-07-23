"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  growthMetrics?: Record<string, unknown> | null;
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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [completion, setCompletion] = useState(selected?.profileCompleteness ?? 0);
  const [isSaving, setIsSaving] = useState(false);
  const lastSavedPayloadRef = useRef(selected ? JSON.stringify(normalizeProfileForm(toForm(selected))) : "");
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function selectStartup(id: string) {
    setSelectedId(id);
    const next = startups.find((startup) => startup.id === id);
    const nextForm = next ? toForm(next) : emptyForm;
    setForm(nextForm);
    setDeck(next?.pitchDeck ?? null);
    setCompletion(next?.profileCompleteness ?? 0);
    setStatus(null);
    setError(null);
    setFieldErrors({});
    lastSavedPayloadRef.current = next ? JSON.stringify(normalizeProfileForm(nextForm)) : "";
  }

  async function saveProfile() {
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    await performSave();
  }

  async function performSave() {
    setStatus(null);
    setError(null);
    setIsSaving(true);
    try {
      const payload = normalizeProfileForm(form);
      const response = await fetch("/api/startups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) {
        const fields = isFieldErrorResponse(body) ? body.fields : {};
        setFieldErrors(fields);
        throw new Error(firstFieldError(fields) ?? body.message ?? body.error ?? "Startup profile save failed.");
      }
      const savedForm = toForm(body.startup);
      setForm(savedForm);
      setSelectedId(body.startup.id);
      setCompletion(body.startup.profileCompleteness ?? 0);
      setFieldErrors({});
      lastSavedPayloadRef.current = JSON.stringify(normalizeProfileForm(savedForm));
      setStatus("Saved");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Startup profile save failed.");
    } finally {
      setIsSaving(false);
    }
  }

  useEffect(() => {
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    const normalized = normalizeProfileForm(form);
    if (!normalized.name.trim()) {
      setStatus(null);
      return;
    }
    const payload = JSON.stringify(normalized);
    if (payload === lastSavedPayloadRef.current || isSaving) return;
    setStatus("Saving...");
    autosaveTimerRef.current = setTimeout(() => {
      void performSave();
    }, 900);
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [form, isSaving]);

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
            <Field label="Product" error={fieldErrors.product}><Textarea value={form.product ?? ""} onChange={(event) => update("product", event.target.value)} /></Field>
            <Field label="Problem" error={fieldErrors.problem}><Textarea value={form.problem ?? ""} onChange={(event) => update("problem", event.target.value)} /></Field>
            <Field label="Solution" error={fieldErrors.solution}><Textarea value={form.solution ?? ""} onChange={(event) => update("solution", event.target.value)} /></Field>
            <Field label="Technologies" error={fieldErrors.technologies}><Input value={join(form.technologies)} onChange={(event) => updateArray("technologies", event.target.value)} /></Field>
            <Field label="Moat" error={fieldErrors.moat}><Textarea value={form.moat ?? ""} onChange={(event) => update("moat", event.target.value)} /></Field>
          </FieldGroup>
        );
      case "Market":
        return (
          <FieldGroup>
            <Field label="Industry" error={fieldErrors.industry}><Input value={form.industry ?? ""} onChange={(event) => update("industry", event.target.value)} /></Field>
            <Field label="Sub-industries" error={fieldErrors.subIndustries}><Input value={join(form.subIndustries)} onChange={(event) => updateArray("subIndustries", event.target.value)} /></Field>
            <Field label="Target customers" error={fieldErrors.targetCustomers}><Textarea value={form.targetCustomers ?? ""} onChange={(event) => update("targetCustomers", event.target.value)} /></Field>
            <Field label="Customer segments" error={fieldErrors.customerSegments}><Input value={join(form.customerSegments)} onChange={(event) => updateArray("customerSegments", event.target.value)} /></Field>
            <Field label="Target geographies" error={fieldErrors.targetGeographies}><Input value={join(form.targetGeographies)} onChange={(event) => updateArray("targetGeographies", event.target.value)} /></Field>
            <Field label="Competitors" error={fieldErrors.competitors}><Input value={join(form.competitors)} onChange={(event) => updateArray("competitors", event.target.value)} /></Field>
          </FieldGroup>
        );
      case "Traction":
        return (
          <FieldGroup>
            <Field label="Traction" error={fieldErrors.traction}><Textarea value={form.traction ?? ""} onChange={(event) => update("traction", event.target.value)} /></Field>
            <Field label="Revenue" error={fieldErrors.revenue}><Input value={form.revenue ?? ""} onChange={(event) => update("revenue", event.target.value)} /></Field>
            <Field label="Customer count" error={fieldErrors.customerCount}><Input type="number" value={form.customerCount ?? ""} onChange={(event) => updateNumber("customerCount", event.target.value)} /></Field>
            <Field label="Pilots" error={fieldErrors.pilots}><Textarea value={form.pilots ?? ""} onChange={(event) => update("pilots", event.target.value)} /></Field>
            <Field label="Partnerships" error={fieldErrors.partnerships}><Textarea value={form.partnerships ?? ""} onChange={(event) => update("partnerships", event.target.value)} /></Field>
          </FieldGroup>
        );
      case "Fundraising":
        return (
          <FieldGroup>
            <Field label="Funding stage" error={fieldErrors.fundingStage}><Input value={form.fundingStage ?? ""} onChange={(event) => update("fundingStage", event.target.value)} /></Field>
            <Field label="Funding target" error={fieldErrors.fundingTarget}><Input type="number" value={form.fundingTarget ?? ""} onChange={(event) => updateNumber("fundingTarget", event.target.value)} /></Field>
            <Field label="Minimum check size" error={fieldErrors.minCheckSize}><Input type="number" value={form.minCheckSize ?? ""} onChange={(event) => updateNumber("minCheckSize", event.target.value)} /></Field>
            <Field label="Maximum check size" error={fieldErrors.maxCheckSize}><Input type="number" value={form.maxCheckSize ?? ""} onChange={(event) => updateNumber("maxCheckSize", event.target.value)} /></Field>
            <Field label="Fundraising status" error={fieldErrors.fundraisingStatus}><Textarea value={form.fundraisingStatus ?? ""} onChange={(event) => update("fundraisingStatus", event.target.value)} /></Field>
            <Field label="Timeline" error={fieldErrors.fundraisingTimeline}><Input value={form.fundraisingTimeline ?? ""} onChange={(event) => update("fundraisingTimeline", event.target.value)} /></Field>
          </FieldGroup>
        );
      case "Team":
        return (
          <FieldGroup>
            <Field label="Team" error={fieldErrors.team}><Textarea value={form.team ?? ""} onChange={(event) => update("team", event.target.value)} /></Field>
            <Field label="Founder backgrounds" error={fieldErrors.founderBackgrounds}><Textarea value={form.founderBackgrounds ?? ""} onChange={(event) => update("founderBackgrounds", event.target.value)} /></Field>
            <Field label="Headquarters" error={fieldErrors.headquarters}><Input value={form.headquarters ?? ""} onChange={(event) => update("headquarters", event.target.value)} /></Field>
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
            <Field label="Preferred investor types" error={fieldErrors.preferredInvestorTypes}><Input value={join(form.preferredInvestorTypes)} onChange={(event) => updateArray("preferredInvestorTypes", event.target.value)} /></Field>
            <Field label="Keywords" error={fieldErrors.keywords}><Input value={join(form.keywords)} onChange={(event) => updateArray("keywords", event.target.value)} /></Field>
            <Field label="Excluded investors" error={fieldErrors.excludedInvestors}><Input value={join(form.excludedInvestors)} onChange={(event) => updateArray("excludedInvestors", event.target.value)} /></Field>
            <Field label="Excluded organizations" error={fieldErrors.excludedOrganizations}><Input value={join(form.excludedOrganizations)} onChange={(event) => updateArray("excludedOrganizations", event.target.value)} /></Field>
            <Field label="Custom notes" error={fieldErrors.customNotes}><Textarea value={form.customNotes ?? ""} onChange={(event) => update("customNotes", event.target.value)} /></Field>
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
            <Field label="Company name" error={fieldErrors.name}><Input value={form.name} onChange={(event) => update("name", event.target.value)} required /></Field>
            <Field label="Website" error={fieldErrors.website}><Input value={form.website ?? ""} onChange={(event) => update("website", event.target.value)} /></Field>
            <Field label="Logo URL" error={fieldErrors.logoUrl}><Input value={form.logoUrl ?? ""} onChange={(event) => update("logoUrl", event.target.value)} /></Field>
            <Field label="One-line description" error={fieldErrors.oneLineDescription}><Input value={form.oneLineDescription ?? ""} onChange={(event) => update("oneLineDescription", event.target.value)} /></Field>
            <Field label="Full description" error={fieldErrors.description}><Textarea value={form.description ?? ""} onChange={(event) => update("description", event.target.value)} /></Field>
            <Field label="Business model" error={fieldErrors.businessModel}><Input value={form.businessModel ?? ""} onChange={(event) => update("businessModel", event.target.value)} /></Field>
            <Field label="Revenue model" error={fieldErrors.revenueModel}><Input value={form.revenueModel ?? ""} onChange={(event) => update("revenueModel", event.target.value)} /></Field>
          </FieldGroup>
        );
    }
  }, [activeSection, deck, fieldErrors, form, selected]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    clearFieldError(String(key));
    setForm((current) => ({ ...current, [key]: value }));
  }
  function updateArray(key: keyof FormState, value: string) {
    clearFieldError(String(key));
    setForm((current) => ({ ...current, [key]: split(value) }));
  }
  function updateNumber(key: keyof FormState, value: string) {
    clearFieldError(String(key));
    setForm((current) => ({ ...current, [key]: value === "" ? null : Number(value) }));
  }
  function clearFieldError(key: string) {
    setFieldErrors((current) => {
      if (!current[key]) return current;
      const { [key]: _removed, ...rest } = current;
      return rest;
    });
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
          <Button type="button" onClick={saveProfile} disabled={isSaving}>{isSaving ? "Saving..." : "Save profile"}</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">{completion}% complete</Badge>
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

function Field({ label, children, error }: { label: string; children: React.ReactNode; error?: string }) {
  return (
    <label className="grid gap-3 border-b border-border pb-5 md:grid-cols-[220px_1fr] md:items-start">
      <span className="eyebrow pt-3">{label}</span>
      <span>
        {children}
        {error ? <span className="mt-2 block text-xs leading-5 text-[hsl(39_42%_68%)]">{error}</span> : null}
      </span>
    </label>
  );
}

function normalizeProfileForm(form: FormState) {
  return {
    id: textOrUndefined(form.id),
    name: form.name.trim(),
    website: normalizeUrl(form.website),
    logoUrl: normalizeUrl(form.logoUrl),
    oneLineDescription: nullableText(form.oneLineDescription),
    description: nullableText(form.description),
    industry: nullableText(form.industry),
    subIndustries: cleanArray(form.subIndustries),
    product: nullableText(form.product),
    problem: nullableText(form.problem),
    solution: nullableText(form.solution),
    targetCustomers: nullableText(form.targetCustomers),
    customerSegments: cleanArray(form.customerSegments),
    businessModel: nullableText(form.businessModel),
    revenueModel: nullableText(form.revenueModel),
    fundingStage: nullableText(form.fundingStage),
    fundingTarget: nullableNumber(form.fundingTarget),
    minCheckSize: nullableNumber(form.minCheckSize),
    maxCheckSize: nullableNumber(form.maxCheckSize),
    headquarters: nullableText(form.headquarters),
    targetGeographies: cleanArray(form.targetGeographies),
    traction: nullableText(form.traction),
    revenue: nullableText(form.revenue),
    growthMetrics: form.growthMetrics ?? null,
    customerCount: nullableNumber(form.customerCount),
    pilots: nullableText(form.pilots),
    partnerships: nullableText(form.partnerships),
    team: nullableText(form.team),
    founderBackgrounds: nullableText(form.founderBackgrounds),
    keywords: cleanArray(form.keywords),
    technologies: cleanArray(form.technologies),
    moat: nullableText(form.moat),
    competitors: cleanArray(form.competitors),
    preferredInvestorTypes: cleanArray(form.preferredInvestorTypes),
    excludedInvestors: cleanArray(form.excludedInvestors),
    excludedOrganizations: cleanArray(form.excludedOrganizations),
    fundraisingStatus: nullableText(form.fundraisingStatus),
    fundraisingTimeline: nullableText(form.fundraisingTimeline),
    customNotes: nullableText(form.customNotes),
    searchCriteria: form.searchCriteria ?? null,
  };
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

function textOrUndefined(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function nullableText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeUrl(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function nullableNumber(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function cleanArray(value?: string[]) {
  return Array.from(new Set((value ?? []).map((item) => item.trim()).filter(Boolean)));
}

function isFieldErrorResponse(value: unknown): value is { fields: Record<string, string>; message?: string; error?: string } {
  return Boolean(value && typeof value === "object" && "fields" in value && typeof (value as { fields?: unknown }).fields === "object");
}

function firstFieldError(fields: Record<string, string>) {
  return Object.values(fields)[0];
}
