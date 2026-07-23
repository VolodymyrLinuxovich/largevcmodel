import "server-only";

import { PersonType, ProviderHealthStatus } from "@prisma/client";
import { z } from "zod";
import type { PeopleDiscoveryProvider } from "./provider";
import type { PeopleProviderSearchInput, PeopleProviderSearchResult, PeopleProviderStatus } from "./types";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

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
});

type OpenAIResponse = {
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
};

export class OpenAIPeopleDiscoveryProvider implements PeopleDiscoveryProvider {
  readonly name = "openai";

  constructor(private readonly config: { apiKey?: string; model?: string }) {}

  async status(): Promise<PeopleProviderStatus> {
    if (!this.config.apiKey) {
      return {
        name: this.name,
        status: ProviderHealthStatus.UNAVAILABLE,
        message: "OpenAI external people discovery is selected, but OPENAI_API_KEY is not configured.",
      };
    }
    return {
      name: this.name,
      status: ProviderHealthStatus.CONFIGURED,
      message: "OpenAI external people discovery is configured with web search and structured output.",
    };
  }

  async searchPeople(input: PeopleProviderSearchInput): Promise<PeopleProviderSearchResult> {
    const started = Date.now();
    if (!this.config.apiKey) {
      return this.errorResult(started, ProviderHealthStatus.UNAVAILABLE, "OPENAI_API_KEY is required for OpenAI people discovery.");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);
    try {
      const response = await fetch(OPENAI_RESPONSES_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model || "gpt-4o-mini",
          input: [
            {
              role: "system",
              content: [
                {
                  type: "input_text",
                  text: [
                    "You are an external public people discovery adapter for LargeVCModel.",
                    "Use web search. Return JSON only. Do not invent people, titles, organizations, portfolio companies, theses, email addresses, or URLs.",
                    "Every person must have at least one public source URL. Every factual claim must cite a returned source URL.",
                    "If a fact is not source-supported, leave that field empty and put the gap in a claim only if it is explicitly unavailable.",
                    "Gmail and Google Contacts are private enrichment layers and are not available to you.",
                  ].join(" "),
                },
              ],
            },
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: JSON.stringify({
                    query: input.query,
                    interpretedCriteria: input.interpreted,
                    startup: input.startup,
                    limit: input.limit,
                    requiredOutputShape: {
                      people: [
                        {
                          fullName: "string",
                          currentTitle: "string|null",
                          currentOrganizationName: "string|null",
                          personTypes: Object.values(PersonType),
                          location: "string|null",
                          biography: "string|null",
                          investmentThesis: "string|null",
                          industries: ["string"],
                          preferredStages: ["string"],
                          minCheckSize: "number|null",
                          maxCheckSize: "number|null",
                          portfolioCompanies: ["string"],
                          notableInvestments: ["string"],
                          technologies: ["string"],
                          linkedinUrl: "https://...|null",
                          publicProfileUrls: ["https://..."],
                          sourceConfidence: "0-100",
                          sources: [
                            {
                              title: "string",
                              url: "https://...",
                              publisher: "string|null",
                              publishedAt: "ISO date|null",
                              accessedAt: new Date().toISOString(),
                              sourceType: "profile|news|funding|database|company|other",
                              supportsClaims: ["exact supported claim"],
                              confidence: "0-100",
                            },
                          ],
                          claims: [{ text: "claim", fieldKey: "field name", confidence: "0-100", sourceUrls: ["https://..."] }],
                        },
                      ],
                      organizations: [],
                      partial: false,
                    },
                  }),
                },
              ],
            },
          ],
          tools: [
            {
              type: "web_search_preview",
              search_context_size: "medium",
              user_location: {
                type: "approximate",
                country: "US",
                region: "California",
                timezone: "America/Los_Angeles",
              },
            },
          ],
          text: {
            format: { type: "json_object" },
          },
          temperature: 0.2,
          store: false,
        }),
        signal: controller.signal,
        cache: "no-store",
      });

      if (response.status === 401 || response.status === 403) {
        return this.errorResult(started, ProviderHealthStatus.AUTHENTICATION_ERROR, `OpenAI returned ${response.status}.`);
      }
      if (response.status === 429) {
        return this.errorResult(started, ProviderHealthStatus.RATE_LIMITED, "OpenAI rate limit reached.");
      }
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        return this.errorResult(started, ProviderHealthStatus.PROVIDER_ERROR, `OpenAI returned ${response.status}.${body ? ` ${body.slice(0, 300)}` : ""}`);
      }

      const payload = (await response.json()) as OpenAIResponse;
      const text = extractOutputText(payload);
      if (!text) return this.errorResult(started, ProviderHealthStatus.PROVIDER_ERROR, "OpenAI did not return structured JSON text.");
      const parsed = searchResultSchema.parse(JSON.parse(text));
      const people = parsed.people.filter((person) => person.sources.length > 0 && claimsReferenceReturnedSources(person));
      return {
        provider: this.name,
        status: {
          name: this.name,
          status: people.length === parsed.people.length ? ProviderHealthStatus.CONFIGURED : ProviderHealthStatus.DEGRADED,
          message:
            people.length === parsed.people.length
              ? "OpenAI external discovery completed with source-bearing results."
              : "OpenAI returned some records without sufficient source support; unsupported records were discarded.",
        },
        people,
        organizations: parsed.organizations,
        latencyMs: Date.now() - started,
        partial: parsed.partial || people.length !== parsed.people.length,
        error: parsed.error,
      };
    } catch (error) {
      return this.errorResult(
        started,
        ProviderHealthStatus.PROVIDER_ERROR,
        error instanceof Error ? error.message : "OpenAI people discovery failed.",
      );
    } finally {
      clearTimeout(timeout);
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

function extractOutputText(response: OpenAIResponse) {
  if (response.output_text?.trim()) return response.output_text.trim();
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.text?.trim()) return content.text.trim();
    }
  }
  return null;
}

function claimsReferenceReturnedSources(person: z.infer<typeof personSchema>) {
  const sourceUrls = new Set(person.sources.map((source) => source.url));
  return person.claims.every((claim) => claim.sourceUrls.length === 0 || claim.sourceUrls.every((url) => sourceUrls.has(url)));
}
