import { z } from "zod";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ResearchProvider } from "./provider";
import type { ResearchRequest, ResearchResult } from "@/lib/domain/types";
import { sourceInputSchema } from "@/lib/domain/sources";

const execFileAsync = promisify(execFile);

const hermesResultSchema = z.object({
  summary: z.string(),
  sources: z.array(sourceInputSchema),
  claims: z.array(
    z.object({
      text: z.string(),
      category: z.string(),
      provenance: z.enum(["public_research", "connected_account", "user_provided", "ai_inference", "unverified"]),
      confidence: z.number().min(0).max(100),
      contactId: z.string().optional().nullable(),
      companyId: z.string().optional().nullable(),
      sourceUrls: z.array(z.string()).optional(),
    }),
  ),
  unavailable: z.array(z.string()).default([]),
  inferred: z.array(z.string()).default([]),
});

export class HermesResearchProvider implements ResearchProvider {
  constructor(private readonly config: { apiUrl?: string; apiKey?: string; command?: string }) {}

  async researchFounder(input: ResearchRequest): Promise<ResearchResult> {
    if (this.config.command) {
      return this.researchFounderWithCli(input);
    }

    if (!this.config.apiUrl) {
      throw new Error("Hermes is configured, but neither HERMES_COMMAND nor HERMES_API_URL is set.");
    }

    const response = await fetch(this.config.apiUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        task: "research_founder",
        input,
        provenance_required: true,
        allowed_source_types: ["company", "news", "funding", "social", "database", "other"],
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Hermes returned ${response.status}`);
    }

    const parsed = hermesResultSchema.parse(await response.json());
    return {
      provider: "hermes",
      summary: parsed.summary,
      sources: parsed.sources.map((source) => ({
        ...source,
        origin: "hermes",
        contactId: source.contactId ?? input.contactId,
        companyId: source.companyId ?? input.companyId,
      })),
      claims: parsed.claims.map((claim) => ({
        ...claim,
        contactId: claim.contactId ?? input.contactId,
        companyId: claim.companyId ?? input.companyId,
      })),
      unavailable: parsed.unavailable,
      inferred: parsed.inferred,
    };
  }

  private async researchFounderWithCli(input: ResearchRequest): Promise<ResearchResult> {
    const prompt = [
      "You are Hermes Agent acting as a public-source research provider for LargeVCModel.",
      "Return strict JSON only. Do not use markdown.",
      "Schema:",
      JSON.stringify({
        summary: "string",
        sources: [
          {
            title: "string",
            url: "https://...",
            publisher: "string optional",
            publishedAt: "ISO date optional",
            accessedAt: new Date().toISOString(),
            snippet: "string optional",
            sourceType: "company|news|funding|social|database|other",
            origin: "hermes",
            supportsClaims: ["exact supported claim"],
          },
        ],
        claims: [
          {
            text: "claim text",
            category: "string",
            provenance: "public_research|ai_inference|unverified",
            confidence: 0,
            sourceUrls: ["https://..."],
          },
        ],
        unavailable: ["unavailable or unverified facts"],
        inferred: ["model-generated conclusions"],
      }),
      "Research request:",
      JSON.stringify(input),
      "Requirements: use public sources only; never invent URLs; mark unsupported facts unavailable or unverified.",
    ].join("\n");

    const commandParts = splitCommand(this.config.command);
    const [command, ...configuredArgs] = commandParts;
    if (!command) {
      throw new Error("HERMES_COMMAND is empty.");
    }

    const { stdout, stderr } = await execFileAsync(command, [...configuredArgs, prompt], {
      timeout: 120_000,
      maxBuffer: 1024 * 1024 * 4,
      env: process.env,
    });

    const jsonText = extractJson(stdout);
    if (!jsonText) {
      throw new Error(`Hermes CLI did not return JSON.${stderr ? ` stderr: ${stderr.slice(0, 500)}` : ""}`);
    }

    const parsed = hermesResultSchema.parse(JSON.parse(jsonText));
    return {
      provider: "hermes_cli",
      summary: parsed.summary,
      sources: parsed.sources.map((source) => ({
        ...source,
        origin: "hermes",
        contactId: source.contactId ?? input.contactId,
        companyId: source.companyId ?? input.companyId,
      })),
      claims: parsed.claims.map((claim) => ({
        ...claim,
        contactId: claim.contactId ?? input.contactId,
        companyId: claim.companyId ?? input.companyId,
      })),
      unavailable: parsed.unavailable,
      inferred: parsed.inferred,
    };
  }
}

function splitCommand(command?: string) {
  if (!command) return [];
  return command.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((part) => part.replace(/^"|"$/g, "")) ?? [];
}

function extractJson(output: string) {
  const trimmed = output.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return trimmed.slice(start, end + 1);
}
