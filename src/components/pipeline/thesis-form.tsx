"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormError } from "./form-status";
import { requestJson } from "./request-json";

export function ThesisForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const text = (key: string) => String(form.get(key) ?? "").trim();
    const money = (key: string) => (text(key) ? Number(text(key)) : null);
    setPending(true);
    setError(null);
    try {
      await requestJson("/api/theses", {
        method: "POST",
        body: {
          name: text("thesisName"),
          targetSectors: text("targetSectors"),
          stages: text("stages"),
          geographies: text("geographies"),
          checkSizeMin: money("checkSizeMin"),
          checkSizeMax: money("checkSizeMax"),
        },
      });
      formElement.reset();
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not save the thesis.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4 md:grid-cols-3">
      <Field label="Thesis name" htmlFor="thesisName">
        <Input id="thesisName" name="thesisName" required minLength={2} maxLength={120} />
      </Field>
      <Field label="Target sectors" htmlFor="targetSectors" hint="Comma separated.">
        <Input id="targetSectors" name="targetSectors" maxLength={1000} />
      </Field>
      <Field label="Stages" htmlFor="stages" hint="Comma separated, e.g. Pre-seed, Seed.">
        <Input id="stages" name="stages" maxLength={1000} />
      </Field>
      <Field label="Geographies" htmlFor="geographies" hint="Comma separated.">
        <Input id="geographies" name="geographies" maxLength={1000} />
      </Field>
      <Field label="Min check (USD)" htmlFor="checkSizeMin">
        <Input id="checkSizeMin" name="checkSizeMin" type="number" min={0} step={1} inputMode="numeric" />
      </Field>
      <Field label="Max check (USD)" htmlFor="checkSizeMax">
        <Input id="checkSizeMax" name="checkSizeMax" type="number" min={0} step={1} inputMode="numeric" />
      </Field>
      <div className="flex flex-wrap items-center gap-3 md:col-span-full">
        <Button type="submit" variant="outline" disabled={pending} aria-busy={pending}>
          {pending ? "Saving" : "Save thesis"}
        </Button>
        <FormError message={error} />
      </div>
    </form>
  );
}
