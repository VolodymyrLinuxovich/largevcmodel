"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export function RouteLoading({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" className="px-5 py-24 sm:px-8 lg:px-10">
      <div className="mx-auto w-full max-w-[1480px]">
        <p className="eyebrow">Loading</p>
        <p className="mt-4 text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

export function RouteError({ error, reset, area }: { error: Error & { digest?: string }; reset: () => void; area: string }) {
  useEffect(() => {
    console.error(`${area} failed to render`, error);
  }, [area, error]);

  return (
    <div role="alert" className="px-5 py-24 sm:px-8 lg:px-10">
      <div className="mx-auto w-full max-w-[1480px]">
        <p className="eyebrow">Something went wrong</p>
        <h1 className="mt-4 text-3xl font-medium">{area} could not be loaded.</h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
          No data was changed. Try again; if the problem continues, check the audit log and server logs
          {error.digest ? ` (reference ${error.digest})` : ""}.
        </p>
        <Button type="button" variant="outline" className="mt-6" onClick={reset}>
          Try again
        </Button>
      </div>
    </div>
  );
}
