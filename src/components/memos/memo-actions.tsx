"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Field, FormError } from "@/components/pipeline/form-status";
import { requestJson } from "@/components/pipeline/request-json";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function GenerateMemoButton({ opportunityId }: { opportunityId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setPending(true);
    setError(null);
    try {
      const { memo } = await requestJson<{ memo: { id: string } }>(`/api/opportunities/${opportunityId}/memos`, { method: "POST" });
      router.push(`/pipeline/${opportunityId}/memos/${memo.id}`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not generate the memo.");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" onClick={generate} disabled={pending} aria-busy={pending}>
        {pending ? "Assembling" : "Generate IC memo draft"}
      </Button>
      <FormError message={error} />
    </div>
  );
}

export function FinalizeMemoForm({ memoId }: { memoId: string }) {
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      await requestJson(`/api/memos/${memoId}/finalize`, {
        method: "POST",
        body: { reviewerNotes: String(form.get("reviewerNotes") ?? ""), confirmFinalize: true },
      });
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not finalize the memo.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <Field label="Reviewer notes" htmlFor="reviewerNotes" hint="Your own assessment for the committee. Stored as user-provided information.">
        <Textarea id="reviewerNotes" name="reviewerNotes" maxLength={5000} className="min-h-[100px]" />
      </Field>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1 h-3.5 w-3.5 accent-primary" />
        I reviewed this draft. Finalizing locks this version for investment committee.
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={!confirmed || pending} aria-busy={pending}>
          {pending ? "Finalizing" : "Finalize for IC"}
        </Button>
        <FormError message={error} />
      </div>
    </form>
  );
}
