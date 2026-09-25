"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { OPPORTUNITY_PRIORITIES } from "@/lib/pipeline/schemas";
import { Field, FormError } from "./form-status";
import { enumLabel } from "./labels";
import { ApiRequestError, requestJson } from "./request-json";

export type EditableOpportunity = {
  id: string;
  version: number;
  priority: string;
  ownerName: string | null;
  nextAction: string | null;
  nextActionAt: string | null;
  notes: string | null;
  thesisId: string | null;
};

export function OpportunityFieldsForm({ opportunity, theses }: { opportunity: EditableOpportunity; theses: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (key: string) => String(form.get(key) ?? "").trim();
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      await requestJson(`/api/opportunities/${opportunity.id}`, {
        method: "PATCH",
        body: {
          expectedVersion: opportunity.version,
          priority: text("priority"),
          ownerName: text("ownerName"),
          nextAction: text("nextAction"),
          nextActionAt: text("nextActionAt"),
          notes: text("notes"),
          thesisId: text("thesisId") || null,
        },
      });
      setSaved(true);
      router.refresh();
    } catch (requestError) {
      const conflict = requestError instanceof ApiRequestError && requestError.code === "VERSION_CONFLICT";
      setError(conflict ? "This opportunity changed elsewhere; the latest version has been loaded." : requestError instanceof Error ? requestError.message : "Update failed.");
      if (conflict) router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    // Keyed by version so a refresh after any mutation resets uncontrolled fields to server values.
    <form key={opportunity.version} onSubmit={submit} className="grid gap-4 md:grid-cols-2">
      <Field label="Priority" htmlFor="edit-priority">
        <Select id="edit-priority" name="priority" defaultValue={opportunity.priority}>
          {OPPORTUNITY_PRIORITIES.map((priority) => (
            <option key={priority} value={priority}>
              {enumLabel(priority)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Owner" htmlFor="edit-owner">
        <Input id="edit-owner" name="ownerName" defaultValue={opportunity.ownerName ?? ""} maxLength={120} />
      </Field>
      <Field label="Next action" htmlFor="edit-next-action">
        <Input id="edit-next-action" name="nextAction" defaultValue={opportunity.nextAction ?? ""} maxLength={500} />
      </Field>
      <Field label="Next action date" htmlFor="edit-next-action-at">
        <Input id="edit-next-action-at" name="nextActionAt" type="date" defaultValue={opportunity.nextActionAt ?? ""} />
      </Field>
      <Field label="Thesis" htmlFor="edit-thesis">
        <Select id="edit-thesis" name="thesisId" defaultValue={opportunity.thesisId ?? ""}>
          <option value="">Most recent active thesis</option>
          {theses.map((thesis) => (
            <option key={thesis.id} value={thesis.id}>
              {thesis.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="md:col-span-full">
        <Field label="Notes" htmlFor="edit-notes">
          <Textarea id="edit-notes" name="notes" defaultValue={opportunity.notes ?? ""} maxLength={10_000} className="min-h-[100px]" />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3 md:col-span-full">
        <Button type="submit" variant="outline" disabled={pending} aria-busy={pending}>
          {pending ? "Saving" : "Save details"}
        </Button>
        <span role="status" className="font-mono text-[0.65rem] uppercase tracking-[0.08em] text-muted-foreground">
          {saved ? "Saved" : ""}
        </span>
        <FormError message={error} />
      </div>
    </form>
  );
}
