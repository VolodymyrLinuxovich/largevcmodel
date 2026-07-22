"use client";

import { useState } from "react";
import { Copy, Loader2, MailPlus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

export function FounderActions({ contactId }: { contactId: string }) {
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState<any>(null);

  async function research() {
    setLoading("research");
    const response = await fetch("/api/research", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contactId }),
    });
    const result = await response.json();
    setMessage(response.ok ? `Research complete via ${result.run.provider}. ${result.sources.length} sources available.` : result.error);
    setLoading(null);
  }

  async function draftOutreach() {
    setLoading("draft");
    const response = await fetch("/api/outreach/draft", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contactId, tone: "thoughtful", version: "short", format: "email" }),
    });
    const result = await response.json();
    setDraft(result.draft);
    setMessage(response.ok ? "Draft created and left unapproved." : result.error);
    setLoading(null);
  }

  async function copy() {
    if (!draft?.body) return;
    await navigator.clipboard.writeText(draft.body);
    setMessage("Draft copied.");
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-white p-4">
      <div className="flex flex-wrap gap-2">
        <Button onClick={research} disabled={Boolean(loading)}>
          {loading === "research" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}
          Research with Hermes
        </Button>
        <Button variant="outline" onClick={draftOutreach} disabled={Boolean(loading)}>
          {loading === "draft" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <MailPlus className="h-4 w-4" aria-hidden="true" />}
          Draft outreach
        </Button>
      </div>
      {message ? <Badge variant="muted">{message}</Badge> : null}
      {draft ? (
        <div className="space-y-2">
          <div className="text-sm font-semibold">{draft.subject}</div>
          <Textarea value={draft.body} readOnly aria-label="Founder outreach draft" />
          <Button variant="outline" size="sm" onClick={copy}>
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            Copy
          </Button>
        </div>
      ) : null}
    </div>
  );
}
