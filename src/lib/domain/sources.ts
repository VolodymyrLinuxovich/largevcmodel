import { z } from "zod";
import type { ResearchSourceInput } from "./types";

export const sourceInputSchema = z.object({
  title: z.string().min(2),
  url: z
    .string()
    .min(1)
    .refine((value) => value.startsWith("/demo-sources/") || /^https?:\/\//.test(value), {
      message: "Source URL must be http(s) or a local /demo-sources path",
    }),
  publisher: z.string().optional().nullable(),
  publishedAt: z.union([z.string(), z.date()]).optional().nullable(),
  accessedAt: z.union([z.string(), z.date()]),
  snippet: z.string().optional().nullable(),
  sourceType: z.string().min(2),
  origin: z.string().min(2),
  contactId: z.string().optional().nullable(),
  companyId: z.string().optional().nullable(),
  supportsClaims: z.array(z.string().min(3)).default([]),
});

export function canonicalizeUrl(url: string) {
  if (url.startsWith("/")) {
    return url.replace(/\/+$/, "").toLowerCase();
  }

  const parsed = new URL(url);
  parsed.hash = "";
  parsed.hostname = parsed.hostname.replace(/^www\./, "").toLowerCase();
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  parsed.searchParams.sort();
  return parsed.toString();
}

export function dedupeSources<T extends ResearchSourceInput>(sources: T[]): T[] {
  const seen = new Map<string, T>();
  for (const source of sources) {
    const parsed = sourceInputSchema.parse(source);
    const canonical = canonicalizeUrl(parsed.url);
    if (!seen.has(canonical)) {
      seen.set(canonical, { ...source, url: parsed.url });
      continue;
    }

    const existing = seen.get(canonical);
    if (existing) {
      seen.set(canonical, {
        ...existing,
        supportsClaims: Array.from(new Set([...existing.supportsClaims, ...source.supportsClaims])),
        snippet: existing.snippet ?? source.snippet,
      });
    }
  }
  return Array.from(seen.values());
}

export function sourceDomain(url: string) {
  if (url.startsWith("/")) return "local demo";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

export type CitationSource = {
  id: string;
  title: string;
  url: string;
  sourceType: string;
  origin: string;
};

export function buildCitationMap(sources: CitationSource[]) {
  const map = new Map<string, number>();
  sources.forEach((source, index) => map.set(source.id, index + 1));
  return map;
}

export function citationLabel(sourceId: string, citationMap: Map<string, number>) {
  const number = citationMap.get(sourceId);
  return number ? `[${number}]` : "[?]";
}
