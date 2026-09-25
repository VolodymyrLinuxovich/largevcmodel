"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { OPPORTUNITY_PRIORITIES, OPPORTUNITY_SOURCES } from "@/lib/pipeline/schemas";
import { Field, FormError } from "./form-status";
import { enumLabel } from "./labels";
import { requestJson } from "./request-json";

type Option = { id: string; name: string };

export function NewOpportunityForm({ companies, theses }: { companies: Option[]; theses: Option[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (key: string) => String(form.get(key) ?? "").trim();
    const existing = companies.find((company) => company.name.toLowerCase() === text("companyName").toLowerCase());
    setPending(true);
    setError(null);
    try {
      const { opportunity } = await requestJson<{ opportunity: { id: string } }>("/api/opportunities", {
        method: "POST",
        body: {
          ...(existing
            ? { companyId: existing.id }
            : {
                company: {
                  name: text("companyName"),
                  website: text("website"),
                  sector: text("sector"),
                  stage: text("companyStage"),
                  geography: text("geography"),
                },
              }),
          title: text("title"),
          thesisId: text("thesisId") || null,
          priority: text("priority"),
          source: text("source"),
          sourceDetail: text("sourceDetail"),
          nextAction: text("nextAction"),
          nextActionAt: text("nextActionAt"),
          notes: text("notes"),
        },
      });
      router.push(`/pipeline/${opportunity.id}`);
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not create the opportunity.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-describedby="new-opportunity-help">
      <p id="new-opportunity-help" className="text-xs leading-5 text-muted-foreground md:col-span-full">
        Everything entered here is stored as user-provided information. Leave unknown fields blank; nothing is inferred.
      </p>
      <Field label="Company" htmlFor="companyName" hint="Matching an existing company reuses it and its evidence.">
        <Input id="companyName" name="companyName" list="known-companies" required maxLength={160} autoComplete="off" />
        <datalist id="known-companies">
          {companies.map((company) => (
            <option key={company.id} value={company.name} />
          ))}
        </datalist>
      </Field>
      <Field label="Round or title" htmlFor="title">
        <Input id="title" name="title" maxLength={160} placeholder="e.g. Seed" />
      </Field>
      <Field label="Website" htmlFor="website">
        <Input id="website" name="website" type="url" maxLength={2048} placeholder="https://" />
      </Field>
      <Field label="Sector" htmlFor="sector">
        <Input id="sector" name="sector" maxLength={160} />
      </Field>
      <Field label="Company stage" htmlFor="companyStage">
        <Input id="companyStage" name="companyStage" maxLength={80} />
      </Field>
      <Field label="Geography" htmlFor="geography">
        <Input id="geography" name="geography" maxLength={160} />
      </Field>
      <Field label="Thesis" htmlFor="thesisId">
        <Select id="thesisId" name="thesisId" defaultValue="">
          <option value="">Most recent active thesis</option>
          {theses.map((thesis) => (
            <option key={thesis.id} value={thesis.id}>
              {thesis.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Priority" htmlFor="priority">
        <Select id="priority" name="priority" defaultValue="MEDIUM">
          {OPPORTUNITY_PRIORITIES.map((priority) => (
            <option key={priority} value={priority}>
              {enumLabel(priority)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Source" htmlFor="source">
        <Select id="source" name="source" defaultValue="OTHER">
          {OPPORTUNITY_SOURCES.map((source) => (
            <option key={source} value={source}>
              {enumLabel(source)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Source detail" htmlFor="sourceDetail">
        <Input id="sourceDetail" name="sourceDetail" maxLength={500} />
      </Field>
      <Field label="Next action" htmlFor="nextAction">
        <Input id="nextAction" name="nextAction" maxLength={500} />
      </Field>
      <Field label="Next action date" htmlFor="nextActionAt">
        <Input id="nextActionAt" name="nextActionAt" type="date" />
      </Field>
      <div className="md:col-span-full">
        <Field label="Notes" htmlFor="notes">
          <Textarea id="notes" name="notes" maxLength={10_000} className="min-h-[90px]" />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3 md:col-span-full">
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {pending ? "Creating" : "Add to pipeline"}
        </Button>
        <FormError message={error} />
      </div>
    </form>
  );
}
