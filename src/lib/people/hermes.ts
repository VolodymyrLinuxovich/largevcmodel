import "server-only";

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { PersonType, ProviderHealthStatus } from "@prisma/client";
import { z } from "zod";
import type { PeopleDiscoveryProvider } from "./provider";
import type { PeopleProviderSearchInput, PeopleProviderSearchResult, PeopleProviderStatus } from "./types";

const execFileAsync = promisify(execFile);

const sourceSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  publisher: z.string().optional().nullable(),
  publishedAt: z.string().optional().nullable(),
  accessedAt: z.string().optional().default(() => new Date().toISOString()),
  snippet: z.string().optional().nullable(),
  sourceType: z.string().default("other"),
  supportsClaims: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(100).optional().nullable(),
});

const claimSchema = z.object({
  text: z.string(),
  fieldKey: z.string().optional().nullable(),
  confidence: z.number().min(0).max(100).optional().nullable(),
  sourceUrls: z.array(z.string().url()).default([]),
});

const organizationSchema = z.object({
  providerOrgId: z.string().optional().nullable(),
  name: z.string(),
  type: z.string().optional().nullable(),
  website: z.string().url().optional().nullable(),
  domain: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  industries: z.array(z.string()).default([]),
  investmentStages: z.array(z.string()).default([]),
  minCheckSize: z.number().int().optional().nullable(),
  maxCheckSize: z.number().int().optional().nullable(),
  portfolio: z.array(z.string()).default([]),
  publicUrls: z.array(z.string().url()).default([]),
  sourceConfidence: z.number().min(0).max(100).optional().nullable(),
  sources: z.array(sourceSchema).default([]),
  claims: z.array(claimSchema).default([]),
});

const personSchema = z.object({
  providerPersonId: z.string().optional().nullable(),
  fullName: z.string(),
  firstName: z.string().optional().nullable(),
  lastName: z.string().optional().nullable(),
  currentTitle: z.string().optional().nullable(),
  currentOrganization: organizationSchema.optional().nullable(),
  currentOrganizationName: z.string().optional().nullable(),
  previousOrganizations: z.array(z.string()).default([]),
  personTypes: z.array(z.nativeEnum(PersonType)).default([]),
  location: z.string().optional().nullable(),
  biography: z.string().optional().nullable(),
  investmentThesis: z.string().optional().nullable(),
  industries: z.array(z.string()).default([]),
  subIndustries: z.array(z.string()).default([]),
  preferredStages: z.array(z.string()).default([]),
  minCheckSize: z.number().int().optional().nullable(),
  maxCheckSize: z.number().int().optional().nullable(),
  geographyPreferences: z.array(z.string()).default([]),
  portfolioCompanies: z.array(z.string()).default([]),
  notableInvestments: z.array(z.string()).default([]),
  notableExperience: z.string().optional().nullable(),
  education: z.array(z.string()).default([]),
  skills: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
  technologies: z.array(z.string()).default([]),
  emailAddresses: z.array(z.string()).default([]),
  organizationDomain: z.string().optional().nullable(),
  linkedinUrl: z.string().url().optional().nullable(),
  xUrl: z.string().url().optional().nullable(),
  personalWebsite: z.string().url().optional().nullable(),
  publicProfileUrls: z.array(z.string().url()).default([]),
  sourceConfidence: z.number().min(0).max(100).optional().nullable(),
  fieldConfidence: z.record(z.string(), z.number().min(0).max(100)).default({}),
  conflictingClaims: z.record(z.string(), z.array(z.string())).default({}),
  sources: z.array(sourceSchema).default([]),
  claims: z.array(claimSchema).default([]),
});

const searchResultSchema = z.object({
  people: z.array(personSchema).default([]),
  organizations: z.array(organizationSchema).default([]),
  partial: z.boolean().default(false),
  error: z.string().optional(),
  rateLimit: z.object({ remaining: z.number().optional(), resetAt: z.string().optional() }).optional(),
});

export class HermesPeopleDiscoveryProvider implements PeopleDiscoveryProvider {
  readonly name = "hermes";

  constructor(private readonly config: { apiUrl?: string; apiKey?: string; command?: string }) {}

  async status(): Promise<PeopleProviderStatus> {
    if (!this.config.command && !this.config.apiUrl) {
      return {
        name: this.name,
        status: ProviderHealthStatus.UNAVAILABLE,
        message:
          "Hermes is selected, but neither HERMES_COMMAND nor HERMES_API_URL is configured for external people discovery.",
      };
    }
    if (this.config.apiUrl && !this.config.apiKey) {
      return {
        name: this.name,
        status: ProviderHealthStatus.DEGRADED,
        message: "Hermes API URL is configured without an API key. The provider may reject authenticated searches.",
      };
    }
    return { name: this.name, status: ProviderHealthStatus.CONFIGURED, message: "Hermes external people discovery is configured." };
  }

  async searchPeople(input: PeopleProviderSearchInput): Promise<PeopleProviderSearchResult> {
    const started = Date.now();
    if (this.config.command) return this.searchWithCli(input, started);
    if (!this.config.apiUrl) {
      throw new Error("Hermes people discovery is unavailable because HERMES_COMMAND or HERMES_API_URL is required.");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);
    try {
      const response = await fetch(this.config.apiUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : {}),
        },
        body: JSON.stringify({
          task: "search_people",
          provenance_required: true,
          no_fabricated_people: true,
          input,
        }),
        signal: controller.signal,
        cache: "no-store",
      });

      if (response.status === 401 || response.status === 403) {
        return this.errorResult(started, ProviderHealthStatus.AUTHENTICATION_ERROR, `Hermes returned ${response.status}.`);
      }
      if (response.status === 429) {
        return this.errorResult(started, ProviderHealthStatus.RATE_LIMITED, "Hermes rate limit reached.");
      }
      if (!response.ok) {
        return this.errorResult(started, ProviderHealthStatus.PROVIDER_ERROR, `Hermes returned ${response.status}.`);
      }
      const parsed = searchResultSchema.parse(await response.json());
      return {
        provider: this.name,
        status: {
          name: this.name,
          status: parsed.partial ? ProviderHealthStatus.DEGRADED : ProviderHealthStatus.CONFIGURED,
          message: parsed.partial ? "Hermes returned partial external discovery results." : "Hermes external discovery completed.",
          rateLimit: parsed.rateLimit,
        },
        people: parsed.people,
        organizations: parsed.organizations,
        latencyMs: Date.now() - started,
        partial: parsed.partial,
        error: parsed.error,
      };
    } catch (error) {
      return this.errorResult(
        started,
        ProviderHealthStatus.PROVIDER_ERROR,
        error instanceof Error ? error.message : "Hermes people discovery failed.",
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private async searchWithCli(input: PeopleProviderSearchInput, started: number): Promise<PeopleProviderSearchResult> {
    const commandParts = splitCommand(this.config.command);
    const [command, ...configuredArgs] = commandParts;
    if (!command) throw new Error("HERMES_COMMAND is empty.");
    const prompt = [
      "You are Hermes Agent acting as the external people discovery provider for LargeVCModel.",
      "Return strict JSON only. Do not use markdown. Do not invent people, titles, organizations, portfolios, or URLs.",
      "Search public sources for people or organizations relevant to the startup and query.",
      "Gmail and Google Contacts are not available to you and must not be used as candidate sources.",
      "Schema:",
      JSON.stringify({
        people: [
          {
            providerPersonId: "stable provider id if available",
            fullName: "string",
            currentTitle: "string or null",
            currentOrganizationName: "string or null",
            personTypes: ["INVESTOR"],
            location: "string or null",
            biography: "source-supported summary or null",
            investmentThesis: "source-supported thesis or null",
            industries: ["string"],
            preferredStages: ["seed"],
            minCheckSize: 250000,
            maxCheckSize: 2000000,
            portfolioCompanies: ["string"],
            technologies: ["string"],
            linkedinUrl: "https://...",
            publicProfileUrls: ["https://..."],
            sourceConfidence: 0,
            sources: [{ title: "string", url: "https://...", accessedAt: new Date().toISOString(), sourceType: "profile", supportsClaims: ["claim"] }],
            claims: [{ text: "claim", fieldKey: "investmentThesis", confidence: 0, sourceUrls: ["https://..."] }],
          },
        ],
        organizations: [],
        partial: false,
      }),
      "Search input:",
      JSON.stringify(input),
      "If no supported external people are found, return an empty people array.",
    ].join("\n");

    try {
      const { stdout, stderr } = await execFileAsync(command, [...configuredArgs, prompt], {
        timeout: 120_000,
        maxBuffer: 1024 * 1024 * 8,
        env: process.env,
      });
      const jsonText = extractJson(stdout);
      if (!jsonText) {
        return this.errorResult(started, ProviderHealthStatus.PROVIDER_ERROR, `Hermes CLI did not return JSON.${stderr ? ` ${stderr.slice(0, 300)}` : ""}`);
      }
      const parsed = searchResultSchema.parse(JSON.parse(jsonText));
      return {
        provider: "hermes_cli",
        status: {
          name: "hermes_cli",
          status: parsed.partial ? ProviderHealthStatus.DEGRADED : ProviderHealthStatus.CONFIGURED,
          message: parsed.partial ? "Hermes CLI returned partial external discovery results." : "Hermes CLI external discovery completed.",
          rateLimit: parsed.rateLimit,
        },
        people: parsed.people,
        organizations: parsed.organizations,
        latencyMs: Date.now() - started,
        partial: parsed.partial,
        error: parsed.error,
      };
    } catch (error) {
      return this.errorResult(
        started,
        ProviderHealthStatus.PROVIDER_ERROR,
        error instanceof Error ? error.message : "Hermes CLI people discovery failed.",
      );
    }
  }

  private errorResult(started: number, status: ProviderHealthStatus, message: string): PeopleProviderSearchResult {
    return {
      provider: this.name,
      status: { name: this.name, status, message },
      people: [],
      organizations: [],
      latencyMs: Date.now() - started,
      partial: false,
      error: message,
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
