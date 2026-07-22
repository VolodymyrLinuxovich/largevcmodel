"use client";

import { useState } from "react";
import { Button, type ButtonProps } from "@/components/ui/button";

export function ApiActionButton({
  endpoint,
  payload,
  children,
  onComplete,
  ...props
}: ButtonProps & {
  endpoint: string;
  payload?: Record<string, unknown>;
  onComplete?: (payload: unknown) => void;
}) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");

  async function run() {
    setState("loading");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload ?? {}),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "Action failed");
      setState("done");
      onComplete?.(body);
    } catch {
      setState("error");
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button type="button" onClick={run} disabled={props.disabled || state === "loading"} {...props}>
        {state === "loading" ? "Working" : children}
      </Button>
      {state === "done" ? <span className="font-mono text-[0.65rem] uppercase tracking-[0.08em] text-muted-foreground">Done</span> : null}
      {state === "error" ? <span className="font-mono text-[0.65rem] uppercase tracking-[0.08em] text-[hsl(39_32%_70%)]">Failed</span> : null}
    </span>
  );
}
