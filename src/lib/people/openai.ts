import "server-only";

import { PersonType, ProviderHealthStatus } from "@prisma/client";
import { z } from "zod";
import type { PeopleDiscoveryProvider } from "./provider";
import {
  type PeopleProviderClaim,
  type PeopleProviderDiagnostics,
  type PeopleProviderOrganization,
  type PeopleProviderPerson,
  type PeopleProviderSearchInput,
  type PeopleProviderSearchResult,
  type PeopleProviderSource,
  type PeopleProviderStatus,
  type PeopleSearchRejection,
} from "./types";
import {
  expandGeographyTerms,
  expandIndustryTerms,
  expandStageTerms,
  isInvestmentPersonType,
  normalizePersonTypes,
  normalizeTerm,
  splitListInput,
} from "./search-taxonomy";
import { domainFromUrlOrEmail } from "./normalization";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-4o-mini";
const FALLBACK_TOOL_TYPES = ["web_search_preview", "web_search"] as const;

type OpenAIResponse = {
  status?: string;
  incomplete_details?: { reason?: string };
  output_text?: string;
  output?: Array<{
    type?: string;
    status?: string;
    action?: { type?: string; query?: string };
    content?: Array<{
      type?: string;
      text?: string;
      annotations?: Array<{ type?: string; url?: string; title?: string }>;
    }>;
  }>;
};

type JsonCallResult = {
  ok: boolean;
  json?: unknown;
  error?: string;
  status?: ProviderHealthStatus;
  diagnostics: PeopleProviderDiagnostics;
};

export type CandidateParseResult<T> = {
  values: T[];
  rejections: PeopleSearchRejection[];
  rawCount: number;
  validNames: number;
  validSourceUrls: number;
};

export type PeopleDiscoveryBatch = {
  label: string;
  researchQueries: string[];
  organizations: PeopleProviderOrganization[];
  targetPeople: number;
  excludedNames?: string[];
};

export class OpenAIPeopleDiscoveryProvider implements PeopleDiscoveryProvider {
  readonly name = "openai";

  constructor(private readonly config: { apiKey?: string; model?: string; webSearchToolType?: string }) {}

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
      message: "OpenAI external people discovery is configured. Web-search execution is verified during each search run.",
    };
  }

  async searchPeople(input: PeopleProviderSearchInput): Promise<PeopleProviderSearchResult> {
    const started = Date.now();
    if (!this.config.apiKey) {
      return this.errorResult(started, ProviderHealthStatus.UNAVAILABLE, "OPENAI_API_KEY is required for OpenAI people discovery.");
    }

    const researchQueries = buildPeopleResearchQueries(input);
    const organizationCall = await this.callOpenAIJson({
      stage: "organization_discovery",
      researchQueries,
      schema: organizationDiscoverySchema(),
      prompt: organizationDiscoveryPrompt(input, researchQueries),
      maxOutputTokens: 3500,
    });

    if (!organizationCall.ok && !organizationCall.diagnostics.webSearchExecuted) {
      return this.errorResult(
        started,
        organizationCall.status ?? ProviderHealthStatus.DEGRADED,
        organizationCall.error ?? "OpenAI did not execute web search for organization discovery.",
        organizationCall.diagnostics,
      );
    }

    const parsedOrganizations = parseOrganizations(organizationCall.json);
    const targetPeople = Math.min(15, Math.max(12, Math.ceil(input.limit * 0.75)));
    const minimumUniquePeople = Math.min(12, targetPeople);
    const longlistCall = await this.callOpenAIJson({
      stage: "person_discovery",
      researchQueries,
      schema: peopleDiscoverySchema(),
      prompt: peopleLonglistPrompt(input, researchQueries, targetPeople),
      maxOutputTokens: 9000,
    });
    const peopleCalls: JsonCallResult[] = [longlistCall];
    let parsedPeopleBeforeDedupe = combineParseResults(
      [longlistCall.ok ? parsePeople(longlistCall.json, parsedOrganizations.values, input) : parseCallFailure(longlistCall, "longlist discovery")],
    );
    let parsedPeople = dedupeProviderPeople(parsedPeopleBeforeDedupe);

    if (parsedPeople.values.length < minimumUniquePeople) {
      const peopleBatches = buildPeopleDiscoveryBatches(input, researchQueries, parsedOrganizations.values, targetPeople).map((batch) => ({
        ...batch,
        excludedNames: parsedPeople.values.map((person) => person.fullName),
      }));
      const batchCalls = await Promise.all(
        peopleBatches.map((batch) =>
          this.callOpenAIJson({
            stage: "person_discovery",
            researchQueries: batch.researchQueries,
            schema: peopleDiscoverySchema(),
            prompt: peopleDiscoveryPrompt(input, batch),
            maxOutputTokens: 7000,
          }),
        ),
      );
      peopleCalls.push(...batchCalls);
      parsedPeopleBeforeDedupe = combineParseResults([
        parsedPeopleBeforeDedupe,
        ...batchCalls.map((call, index) =>
          call.ok
            ? parsePeople(call.json, parsedOrganizations.values, input)
            : parseCallFailure(call, peopleBatches[index]?.label ?? `person_batch_${index + 1}`),
        ),
      ]);
      parsedPeople = dedupeProviderPeople(parsedPeopleBeforeDedupe);
    }

    for (let pass = 1; parsedPeople.values.length < minimumUniquePeople && pass <= 2; pass += 1) {
      const expansionBatch = buildBreadthExpansionBatch(input, researchQueries, parsedOrganizations.values, parsedPeople.values, minimumUniquePeople - parsedPeople.values.length, pass);
      const expansionCall = await this.callOpenAIJson({
        stage: "person_discovery",
        researchQueries: expansionBatch.researchQueries,
        schema: peopleDiscoverySchema(),
        prompt: peopleDiscoveryPrompt(input, expansionBatch),
        maxOutputTokens: 9000,
      });
      peopleCalls.push(expansionCall);
      const parsedExpansion = expansionCall.ok
        ? parsePeople(expansionCall.json, parsedOrganizations.values, input)
        : parseCallFailure(expansionCall, expansionBatch.label);
      parsedPeopleBeforeDedupe = combineParseResults([parsedPeopleBeforeDedupe, parsedExpansion]);
      parsedPeople = dedupeProviderPeople(parsedPeopleBeforeDedupe);
    }

    const anyPeopleWebSearch = peopleCalls.some((call) => call.diagnostics.webSearchExecuted);
    if (!anyPeopleWebSearch) {
      return this.errorResult(
        started,
        firstProviderErrorStatus(peopleCalls) ?? ProviderHealthStatus.DEGRADED,
        firstProviderError(peopleCalls) ?? "OpenAI did not execute web search for person discovery.",
        mergeProviderDiagnostics(organizationCall.diagnostics, combineCallDiagnostics(peopleCalls), parsedOrganizations, emptyParseResult<PeopleProviderPerson>()),
      );
    }

    const peopleDiagnostics = combineCallDiagnostics(peopleCalls);
    const diagnostics = mergeProviderDiagnostics(organizationCall.diagnostics, peopleDiagnostics, parsedOrganizations, parsedPeopleBeforeDedupe);
    diagnostics.requestDurationMs = Date.now() - started;

    const allRejections = [...parsedOrganizations.rejections, ...parsedPeopleBeforeDedupe.rejections, ...parsedPeople.rejections];
    const status = providerStatusForParsedResult({
      diagnostics,
      peopleCount: parsedPeople.values.length,
      hadProviderError: Boolean(organizationCall.error || peopleCalls.some((call) => call.error)),
    });

    return {
      provider: this.name,
      status,
      people: parsedPeople.values,
      organizations: parsedOrganizations.values,
      latencyMs: Date.now() - started,
      partial: Boolean(organizationCall.error || peopleCalls.some((call) => call.error) || allRejections.length),
      error: parsedPeople.values.length ? organizationCall.error ?? firstProviderError(peopleCalls) : firstProviderError(peopleCalls) ?? organizationCall.error,
      diagnostics: { ...diagnostics, rejectedCandidates: allRejections },
    };
  }

  private async callOpenAIJson(input: {
    stage: "organization_discovery" | "person_discovery";
    researchQueries: string[];
    schema: Record<string, unknown>;
    prompt: string;
    maxOutputTokens: number;
  }): Promise<JsonCallResult> {
    const stageStarted = Date.now();
    const model = this.config.model || DEFAULT_MODEL;
    const toolTypes = preferredToolTypes(this.config.webSearchToolType);
    let lastError = "";
    let lastStatus: ProviderHealthStatus = ProviderHealthStatus.PROVIDER_ERROR;
    let lastDiagnostics = baseProviderDiagnostics(input.stage, model, toolTypes[0], input.researchQueries, stageStarted);

    for (const toolType of toolTypes) {
      const diagnostics = baseProviderDiagnostics(input.stage, model, toolType, input.researchQueries, stageStarted);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 55_000);
      try {
        const response = await fetch(OPENAI_RESPONSES_URL, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify({
            model,
            input: [
              {
                role: "system",
                content: [
                  {
                    type: "input_text",
                    text: systemPromptForStage(input.stage),
                  },
                ],
              },
              {
                role: "user",
                content: [{ type: "input_text", text: input.prompt }],
              },
            ],
            tools: [
              {
                type: toolType,
                search_context_size: "high",
                user_location: {
                  type: "approximate",
                  country: "US",
                  region: "California",
                  timezone: "America/Los_Angeles",
                },
              },
            ],
            tool_choice: "required",
            text: {
              format: {
                type: "json_schema",
                name: `largevcmodel_${input.stage}`,
                strict: false,
                schema: input.schema,
              },
            },
            max_output_tokens: input.maxOutputTokens,
            store: false,
          }),
          signal: controller.signal,
          cache: "no-store",
        });
        clearTimeout(timeout);

        if (response.status === 401 || response.status === 403) {
          return { ok: false, error: `OpenAI returned ${response.status}.`, status: ProviderHealthStatus.AUTHENTICATION_ERROR, diagnostics };
        }
        if (response.status === 429) {
          return { ok: false, error: "OpenAI rate limit reached.", status: ProviderHealthStatus.RATE_LIMITED, diagnostics };
        }
        if (!response.ok) {
          const body = await response.text().catch(() => "");
          lastError = `OpenAI returned ${response.status}.${body ? ` ${safeProviderError(body)}` : ""}`;
          lastStatus = response.status === 400 && /tool|web_search|schema|format/i.test(body) ? ProviderHealthStatus.DEGRADED : ProviderHealthStatus.PROVIDER_ERROR;
          lastDiagnostics = diagnostics;
          continue;
        }

        const payload = (await response.json()) as OpenAIResponse;
        const responseDiagnostics = summarizeOpenAIResponse(payload, diagnostics, stageStarted);
        if (!responseDiagnostics.webSearchExecuted) {
          return {
            ok: false,
            error: "OpenAI response did not include a web_search_call, so sourced discovery was not accepted.",
            status: ProviderHealthStatus.DEGRADED,
            diagnostics: responseDiagnostics,
          };
        }
        if (payload.status === "incomplete") {
          return {
            ok: false,
            error: `OpenAI response was incomplete${payload.incomplete_details?.reason ? `: ${payload.incomplete_details.reason}` : "."}`,
            status: ProviderHealthStatus.DEGRADED,
            diagnostics: responseDiagnostics,
          };
        }
        const text = extractOutputText(payload);
        if (!text) {
          return {
            ok: false,
            error: "OpenAI executed web search but did not return structured JSON text.",
            status: ProviderHealthStatus.PROVIDER_ERROR,
            diagnostics: responseDiagnostics,
          };
        }
        const parsed = parseJsonText(text);
        if (!parsed.ok) {
          return {
            ok: false,
            error: parsed.error,
            status: ProviderHealthStatus.PROVIDER_ERROR,
            diagnostics: responseDiagnostics,
          };
        }
        return { ok: true, json: parsed.value, diagnostics: responseDiagnostics };
      } catch (error) {
        clearTimeout(timeout);
        lastError = error instanceof Error && error.name === "AbortError" ? "OpenAI people discovery timed out." : error instanceof Error ? error.message : "OpenAI people discovery failed.";
        lastStatus = error instanceof Error && error.name === "AbortError" ? ProviderHealthStatus.DEGRADED : ProviderHealthStatus.PROVIDER_ERROR;
        lastDiagnostics = diagnostics;
      }
    }

    return { ok: false, error: lastError || "OpenAI people discovery failed.", status: lastStatus, diagnostics: lastDiagnostics };
  }

  private errorResult(started: number, status: ProviderHealthStatus, message: string, diagnostics?: PeopleProviderDiagnostics): PeopleProviderSearchResult {
    return {
      provider: this.name,
      status: { name: this.name, status, message },
      people: [],
      organizations: [],
      latencyMs: Date.now() - started,
      partial: false,
      error: message,
      diagnostics,
    };
  }
}

export function buildPeopleResearchQueries(input: PeopleProviderSearchInput) {
  const interpreted = input.interpreted;
  const industries = expandIndustryTerms([...interpreted.industries, ...input.startup.subIndustries, input.startup.industry ?? ""]).slice(0, 12);
  const stages = expandStageTerms([...interpreted.stages, input.startup.fundingStage ?? ""]).slice(0, 8);
  const geographies = expandGeographyTerms([...interpreted.locations, ...interpreted.geographyPreferences, ...input.startup.targetGeographies]).slice(0, 12);
  const technologies = expandIndustryTerms([...interpreted.technologyKeywords, ...input.startup.technologies, ...input.startup.keywords]).slice(0, 12);
  const role = interpreted.personTypes.includes(PersonType.INVESTOR) ? "investors" : interpreted.personTypes.map((type) => type.toLowerCase().replaceAll("_", " ")).join(" ");
  const primaryIndustry = industries.find(Boolean) ?? "venture";
  const primaryStage = stages.find(Boolean) ?? "early stage";
  const primaryGeography = geographies.find(Boolean) ?? "global";

  return uniqueStrings([
    input.query,
    `${primaryGeography} ${primaryStage} ${primaryIndustry} ${role}`.trim(),
    `${primaryGeography} dual-use venture capital seed`,
    `defense tech VC portfolio seed ${primaryGeography}`,
    `defence technology investors ${primaryGeography} early stage`,
    `national security software venture fund ${primaryGeography}`,
    `military AI startup investors ${primaryGeography}`,
    `autonomous systems robotics defense investors ${primaryGeography}`,
    `geospatial intelligence battlefield software investors ${primaryGeography}`,
    `${technologies.slice(0, 4).join(" ")} ${primaryStage} investors ${primaryGeography}`.trim(),
  ]).slice(0, 10);
}

export function buildPeopleDiscoveryBatchesForTest(input: PeopleProviderSearchInput, organizations: PeopleProviderOrganization[] = []) {
  const researchQueries = buildPeopleResearchQueries(input);
  const targetPeople = Math.min(15, Math.max(12, Math.ceil(input.limit * 0.75)));
  return buildPeopleDiscoveryBatches(input, researchQueries, organizations, targetPeople);
}

export function parsePeopleDiscoveryJsonForTest(json: unknown, input: PeopleProviderSearchInput) {
  return parsePeople(json, [], input);
}

export function dedupeProviderPeopleForTest(result: CandidateParseResult<PeopleProviderPerson>) {
  return dedupeProviderPeople(result);
}

export function summarizeOpenAIResponseForTest(response: OpenAIResponse) {
  const started = Date.now();
  return summarizeOpenAIResponse(response, baseProviderDiagnostics("person_discovery", DEFAULT_MODEL, "web_search_preview", [], started), started);
}

function organizationDiscoveryPrompt(input: PeopleProviderSearchInput, researchQueries: string[]) {
  const targetOrganizations = Math.min(24, Math.max(12, Math.ceil(input.limit * 0.5)));
  return JSON.stringify({
    task: "Stage B: discover relevant venture firms, funds, accelerators, and investment organizations first.",
    startup: input.startup,
    interpretedCriteria: input.interpreted,
    researchQueries,
    targetOrganizationCount: targetOrganizations,
    instructions: [
      "Search public web sources for organizations matching the criteria.",
      "Prefer organizations with evidence of defense/defence tech, dual-use, national security, AI, autonomy, robotics, geospatial intelligence, or related portfolios.",
      `Return ${targetOrganizations} distinct organizations when public sources support them. Do not stop after the first good match.`,
      "Use different terminology variants from the research queries so narrow public wording does not collapse the result set.",
      "Return only organizations with source URLs. Unknown check size or stage is allowed as null or empty.",
    ],
    output: {
      organizations: [
        {
          name: "string",
          type: "venture firm|fund|accelerator|organization|null",
          website: "url|null",
          domain: "string|null",
          description: "string|null",
          location: "string|null",
          industries: ["string"],
          investmentStages: ["string"],
          minCheckSize: "number|null",
          maxCheckSize: "number|null",
          portfolio: ["string"],
          publicUrls: ["url"],
          sources: [{ title: "string", url: "url", publisher: "string|null", supportsClaims: ["claim"] }],
          claims: [{ text: "claim", fieldKey: "field", sourceUrls: ["url"], confidence: 0 }],
        },
      ],
      partial: false,
      error: "string|null",
    },
  });
}

function systemPromptForStage(stage: "organization_discovery" | "person_discovery") {
  if (stage === "person_discovery") {
    return [
      "You are a public-source people longlist discovery system for LargeVCModel.",
      "You must use the web search tool before answering.",
      "Return JSON only.",
      "Build a broad longlist, not a best single answer.",
      "Every returned person must be a real human with a public source URL supporting identity, role, or organization.",
      "Do not invent people, titles, organizations, portfolios, check sizes, theses, or URLs.",
      "Unknown fit fields are allowed and should be null or empty.",
      "Use public sources only. Gmail and Google Contacts are unavailable and only run later as private relationship enrichment.",
      "Do not repeat people.",
    ].join(" ");
  }

  return [
    "You are a source-grounded external organization discovery adapter for LargeVCModel.",
    "You must use the web search tool before answering.",
    "Return JSON only.",
    "Do not invent organizations, investment stages, check sizes, portfolios, or URLs.",
    "Use public sources only. Unknown data is acceptable.",
    "Every returned organization must include public source URLs that support identity or fit evidence.",
  ].join(" ");
}

function peopleLonglistPrompt(input: PeopleProviderSearchInput, researchQueries: string[], targetPeople: number) {
  const profileless = input.startup.id === "search-context";
  const longlistCriteria = profileless
    ? {
        personTypes: input.interpreted.personTypes,
        industries: input.interpreted.industries,
        stages: input.interpreted.stages,
        locations: input.interpreted.locations,
        geographyPreferences: input.interpreted.geographyPreferences,
        organizations: input.interpreted.organizations,
        titles: input.interpreted.titles,
        portfolioKeywords: input.interpreted.portfolioKeywords,
        technologyKeywords: input.interpreted.technologyKeywords,
        relationshipRequirements: input.interpreted.relationshipRequirements,
        warmIntroductionPreference: input.interpreted.warmIntroductionPreference,
      }
    : input.interpreted;
  return JSON.stringify({
    task: "Build a longlist, not a best single answer.",
    startupContext: profileless ? null : input.startup,
    interpretedCriteria: longlistCriteria,
    researchQueries: profileless ? researchQueries.filter((query) => query !== input.query) : researchQueries,
    targetPeopleCount: targetPeople,
    instructions: [
      `Find ${targetPeople} distinct European investment professionals who invest in defense technology, dual-use, miltech, national security software, AI, autonomy, robotics, aerospace/defense, geospatial intelligence, or military software at seed, pre-seed, early-stage, or pre-Series A when those criteria are requested.`,
      "When the user asks a broader non-investor query, adapt the same longlist behavior to the requested person type, sector, geography, and role.",
      "For investor searches, include partners, general partners, managing partners, principals, investment directors, investment managers, venture partners, angel investors, and fund managers.",
      "Use public web search broadly across firm team pages, fund profile pages, portfolio pages, interviews, public databases, and credible news sources.",
      "Use terminology variants: defense tech, defence tech, miltech, national security, dual-use, aerospace and defense, autonomy, robotics, geospatial intelligence, AI, and military software.",
      "Every person must have a real full name, current investment-related role, current organization, and at least one public source URL supporting identity or role.",
      "Do not stop at one result. Do not repeat a person. Unknown check size, personal thesis, education, or biography is allowed.",
      "Return thinner source-backed profiles rather than omitting useful partial matches.",
    ],
    output: {
      people: [
        {
          fullName: "string",
          title: "string",
          organization: "string",
          location: "string|null",
          sourceUrls: ["url"],
          optionalSourceSupportedFields: {
            industries: ["string"],
            preferredStages: ["string"],
            geographyPreferences: ["string"],
            portfolioCompanies: ["string"],
            investmentThesis: "string|null",
          },
        },
      ],
    },
  });
}

function buildPeopleDiscoveryBatches(
  input: PeopleProviderSearchInput,
  researchQueries: string[],
  organizations: PeopleProviderOrganization[],
  targetPeople: number,
): PeopleDiscoveryBatch[] {
  const batchCount = targetPeople > 18 ? 4 : 3;
  const targetPerBatch = Math.max(4, Math.ceil(targetPeople / batchCount));
  const organizationGroups = chunkArray(organizations, Math.max(4, Math.ceil(Math.max(organizations.length, 1) / batchCount)));
  const interpreted = input.interpreted;
  const geography = expandGeographyTerms([...interpreted.locations, ...interpreted.geographyPreferences, ...input.startup.targetGeographies]).slice(0, 6).join(" ") || "global";
  const industry = expandIndustryTerms([...interpreted.industries, ...input.startup.subIndustries, input.startup.industry ?? ""]).slice(0, 8).join(" ") || "technology";
  const stage = expandStageTerms([...interpreted.stages, input.startup.fundingStage ?? ""]).slice(0, 5).join(" ") || "early stage";

  const groups = [
    {
      label: "core investment-role discovery",
      queries: [
        input.query,
        `${geography} ${stage} ${industry} investors partners venture capital`,
        researchQueries[1],
        researchQueries[2],
      ],
    },
    {
      label: "dual-use and national-security discovery",
      queries: [
        `European dual-use venture capital partners seed defense AI`,
        `national security software VC partners Europe`,
        `defence technology fund partners Europe early stage`,
        researchQueries[3],
        researchQueries[4],
      ],
    },
    {
      label: "autonomy robotics and geospatial discovery",
      queries: [
        `autonomous systems robotics defense investors Europe partners`,
        `military AI geospatial intelligence venture investors Europe`,
        `unmanned systems defense tech VC Europe seed partners`,
        researchQueries[5],
        researchQueries[6],
      ],
    },
    {
      label: "adjacent aerospace and security software discovery",
      queries: [
        `aerospace defense AI venture capital Europe early stage partners`,
        `security software national resilience dual use VC Europe seed`,
        `frontier technology defense venture investors Europe partners`,
        researchQueries[7],
        researchQueries[8],
      ],
    },
  ];

  return groups.slice(0, batchCount).map((group, index) => ({
    label: group.label,
    researchQueries: uniqueStrings(group.queries),
    organizations: organizationGroups[index]?.length ? organizationGroups[index] : organizations,
    targetPeople: targetPerBatch,
  }));
}

function buildBreadthExpansionBatch(
  input: PeopleProviderSearchInput,
  researchQueries: string[],
  organizations: PeopleProviderOrganization[],
  existingPeople: PeopleProviderPerson[],
  missingCount: number,
  pass: number,
): PeopleDiscoveryBatch {
  const interpreted = input.interpreted;
  const geography = expandGeographyTerms([...interpreted.locations, ...interpreted.geographyPreferences, ...input.startup.targetGeographies]).slice(0, 8).join(" ") || "global";
  const industry = expandIndustryTerms([...interpreted.industries, ...input.startup.subIndustries, input.startup.industry ?? ""]).slice(0, 10).join(" ") || "technology";
  const stage = expandStageTerms([...interpreted.stages, input.startup.fundingStage ?? ""]).slice(0, 6).join(" ") || "early stage";
  const excludedNames = uniqueStrings(existingPeople.map((person) => person.fullName));
  const expansionQueries =
    pass === 1
      ? [
          `list of European defense technology venture capital partners seed AI`,
          `dual-use national security VC partners early stage Europe`,
          `defence tech fund team partners AI autonomy Europe`,
          `seed investors defense AI Europe venture partner principal`,
        ]
      : [
          `European venture funds investing in miltech AI team partner principal`,
          `defense autonomy robotics VC partners Europe seed pre-seed`,
          `national security software investors Europe early stage team`,
          `geospatial intelligence defense technology venture capital Europe partner`,
        ];

  return {
    label: `breadth expansion pass ${pass}`,
    researchQueries: uniqueStrings([
      ...expansionQueries,
      `${geography} ${stage} ${industry} investment partner venture capital`,
      ...researchQueries.slice(pass, pass + 3),
    ]),
    organizations,
    targetPeople: Math.min(12, Math.max(6, missingCount + 4)),
    excludedNames,
  };
}

function peopleDiscoveryPrompt(input: PeopleProviderSearchInput, batch: PeopleDiscoveryBatch) {
  return JSON.stringify({
    task: `Stage C and D: ${batch.label}. Identify actual investment professionals at supported organizations, then verify profile facts with public sources.`,
    startup: input.startup,
    interpretedCriteria: input.interpreted,
    researchQueries: batch.researchQueries,
    targetPeopleCount: batch.targetPeople,
    excludedAlreadyReturnedNames: batch.excludedNames ?? [],
    discoveredOrganizations: batch.organizations.slice(0, 16).map((organization) => ({
      name: organization.name,
      website: organization.website,
      location: organization.location,
      industries: organization.industries,
      investmentStages: organization.investmentStages,
      portfolio: organization.portfolio,
      publicUrls: organization.publicUrls,
    })),
    instructions: [
      "Find actual people: partner, general partner, managing partner, principal, investment director, investor, venture partner, or similar investment roles.",
      "Use organization team pages, portfolio pages, credible databases, interviews, or news sources.",
      `Return at least ${batch.targetPeople} distinct people for this batch when public sources support them. Do not stop after one strong candidate.`,
      "Cover multiple organizations and multiple query variants. If the supplied organization list is sparse, discover additional relevant organizations through web search before naming people.",
      batch.excludedNames?.length ? `Do not return these already discovered names: ${batch.excludedNames.join(", ")}.` : "Avoid duplicate people across organizations and source paths.",
      "Prefer breadth plus source-backed partial profiles over one complete profile. Missing check size, thesis, education, or biography is acceptable.",
      "Minimum returned person: real full name, investment-related role, current organization, and at least one public source URL supporting identity or role.",
      "Do not require check size, personal thesis, education, or complete biography. Leave unknown fields null or empty.",
      "For organization-level fit evidence, cite organization sources and mark person-specific unknowns as missing by leaving fields empty.",
    ],
    output: {
      people: [
        {
          fullName: "string",
          currentTitle: "string|null",
          currentOrganizationName: "string|null",
          personTypes: ["INVESTOR"],
          location: "string|null",
          biography: "string|null",
          investmentThesis: "string|null",
          industries: ["string"],
          subIndustries: ["string"],
          preferredStages: ["string"],
          minCheckSize: "number|null",
          maxCheckSize: "number|null",
          geographyPreferences: ["string"],
          portfolioCompanies: ["string"],
          notableInvestments: ["string"],
          notableExperience: "string|null",
          technologies: ["string"],
          linkedinUrl: "url|null",
          personalWebsite: "url|null",
          publicProfileUrls: ["url"],
          sourceConfidence: 0,
          sources: [{ title: "string", url: "url", publisher: "string|null", supportsClaims: ["claim"] }],
          claims: [{ text: "claim", fieldKey: "field", sourceUrls: ["url"], confidence: 0 }],
        },
      ],
      organizations: [],
      partial: false,
      error: "string|null",
    },
  });
}

function organizationDiscoverySchema() {
  return {
    type: "object",
    properties: {
      organizations: { type: "array", items: { type: "object", additionalProperties: true } },
      partial: { type: "boolean" },
      error: { type: ["string", "null"] },
    },
    additionalProperties: true,
  };
}

function peopleDiscoverySchema() {
  return {
    type: "object",
    properties: {
      people: { type: "array", items: { type: "object", additionalProperties: true } },
      candidates: { type: "array", items: { type: "object", additionalProperties: true } },
      organizations: { type: "array", items: { type: "object", additionalProperties: true } },
      partial: { type: "boolean" },
      error: { type: ["string", "null"] },
    },
    additionalProperties: true,
  };
}

function parseOrganizations(json: unknown): CandidateParseResult<PeopleProviderOrganization> {
  const root = z.object({ organizations: z.array(z.unknown()).default([]) }).passthrough().safeParse(json);
  const raw = root.success ? root.data.organizations : [];
  const values: PeopleProviderOrganization[] = [];
  const rejections: PeopleSearchRejection[] = [];
  let validSourceUrls = 0;

  raw.forEach((candidate, index) => {
    const organization = normalizeRawOrganization(candidate);
    if (!organization.name) {
      rejections.push({ candidate: `organization:${index}`, rejectedAt: "organizationNormalization", reasons: ["invalid_organization_name"] });
      return;
    }
    if (!(organization.sources ?? []).length && !(organization.publicUrls ?? []).length) {
      rejections.push({ candidate: organization.name, rejectedAt: "sourceValidation", reasons: ["no_valid_public_sources"] });
      return;
    }
    validSourceUrls += 1;
    values.push(organization as PeopleProviderOrganization);
  });

  return { values, rejections, rawCount: raw.length, validNames: values.length, validSourceUrls };
}

function parsePeople(json: unknown, organizations: PeopleProviderOrganization[], input: PeopleProviderSearchInput): CandidateParseResult<PeopleProviderPerson> {
  const root = z.object({ people: z.array(z.unknown()).default([]), candidates: z.array(z.unknown()).default([]) }).passthrough().safeParse(json);
  const raw = root.success ? [...root.data.people, ...root.data.candidates] : [];
  const organizationByName = new Map(organizations.map((organization) => [normalizeTerm(organization.name), organization]));
  const values: PeopleProviderPerson[] = [];
  const rejections: PeopleSearchRejection[] = [];
  let validNames = 0;
  let validSourceUrls = 0;

  raw.forEach((candidate, index) => {
    const person = normalizeRawPerson(candidate, organizationByName);
    const displayName = person.fullName || `candidate:${index}`;
    const reasons: string[] = [];
    if (!person.fullName) reasons.push("invalid_full_name");
    else validNames += 1;
    if (!person.currentTitle) reasons.push("missing_current_investment_role");
    if (!person.currentOrganizationName) reasons.push("missing_current_organization");
    if (!(person.sources ?? []).length) reasons.push("no_valid_public_sources");
    else validSourceUrls += 1;
    if (input.interpreted.personTypes.includes(PersonType.INVESTOR) && !isInvestmentPersonType(person.personTypes ?? [], person.currentTitle)) {
      reasons.push("incompatible_person_type");
    }
    if (reasons.length) {
      rejections.push({ candidate: displayName, rejectedAt: "candidateValidation", reasons });
      return;
    }
    values.push(person as PeopleProviderPerson);
  });

  return { values, rejections, rawCount: raw.length, validNames, validSourceUrls };
}

function normalizeRawPerson(raw: unknown, organizationByName: Map<string, PeopleProviderOrganization>): Partial<PeopleProviderPerson> {
  const data = objectRecord(raw);
  const optionalFields = objectRecord(data.optionalSourceSupportedFields);
  const rawOrganization = objectRecord(data.currentOrganization ?? data.organization);
  const organizationName = stringValue(data.currentOrganizationName ?? data.organizationName ?? data.firm ?? data.fund ?? rawOrganization.name ?? (typeof data.organization === "string" ? data.organization : null));
  const currentOrganization = organizationName ? organizationByName.get(normalizeTerm(organizationName)) ?? normalizeRawOrganization(rawOrganization.name ? rawOrganization : { name: organizationName }) : null;
  const currentTitle = stringValue(data.currentTitle ?? data.title ?? data.role);
  const explicitTypes = normalizePersonTypes(data.personTypes ?? data.personType ?? data.type);
  const personTypes = explicitTypes.length ? explicitTypes : isInvestmentPersonType([], currentTitle) ? [PersonType.INVESTOR] : [];
  const claims = normalizeClaims(data.claims);
  const publicProfileUrls = validUrls([...(stringArray(data.publicProfileUrls) ?? []), ...(stringArray(data.sourceUrls) ?? []), stringValue(data.linkedinUrl), stringValue(data.personalWebsite)].filter(Boolean) as string[]);
  const rawSourceInput = Array.isArray(data.sources) && data.sources.length ? data.sources : data.sourceUrls;
  const sources = normalizeSources(rawSourceInput, claims, publicProfileUrls);
  const sourceConfidence = numberValue(data.sourceConfidence) ?? sourceConfidenceFromEvidence(sources, claims);

  return {
    providerPersonId: stringValue(data.providerPersonId),
    fullName: stringValue(data.fullName ?? data.name) ?? "",
    firstName: stringValue(data.firstName),
    lastName: stringValue(data.lastName),
    currentTitle,
    currentOrganization: currentOrganization?.name ? currentOrganization : null,
    currentOrganizationName: organizationName,
    previousOrganizations: stringArray(data.previousOrganizations),
    personTypes,
    location: stringValue(data.location),
    biography: stringValue(data.biography ?? data.bio),
    investmentThesis: stringValue(data.investmentThesis ?? data.thesis ?? optionalFields.investmentThesis),
    industries: uniqueStrings(expandIndustryTerms(stringArray(data.industries ?? optionalFields.industries))),
    subIndustries: uniqueStrings(expandIndustryTerms(stringArray(data.subIndustries ?? optionalFields.subIndustries))),
    preferredStages: uniqueStrings(expandStageTerms(stringArray(data.preferredStages ?? data.stages ?? optionalFields.preferredStages ?? optionalFields.stages))),
    minCheckSize: moneyValue(data.minCheckSize ?? objectRecord(data.checkSize).min),
    maxCheckSize: moneyValue(data.maxCheckSize ?? objectRecord(data.checkSize).max),
    geographyPreferences: uniqueStrings(expandGeographyTerms(stringArray(data.geographyPreferences ?? data.geographies ?? optionalFields.geographyPreferences ?? optionalFields.geographies))),
    portfolioCompanies: stringArray(data.portfolioCompanies ?? data.portfolio ?? optionalFields.portfolioCompanies ?? optionalFields.portfolio),
    notableInvestments: stringArray(data.notableInvestments),
    notableExperience: stringValue(data.notableExperience),
    education: stringArray(data.education),
    skills: stringArray(data.skills),
    keywords: uniqueStrings(expandIndustryTerms(stringArray(data.keywords))),
    technologies: uniqueStrings(expandIndustryTerms(stringArray(data.technologies))),
    emailAddresses: [],
    organizationDomain: stringValue(data.organizationDomain) ?? domainFromUrlOrEmail(currentOrganization?.website),
    linkedinUrl: validUrl(stringValue(data.linkedinUrl)),
    xUrl: validUrl(stringValue(data.xUrl ?? data.twitterUrl)),
    personalWebsite: validUrl(stringValue(data.personalWebsite ?? data.websiteUrl)),
    publicProfileUrls,
    sourceConfidence,
    fieldConfidence: numberRecord(data.fieldConfidence),
    conflictingClaims: stringArrayRecord(data.conflictingClaims),
    sources,
    claims,
  };
}

function normalizeRawOrganization(raw: unknown): PeopleProviderOrganization {
  const data = objectRecord(raw);
  const claims = normalizeClaims(data.claims);
  const publicUrls = validUrls(stringArray(data.publicUrls ?? data.profileUrls ?? data.sources));
  const sources = normalizeSources(data.sources, claims, publicUrls);
  const website = validUrl(stringValue(data.website ?? data.websiteUrl ?? data.url));
  return {
    providerOrgId: stringValue(data.providerOrgId),
    name: stringValue(data.name) ?? "",
    type: stringValue(data.type),
    website,
    domain: stringValue(data.domain) ?? domainFromUrlOrEmail(website),
    description: stringValue(data.description),
    location: stringValue(data.location),
    industries: uniqueStrings(expandIndustryTerms(stringArray(data.industries))),
    investmentStages: uniqueStrings(expandStageTerms(stringArray(data.investmentStages ?? data.stages))),
    minCheckSize: moneyValue(data.minCheckSize),
    maxCheckSize: moneyValue(data.maxCheckSize),
    portfolio: stringArray(data.portfolio ?? data.portfolioCompanies),
    publicUrls,
    sourceConfidence: numberValue(data.sourceConfidence) ?? sourceConfidenceFromEvidence(sources, claims),
    sources,
    claims,
  };
}

function normalizeSources(rawSources: unknown, claims: PeopleProviderClaim[], publicProfileUrls: string[]): PeopleProviderSource[] {
  const fromSources = Array.isArray(rawSources) ? rawSources : [];
  const sources = new Map<string, PeopleProviderSource>();
  const add = (source: Partial<PeopleProviderSource>) => {
    const url = validUrl(source.url);
    if (!url) return;
    sources.set(canonicalUrl(url), {
      title: stringValue(source.title) ?? domainFromUrlOrEmail(url) ?? url,
      url,
      publisher: stringValue(source.publisher),
      publishedAt: stringValue(source.publishedAt),
      accessedAt: stringValue(source.accessedAt) ?? new Date().toISOString(),
      snippet: stringValue(source.snippet),
      sourceType: stringValue(source.sourceType) ?? "other",
      supportsClaims: stringArray(source.supportsClaims),
      confidence: numberValue(source.confidence),
    });
  };

  for (const raw of fromSources) {
    if (typeof raw === "string") add({ url: raw, sourceType: "profile" });
    else add(objectRecord(raw) as Partial<PeopleProviderSource>);
  }
  for (const claim of claims) {
    for (const url of claim.sourceUrls) add({ url, sourceType: "other", supportsClaims: [claim.text], confidence: claim.confidence });
  }
  for (const url of publicProfileUrls) add({ url, sourceType: "profile", supportsClaims: ["Public profile source"], confidence: 70 });
  return Array.from(sources.values());
}

function normalizeClaims(rawClaims: unknown): PeopleProviderClaim[] {
  const raw = Array.isArray(rawClaims) ? rawClaims : [];
  return raw.flatMap((item) => {
    const claim = objectRecord(item);
    const text = stringValue(claim.text ?? claim.claim ?? claim.value);
    const sourceUrls = validUrls(stringArray(claim.sourceUrls ?? claim.sources ?? claim.urls));
    if (!text || !sourceUrls.length) return [];
    return [{
      text,
      fieldKey: stringValue(claim.fieldKey ?? claim.field),
      confidence: numberValue(claim.confidence),
      sourceUrls,
    }];
  });
}

function providerStatusForParsedResult(input: { diagnostics: PeopleProviderDiagnostics; peopleCount: number; hadProviderError: boolean }): PeopleProviderStatus {
  if (!input.diagnostics.webSearchExecuted) {
    return {
      name: "openai",
      status: ProviderHealthStatus.DEGRADED,
      message: "OpenAI is configured, but web search was not executed for this run.",
    };
  }
  if (input.peopleCount === 0) {
    return {
      name: "openai",
      status: ProviderHealthStatus.DEGRADED,
      message: "OpenAI web search executed, but no source-backed people survived identity and source validation.",
    };
  }
  return {
    name: "openai",
    status: input.hadProviderError || input.diagnostics.rejectedCandidates.length ? ProviderHealthStatus.DEGRADED : ProviderHealthStatus.CONFIGURED,
    message: input.hadProviderError
      ? "OpenAI web search returned partial source-backed people results."
      : "OpenAI web search completed with source-backed people results.",
  };
}

function summarizeOpenAIResponse(response: OpenAIResponse, diagnostics: PeopleProviderDiagnostics, started: number): PeopleProviderDiagnostics {
  const webSearchCalls = (response.output ?? []).filter((item) => item.type === "web_search_call");
  const citations = (response.output ?? []).flatMap((item) => item.content ?? []).flatMap((content) => content.annotations ?? []).filter((annotation) => annotation.type === "url_citation");
  return {
    ...diagnostics,
    webSearchExecuted: webSearchCalls.length > 0,
    webSearchCallCount: webSearchCalls.length,
    citationsCount: citations.length,
    requestDurationMs: Date.now() - started,
  };
}

function mergeProviderDiagnostics(
  organizationDiagnostics: PeopleProviderDiagnostics,
  peopleDiagnostics: PeopleProviderDiagnostics,
  organizations: CandidateParseResult<PeopleProviderOrganization>,
  people: CandidateParseResult<PeopleProviderPerson>,
): PeopleProviderDiagnostics {
  return {
    stage: "complete",
    model: peopleDiagnostics.model ?? organizationDiagnostics.model,
    toolType: peopleDiagnostics.toolType ?? organizationDiagnostics.toolType,
    webSearchExecuted: organizationDiagnostics.webSearchExecuted || peopleDiagnostics.webSearchExecuted,
    webSearchCallCount: organizationDiagnostics.webSearchCallCount + peopleDiagnostics.webSearchCallCount,
    citationsCount: (organizationDiagnostics.citationsCount ?? 0) + (peopleDiagnostics.citationsCount ?? 0),
    researchQueries: uniqueStrings([...organizationDiagnostics.researchQueries, ...peopleDiagnostics.researchQueries]),
    rawCandidateCount: organizations.rawCount + people.rawCount,
    parsedCandidateCount: organizations.values.length + people.values.length,
    candidatesWithValidNames: organizations.validNames + people.validNames,
    candidatesWithValidSourceUrls: organizations.validSourceUrls + people.validSourceUrls,
    rejectedCandidates: [...organizations.rejections, ...people.rejections],
    requestDurationMs: (organizationDiagnostics.requestDurationMs ?? 0) + (peopleDiagnostics.requestDurationMs ?? 0),
  };
}

function combineCallDiagnostics(calls: JsonCallResult[]): PeopleProviderDiagnostics {
  const first = calls[0]?.diagnostics ?? baseProviderDiagnostics("person_discovery", DEFAULT_MODEL, "web_search_preview", [], Date.now());
  return {
    stage: first.stage,
    model: first.model,
    toolType: first.toolType,
    webSearchExecuted: calls.some((call) => call.diagnostics.webSearchExecuted),
    webSearchCallCount: calls.reduce((sum, call) => sum + call.diagnostics.webSearchCallCount, 0),
    citationsCount: calls.reduce((sum, call) => sum + (call.diagnostics.citationsCount ?? 0), 0),
    researchQueries: uniqueStrings(calls.flatMap((call) => call.diagnostics.researchQueries)),
    rawCandidateCount: calls.reduce((sum, call) => sum + call.diagnostics.rawCandidateCount, 0),
    parsedCandidateCount: calls.reduce((sum, call) => sum + call.diagnostics.parsedCandidateCount, 0),
    candidatesWithValidNames: calls.reduce((sum, call) => sum + call.diagnostics.candidatesWithValidNames, 0),
    candidatesWithValidSourceUrls: calls.reduce((sum, call) => sum + call.diagnostics.candidatesWithValidSourceUrls, 0),
    rejectedCandidates: calls.flatMap((call) => call.diagnostics.rejectedCandidates),
    requestDurationMs: calls.reduce((sum, call) => sum + (call.diagnostics.requestDurationMs ?? 0), 0),
  };
}

function baseProviderDiagnostics(stage: string, model: string, toolType: string, researchQueries: string[], started: number): PeopleProviderDiagnostics {
  return {
    stage,
    model,
    toolType,
    webSearchExecuted: false,
    webSearchCallCount: 0,
    researchQueries,
    rawCandidateCount: 0,
    parsedCandidateCount: 0,
    candidatesWithValidNames: 0,
    candidatesWithValidSourceUrls: 0,
    rejectedCandidates: [],
    requestDurationMs: Date.now() - started,
  };
}

function combineParseResults<T>(results: Array<CandidateParseResult<T>>): CandidateParseResult<T> {
  return {
    values: results.flatMap((result) => result.values),
    rejections: results.flatMap((result) => result.rejections),
    rawCount: results.reduce((sum, result) => sum + result.rawCount, 0),
    validNames: results.reduce((sum, result) => sum + result.validNames, 0),
    validSourceUrls: results.reduce((sum, result) => sum + result.validSourceUrls, 0),
  };
}

function parseCallFailure(call: JsonCallResult, label: string): CandidateParseResult<PeopleProviderPerson> {
  return {
    values: [],
    rejections: [
      {
        candidate: label,
        rejectedAt: "providerBatch",
        reasons: [call.error ?? "provider_batch_failed"],
      },
    ],
    rawCount: 0,
    validNames: 0,
    validSourceUrls: 0,
  };
}

function dedupeProviderPeople(result: CandidateParseResult<PeopleProviderPerson>): CandidateParseResult<PeopleProviderPerson> {
  const values: PeopleProviderPerson[] = [];
  const rejections: PeopleSearchRejection[] = [];
  const seen = new Set<string>();
  for (const person of result.values) {
    const key = providerPersonKey(person);
    if (seen.has(key)) {
      rejections.push({
        candidate: person.fullName,
        rejectedAt: "providerDeduplication",
        reasons: ["duplicate_identity"],
      });
      continue;
    }
    seen.add(key);
    values.push(person);
  }
  return {
    values,
    rejections,
    rawCount: result.rawCount,
    validNames: result.validNames,
    validSourceUrls: result.validSourceUrls,
  };
}

function providerPersonKey(person: PeopleProviderPerson) {
  const name = normalizeTerm(person.fullName);
  const organization = normalizeTerm(person.currentOrganizationName ?? "");
  const linkedin = person.linkedinUrl ? canonicalUrl(person.linkedinUrl) : "";
  return [name, organization, linkedin].filter(Boolean).join("|");
}

function firstProviderError(calls: JsonCallResult[]) {
  return calls.find((call) => call.error)?.error;
}

function firstProviderErrorStatus(calls: JsonCallResult[]) {
  return calls.find((call) => call.status)?.status;
}

function chunkArray<T>(values: T[], size: number) {
  if (!values.length) return [];
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size));
  return chunks;
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

function parseJsonText(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  try {
    return { ok: true, value: JSON.parse(trimmed) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? `OpenAI structured output could not be parsed: ${error.message}` : "OpenAI structured output could not be parsed." };
  }
}

function preferredToolTypes(configured?: string) {
  const values = configured ? [configured, ...FALLBACK_TOOL_TYPES] : [...FALLBACK_TOOL_TYPES];
  return uniqueStrings(values).filter((value): value is (typeof FALLBACK_TOOL_TYPES)[number] => value === "web_search_preview" || value === "web_search");
}

function emptyParseResult<T>(): CandidateParseResult<T> {
  return { values: [], rejections: [], rawCount: 0, validNames: 0, validSourceUrls: 0 };
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function numberRecord(value: unknown): Record<string, number> {
  return Object.fromEntries(
    Object.entries(objectRecord(value))
      .map(([key, item]) => [key, numberValue(item)])
      .filter((entry): entry is [string, number] => typeof entry[1] === "number"),
  );
}

function stringArrayRecord(value: unknown): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(objectRecord(value))
      .map(([key, item]) => [key, stringArray(item)])
      .filter(([, items]) => items.length > 0),
  );
}

function stringValue(value: unknown) {
  if (typeof value !== "string") return null;
  const text = value.trim().replace(/\s+/g, " ");
  return text || null;
}

function stringArray(value: unknown) {
  return splitListInput(value).slice(0, 120);
}

function validUrl(value?: string | null) {
  if (!value) return null;
  try {
    return new URL(value).toString();
  } catch {
    try {
      return new URL(`https://${value}`).toString();
    } catch {
      return null;
    }
  }
}

function validUrls(values: string[]) {
  return uniqueStrings(values.map(validUrl).filter(Boolean) as string[]);
}

function canonicalUrl(url: string) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.search = "";
    parsed.hostname = parsed.hostname.replace(/^www\./, "").toLowerCase();
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return url.trim();
  }
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.min(100, Math.round(value)));
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/[%,$\s]/g, ""));
    return Number.isFinite(parsed) ? Math.max(0, Math.min(100, Math.round(parsed))) : null;
  }
  return null;
}

function moneyValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value !== "string") return null;
  const match = value.toLowerCase().replace(/,/g, "").match(/([0-9.]+)\s*([km])?/);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  const unit = match[2];
  if (unit === "k") return Math.round(amount * 1_000);
  if (unit === "m") return Math.round(amount * 1_000_000);
  return Math.round(amount);
}

function sourceConfidenceFromEvidence(sources: PeopleProviderSource[], claims: PeopleProviderClaim[]) {
  if (!sources.length) return null;
  return Math.min(92, 55 + Math.min(25, sources.length * 8) + Math.min(12, claims.length * 3));
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

function safeProviderError(value: string) {
  return value.replace(/sk-[a-zA-Z0-9_-]+/g, "[redacted]").slice(0, 300);
}
