"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormError } from "@/components/pipeline/form-status";
import { requestJson } from "@/components/pipeline/request-json";
import { Button } from "@/components/ui/button";

export function WatchButton({
  entityType,
  targetId,
  itemId,
  label,
}: {
  entityType: "COMPANY" | "CONTACT" | "OPPORTUNITY";
  targetId: string;
  itemId: string | null;
  label: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const watching = Boolean(itemId);

  async function toggle() {
    setPending(true);
    setError(null);
    try {
      if (watching) await requestJson("/api/watchlist", { method: "DELETE", body: { itemId } });
      else await requestJson("/api/watchlist", { method: "POST", body: { entityType, targetId } });
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Watchlist update failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={toggle} disabled={pending} aria-pressed={watching} aria-busy={pending}>
        {watching ? `Unwatch ${label}` : `Watch ${label}`}
      </Button>
      <FormError message={error} />
    </span>
  );
}
