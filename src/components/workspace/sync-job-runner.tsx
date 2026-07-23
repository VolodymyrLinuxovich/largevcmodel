"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function SyncJobRunner({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">(enabled ? "running" : "idle");

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    async function run() {
      setStatus("running");
      try {
        for (let attempt = 0; attempt < 6; attempt += 1) {
          const response = await fetch("/api/sync/jobs/process", { method: "POST" });
          const payload = (await response.json().catch(() => ({}))) as { remaining?: number; error?: string };
          if (!response.ok) throw new Error(payload.error ?? "Sync failed");
          if (cancelled) return;
          router.refresh();
          if (!payload.remaining) break;
          await new Promise((resolve) => setTimeout(resolve, 2500));
        }
        if (!cancelled) setStatus("done");
      } catch {
        if (!cancelled) setStatus("error");
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [enabled, router]);

  if (!enabled || status === "idle") return null;
  return (
    <p className="mt-4 font-mono text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground">
      {status === "running" ? "Initial sync is processing in bounded pages." : status === "done" ? "Initial sync worker finished this pass." : "Initial sync worker needs retry."}
    </p>
  );
}
