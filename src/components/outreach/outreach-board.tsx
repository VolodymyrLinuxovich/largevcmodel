"use client";

import { useState } from "react";
import { Check, Copy, RefreshCw, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type Draft = {
  id: string;
  contactId: string;
  format: string;
  tone: string;
  version: string;
  subject: string;
  body: string;
  rationale: string;
  status: string;
  contact: { fullName: string; company?: { name: string } | null };
};

export function OutreachBoard({ initialDrafts }: { initialDrafts: Draft[] }) {
  const [drafts, setDrafts] = useState(initialDrafts);
  const [selectedId, setSelectedId] = useState(initialDrafts[0]?.id);
  const [tone, setTone] = useState("thoughtful");
  const [version, setVersion] = useState("short");
  const selected = drafts.find((draft) => draft.id === selectedId) ?? drafts[0];

  async function approve() {
    if (!selected) return;
    const response = await fetch("/api/outreach/approve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ draftId: selected.id }),
    });
    const result = await response.json();
    if (response.ok) updateDraft(result.draft);
  }

  async function sendDraft() {
    if (!selected) return;
    const response = await fetch("/api/outreach/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ draftId: selected.id }),
    });
    const result = await response.json();
    if (response.ok) updateDraft(result.draft);
  }

  async function regenerate() {
    if (!selected) return;
    const response = await fetch("/api/outreach/draft", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contactId: selected.contactId, tone, version, format: selected.format }),
    });
    const result = await response.json();
    if (response.ok) {
      setDrafts((current) => [result.draft, ...current]);
      setSelectedId(result.draft.id);
    }
  }

  async function copy() {
    if (selected?.body) await navigator.clipboard.writeText(selected.body);
  }

  function updateDraft(next: Draft) {
    setDrafts((current) => current.map((draft) => (draft.id === next.id ? { ...draft, ...next } : draft)));
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Draft Queue</CardTitle>
          <CardDescription>Approval-required by default.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {drafts.map((draft) => (
            <button
              key={draft.id}
              type="button"
              onClick={() => setSelectedId(draft.id)}
              className="w-full rounded-md border border-border bg-white p-3 text-left hover:bg-accent"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">{draft.contact.fullName}</span>
                <Badge variant={draft.status === "Sent" ? "success" : draft.status === "Approved" ? "warning" : "muted"}>{draft.status}</Badge>
              </div>
              <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">{draft.subject}</div>
            </button>
          ))}
          {!drafts.length ? <p className="text-sm text-muted-foreground">No drafts yet. Generate one from Research or a founder profile.</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Outreach Studio</CardTitle>
          <CardDescription>Final messages exclude citation markers; evidence stays in the rationale panel.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {selected ? (
            <>
              <div className="grid gap-3 md:grid-cols-3">
                <Select value={selected.format} disabled aria-label="Outreach format">
                  <option value="email">Email</option>
                  <option value="linkedin">LinkedIn</option>
                </Select>
                <Select value={tone} onChange={(event) => setTone(event.target.value)} aria-label="Tone">
                  <option value="thoughtful">Thoughtful</option>
                  <option value="direct">Direct</option>
                  <option value="warm">Warm</option>
                </Select>
                <Select value={version} onChange={(event) => setVersion(event.target.value)} aria-label="Version">
                  <option value="short">Short</option>
                  <option value="long">Long</option>
                </Select>
              </div>
              <div className="rounded-md border border-border bg-muted p-3 text-sm font-semibold">{selected.subject}</div>
              <Textarea value={selected.body} onChange={(event) => updateDraft({ ...selected, body: event.target.value })} aria-label="Editable outreach body" />
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={regenerate}>
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  Regenerate
                </Button>
                <Button variant="outline" onClick={copy}>
                  <Copy className="h-4 w-4" aria-hidden="true" />
                  Copy
                </Button>
                <Button onClick={approve} disabled={selected.status !== "Draft"}>
                  <Check className="h-4 w-4" aria-hidden="true" />
                  Approve
                </Button>
                <Button variant="secondary" onClick={sendDraft} disabled={selected.status !== "Approved"}>
                  <Send className="h-4 w-4" aria-hidden="true" />
                  Simulate Send
                </Button>
              </div>
              <div className="rounded-md border border-border bg-white p-3 text-sm leading-6">
                <div className="font-semibold">Why this was personalized</div>
                <Rationale value={selected.rationale} />
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Select or create a draft.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Rationale({ value }: { value: string }) {
  try {
    const parsed = JSON.parse(value);
    return (
      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
        <p>{parsed.summary}</p>
        {parsed.claims?.map((claim: any) => (
          <p key={`${claim.sourceId}-${claim.claim}`}>
            {claim.claim} ({claim.origin}, {claim.sourceType})
          </p>
        ))}
      </div>
    );
  } catch {
    return <p className="mt-2 text-xs text-muted-foreground">{value}</p>;
  }
}
