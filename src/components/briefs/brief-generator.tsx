"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Field, FormError } from "@/components/pipeline/form-status";
import { requestJson } from "@/components/pipeline/request-json";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

export function BriefGenerator({ opportunityId, meetings }: { opportunityId: string; meetings: Array<{ id: string; label: string }> }) {
  const router = useRouter();
  const [calendarEventId, setCalendarEventId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const { brief } = await requestJson<{ brief: { id: string } }>(`/api/opportunities/${opportunityId}/briefs`, {
        method: "POST",
        body: { calendarEventId: calendarEventId || null },
      });
      router.push(`/pipeline/${opportunityId}/briefs/${brief.id}`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not generate the brief.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
      <Field label="Meeting" htmlFor="brief-meeting" hint="Upcoming Google Calendar events that include a linked person.">
        <Select id="brief-meeting" value={calendarEventId} onChange={(event) => setCalendarEventId(event.target.value)}>
          <option value="">General brief (no specific meeting)</option>
          {meetings.map((meeting) => (
            <option key={meeting.id} value={meeting.id}>
              {meeting.label}
            </option>
          ))}
        </Select>
      </Field>
      <Button type="submit" disabled={pending} aria-busy={pending}>
        {pending ? "Assembling" : "Generate meeting brief"}
      </Button>
      <div className="sm:col-span-full">
        <FormError message={error} />
      </div>
    </form>
  );
}
