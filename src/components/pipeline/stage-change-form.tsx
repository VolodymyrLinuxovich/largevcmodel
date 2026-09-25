"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { allowedNextStages, STAGE_LABELS, validateStageTransition, type OpportunityStageValue } from "@/lib/pipeline/stages";
import { Field, FormError } from "./form-status";
import { ApiRequestError, requestJson } from "./request-json";

export function StageChangeForm({ opportunityId, stage, version }: { opportunityId: string; stage: OpportunityStageValue; version: number }) {
  const router = useRouter();
  const options = allowedNextStages(stage);
  const [toStage, setToStage] = useState<OpportunityStageValue | "">(options[0] ?? "");
  const [note, setNote] = useState("");
  const [passReason, setPassReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!options.length) {
    return <p className="text-sm text-muted-foreground">{STAGE_LABELS[stage]} is a closed stage; no further stage changes are possible.</p>;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!toStage) return;
    const check = validateStageTransition({ from: stage, to: toStage, note, passReason });
    if (!check.ok) {
      setError(check.message);
      return;
    }
    setPending(true);
    setError(null);
    try {
      await requestJson(`/api/opportunities/${opportunityId}/stage`, {
        method: "POST",
        body: { toStage, note, passReason, expectedVersion: version },
      });
      setNote("");
      setPassReason("");
      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof ApiRequestError && requestError.code === "VERSION_CONFLICT"
          ? "This opportunity changed in another session. The page has been refreshed; review and try again."
          : requestError instanceof Error
            ? requestError.message
            : "Stage change failed.",
      );
      if (requestError instanceof ApiRequestError && requestError.code === "VERSION_CONFLICT") router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <Field label="Move to" htmlFor="toStage">
        <Select id="toStage" value={toStage} onChange={(event) => setToStage(event.target.value as OpportunityStageValue)}>
          {options.map((option) => (
            <option key={option} value={option}>
              {STAGE_LABELS[option]}
            </option>
          ))}
        </Select>
      </Field>
      {toStage === "PASSED" ? (
        <Field label="Pass reason (required)" htmlFor="passReason">
          <Textarea id="passReason" required minLength={3} maxLength={2000} value={passReason} onChange={(event) => setPassReason(event.target.value)} className="min-h-[80px]" />
        </Field>
      ) : (
        <Field label="Note" htmlFor="stageNote" hint="Required when moving backwards or reopening a passed deal.">
          <Textarea id="stageNote" maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} className="min-h-[80px]" />
        </Field>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || !toStage} aria-busy={pending}>
          {pending ? "Saving" : "Change stage"}
        </Button>
        <FormError message={error} />
      </div>
    </form>
  );
}
