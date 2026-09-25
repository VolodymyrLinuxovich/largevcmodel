"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";

export function ApiActionButton({
  confirmMessage,
  endpoint,
  payload,
  children,
  onComplete,
  refreshOnSuccess = false,
  ...props
}: ButtonProps & {
  confirmMessage?: string;
  endpoint: string;
  payload?: Record<string, unknown>;
  onComplete?: (payload: unknown) => void;
  /** Re-render server components after a successful mutation so the page does not show stale data. */
  refreshOnSuccess?: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function run() {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    setState("loading");
    setErrorMessage(null);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload ?? {}),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Action failed");
      setState("done");
      onComplete?.(body);
      if (refreshOnSuccess) router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Action failed");
      setState("error");
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button type="button" onClick={run} disabled={props.disabled || state === "loading"} aria-busy={state === "loading"} {...props}>
        {state === "loading" ? "Working" : children}
      </Button>
      <span role="status" aria-live="polite" className="font-mono text-[0.65rem] uppercase tracking-[0.08em]">
        {state === "done" ? <span className="text-muted-foreground">Done</span> : null}
        {state === "error" ? (
          <span className="text-[hsl(39_32%_70%)]" title={errorMessage ?? undefined}>
            Failed{errorMessage ? `: ${errorMessage}` : ""}
          </span>
        ) : null}
      </span>
    </span>
  );
}
