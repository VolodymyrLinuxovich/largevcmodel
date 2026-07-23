import "server-only";

import { ClaimProvenance, EntityResolutionOutcome, Prisma, type PrismaClient } from "@prisma/client";
import type { PeopleProviderOrganization, PeopleProviderPerson, PeopleProviderSource } from "./types";
import { fingerprintPerson, resolveIncomingPerson } from "./entity-resolution";

export function normalizeEmail(email?: string | null) {
  const value = email?.trim().toLowerCase();
  if (!value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return null;
  return value;
}

export function normalizedName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function canonicalUrl(url: string) {
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

export function domainFromUrlOrEmail(value?: string | null) {
  if (!value) return null;
  const email = normalizeEmail(value);
  if (email) return email.split("@")[1] ?? null;
  try {
    return new URL(value.startsWith("http") ? value : `https://${value}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

export function normalizeProviderPerson(input: PeopleProviderPerson): PeopleProviderPerson | null {
  const fullName = clean(input.fullName);
  if (!fullName) return null;
  const emails = unique((input.emailAddresses ?? []).map(normalizeEmail).filter(Boolean) as string[]);
  const organizationDomain =
    domainFromUrlOrEmail(input.organizationDomain) ??
    domainFromUrlOrEmail(input.currentOrganization?.domain) ??
    domainFromUrlOrEmail(input.currentOrganization?.website) ??
    (emails[0] ? domainFromUrlOrEmail(emails[0]) : null);
  const firstLast = splitName(fullName);
  const sources = dedupeSources(input.sources ?? []);

  return {
    ...input,
    fullName,
    firstName: clean(input.firstName) ?? firstLast.firstName,
    lastName: clean(input.lastName) ?? firstLast.lastName,
    currentTitle: clean(input.currentTitle),
    currentOrganizationName: clean(input.currentOrganizationName ?? input.currentOrganization?.name),
    previousOrganizations: cleanArray(input.previousOrganizations),
    personTypes: Array.from(new Set(input.personTypes ?? [])),
    location: clean(input.location),
    biography: clean(input.biography),
    investmentThesis: clean(input.investmentThesis),
    industries: cleanArray(input.industries),
    subIndustries: cleanArray(input.subIndustries),
    preferredStages: cleanArray(input.preferredStages),
    minCheckSize: numberOrNull(input.minCheckSize),
    maxCheckSize: numberOrNull(input.maxCheckSize),
    geographyPreferences: cleanArray(input.geographyPreferences),
    portfolioCompanies: cleanArray(input.portfolioCompanies),
    notableInvestments: cleanArray(input.notableInvestments),
    notableExperience: clean(input.notableExperience),
    education: cleanArray(input.education),
    skills: cleanArray(input.skills),
    keywords: cleanArray(input.keywords),
    technologies: cleanArray(input.technologies),
    emailAddresses: emails,
    organizationDomain,
    linkedinUrl: validUrl(input.linkedinUrl),
    xUrl: validUrl(input.xUrl),
    personalWebsite: validUrl(input.personalWebsite),
    publicProfileUrls: cleanArray(input.publicProfileUrls).map(validUrl).filter(Boolean) as string[],
    sourceConfidence: confidence(input.sourceConfidence),
    fieldConfidence: input.fieldConfidence ?? {},
    conflictingClaims: input.conflictingClaims ?? {},
    sources,
    claims: (input.claims ?? []).filter((claim) => claim.text.trim().length > 0),
  };
}

export function personSearchText(person: PeopleProviderPerson | PersistedPersonShape) {
  return [
    person.fullName,
    person.currentTitle,
    person.currentOrganizationName,
    person.location,
    person.biography,
    person.investmentThesis,
    person.industries?.join(" "),
    person.subIndustries?.join(" "),
    person.preferredStages?.join(" "),
    person.geographyPreferences?.join(" "),
    person.portfolioCompanies?.join(" "),
    person.notableInvestments?.join(" "),
    person.notableExperience,
    person.education?.join(" "),
    person.skills?.join(" "),
    person.keywords?.join(" "),
    person.technologies?.join(" "),
  ]
    .filter(Boolean)
    .join("\n");
}

type PersistedPersonShape = {
  fullName: string;
  currentTitle?: string | null;
  currentOrganizationName?: string | null;
  location?: string | null;
  biography?: string | null;
  investmentThesis?: string | null;
  industries?: string[];
  subIndustries?: string[];
  preferredStages?: string[];
  geographyPreferences?: string[];
  portfolioCompanies?: string[];
  notableInvestments?: string[];
  notableExperience?: string | null;
  education?: string[];
  skills?: string[];
  keywords?: string[];
  technologies?: string[];
};

export async function persistProviderOrganization(
  prisma: PrismaClient,
  userId: string,
  provider: string,
  input?: PeopleProviderOrganization | null,
) {
  const organization = normalizeProviderOrganization(input);
  if (!organization) return null;
  const existing =
    organization.providerOrgId
      ? await prisma.discoveredOrganization.findUnique({
          where: { userId_provider_providerOrgId: { userId, provider, providerOrgId: organization.providerOrgId } },
        })
      : await prisma.discoveredOrganization.findFirst({
          where: {
            userId,
            OR: [
              organization.domain ? { domain: organization.domain } : undefined,
              { name: { equals: organization.name, mode: "insensitive" } },
            ].filter(Boolean) as Prisma.DiscoveredOrganizationWhereInput[],
          },
        });

  const data = {
    provider,
    providerOrgId: organization.providerOrgId,
    name: organization.name,
    type: organization.type,
    website: organization.website,
    domain: organization.domain,
    description: organization.description,
    location: organization.location,
    industries: organization.industries,
    investmentStages: organization.investmentStages,
    minCheckSize: organization.minCheckSize,
    maxCheckSize: organization.maxCheckSize,
    portfolio: organization.portfolio,
    publicUrls: organization.publicUrls,
    sourceConfidence: organization.sourceConfidence,
    lastResearchedAt: new Date(),
  };

  const saved = existing
    ? await prisma.discoveredOrganization.update({ where: { id: existing.id }, data })
    : await prisma.discoveredOrganization.create({ data: { ...data, userId } });

  await persistSourcesAndClaims(prisma, userId, {
    provider,
    organizationId: saved.id,
    sources: organization.sources ?? [],
    claims: organization.claims ?? [],
  });
  return saved;
}

export async function persistProviderPerson(
  prisma: PrismaClient,
  userId: string,
  provider: string,
  input: PeopleProviderPerson,
) {
  const person = normalizeProviderPerson(input);
  if (!person) return null;
  const currentOrganization = await persistProviderOrganization(prisma, userId, provider, person.currentOrganization);
  const byProvider =
    person.providerPersonId
      ? await prisma.discoveredPerson.findUnique({
          where: { userId_provider_providerPersonId: { userId, provider, providerPersonId: person.providerPersonId } },
        })
      : null;
  const candidates = await prisma.discoveredPerson.findMany({
    where: {
      userId,
      OR: [
        person.linkedinUrl ? { linkedinUrl: person.linkedinUrl } : undefined,
        (person.emailAddresses ?? []).length ? { emailAddresses: { hasSome: person.emailAddresses ?? [] } } : undefined,
        { fullName: { equals: person.fullName, mode: "insensitive" } },
      ].filter(Boolean) as Prisma.DiscoveredPersonWhereInput[],
    },
    take: 12,
  });
  const resolution = byProvider
    ? {
        outcome: EntityResolutionOutcome.EXACT_MATCH,
        confidence: 99,
        canonicalPersonId: byProvider.id,
        rationale: "Provider person identifier matched an existing person.",
        signals: ["Provider person ID exact match"],
        incomingFingerprint: fingerprintPerson({
          fullName: person.fullName,
          currentOrganizationName: person.currentOrganizationName,
          organizationDomain: person.organizationDomain,
          linkedinUrl: person.linkedinUrl,
        }),
      }
    : resolveIncomingPerson(person, candidates);

  const searchText = personSearchText(person);
  const data = {
    provider,
    providerPersonId: person.providerPersonId,
    fullName: person.fullName,
    firstName: person.firstName,
    lastName: person.lastName,
    currentTitle: person.currentTitle,
    currentOrganizationId: currentOrganization?.id ?? null,
    currentOrganizationName: person.currentOrganizationName ?? currentOrganization?.name ?? null,
    previousOrganizations: person.previousOrganizations ?? [],
    personTypes: person.personTypes ?? [],
    location: person.location,
    biography: person.biography,
    investmentThesis: person.investmentThesis,
    industries: person.industries ?? [],
    subIndustries: person.subIndustries ?? [],
    preferredStages: person.preferredStages ?? [],
    minCheckSize: person.minCheckSize ?? null,
    maxCheckSize: person.maxCheckSize ?? null,
    geographyPreferences: person.geographyPreferences ?? [],
    portfolioCompanies: person.portfolioCompanies ?? [],
    notableInvestments: person.notableInvestments ?? [],
    notableExperience: person.notableExperience,
    education: person.education ?? [],
    skills: person.skills ?? [],
    keywords: person.keywords ?? [],
    technologies: person.technologies ?? [],
    emailAddresses: person.emailAddresses ?? [],
    organizationDomain: person.organizationDomain,
    linkedinUrl: person.linkedinUrl,
    xUrl: person.xUrl,
    personalWebsite: person.personalWebsite,
    publicProfileUrls: person.publicProfileUrls ?? [],
    sourceConfidence: person.sourceConfidence,
    fieldConfidence: person.fieldConfidence as Prisma.InputJsonObject,
    conflictingClaims: person.conflictingClaims as Prisma.InputJsonObject,
    searchText,
    normalizedFingerprint: resolution.incomingFingerprint,
    researchProvider: provider,
    lastResearchedAt: new Date(),
  };

  const saved =
    resolution.canonicalPersonId && resolution.outcome !== EntityResolutionOutcome.UNCERTAIN_MATCH
      ? await prisma.discoveredPerson.update({ where: { id: resolution.canonicalPersonId }, data })
      : await prisma.discoveredPerson.create({ data: { ...data, userId } });

  await prisma.entityResolutionDecision.create({
    data: {
      userId,
      incomingFingerprint: resolution.incomingFingerprint,
      canonicalPersonId: resolution.canonicalPersonId ?? null,
      outcome: resolution.outcome,
      confidence: resolution.confidence,
      rationale: resolution.rationale,
      signals: resolution.signals,
    },
  });

  if (currentOrganization) {
    await prisma.personOrganization.upsert({
      where: {
        personId_organizationId_relationship: {
          personId: saved.id,
          organizationId: currentOrganization.id,
          relationship: "current_role",
        },
      },
      create: {
        userId,
        personId: saved.id,
        organizationId: currentOrganization.id,
        relationship: "current_role",
        title: saved.currentTitle,
        confidence: person.sourceConfidence,
      },
      update: { title: saved.currentTitle, confidence: person.sourceConfidence },
    });
  }

  await persistSourcesAndClaims(prisma, userId, {
    provider,
    personId: saved.id,
    organizationId: currentOrganization?.id ?? null,
    sources: person.sources ?? [],
    claims: person.claims ?? [],
  });
  return saved;
}

export function dedupeSources(sources: PeopleProviderSource[]) {
  const byUrl = new Map<string, PeopleProviderSource>();
  for (const source of sources) {
    const url = validUrl(source.url);
    if (!url) continue;
    const canonical = canonicalUrl(url);
    if (!byUrl.has(canonical)) byUrl.set(canonical, { ...source, url });
  }
  return Array.from(byUrl.values());
}

async function persistSourcesAndClaims(
  prisma: PrismaClient,
  userId: string,
  input: {
    provider: string;
    personId?: string | null;
    organizationId?: string | null;
    sources: PeopleProviderSource[];
    claims: Array<{ text: string; fieldKey?: string | null; confidence?: number | null; sourceUrls: string[] }>;
  },
) {
  const sourceByCanonical = new Map<string, string>();
  for (const source of dedupeSources(input.sources)) {
    const canonical = canonicalUrl(source.url);
    const data = {
      title: clean(source.title) ?? canonical,
      publisher: clean(source.publisher),
      publishedAt: source.publishedAt ? dateOrNull(source.publishedAt) : null,
      accessedAt: dateOrNull(source.accessedAt) ?? new Date(),
      sourceType: clean(source.sourceType) ?? "other",
      origin: input.provider,
      snippet: clean(source.snippet),
      supportsClaims: cleanArray(source.supportsClaims),
      confidence: confidence(source.confidence),
    };
    const existing = await prisma.personSource.findFirst({
      where: {
        userId,
        personId: input.personId ?? null,
        organizationId: input.organizationId ?? null,
        canonicalUrl: canonical,
      },
      select: { id: true },
    });
    const saved = existing
      ? await prisma.personSource.update({
          where: { id: existing.id },
          data: { ...data, publishedAt: data.publishedAt ?? undefined },
        })
      : await prisma.personSource.create({
          data: {
            ...data,
            userId,
            personId: input.personId ?? null,
            organizationId: input.organizationId ?? null,
            url: source.url,
            canonicalUrl: canonical,
          },
        });
    sourceByCanonical.set(canonical, saved.id);
  }

  for (const claim of input.claims) {
    const text = clean(claim.text);
    if (!text) continue;
    const savedClaim = await prisma.personClaim.create({
      data: {
        userId,
        personId: input.personId ?? null,
        organizationId: input.organizationId ?? null,
        fieldKey: clean(claim.fieldKey),
        text,
        provenance: ClaimProvenance.PUBLIC_RESEARCH,
        confidence: confidence(claim.confidence),
      },
    });
    for (const url of claim.sourceUrls ?? []) {
      const sourceId = sourceByCanonical.get(canonicalUrl(url));
      if (!sourceId) continue;
      await prisma.personClaimSource.upsert({
        where: { claimId_sourceId: { claimId: savedClaim.id, sourceId } },
        create: { claimId: savedClaim.id, sourceId, supportedClaim: text },
        update: { supportedClaim: text },
      });
    }
  }
}

function normalizeProviderOrganization(input?: PeopleProviderOrganization | null): PeopleProviderOrganization | null {
  if (!input?.name?.trim()) return null;
  return {
    ...input,
    name: input.name.trim(),
    type: clean(input.type),
    website: validUrl(input.website),
    domain: domainFromUrlOrEmail(input.domain) ?? domainFromUrlOrEmail(input.website),
    description: clean(input.description),
    location: clean(input.location),
    industries: cleanArray(input.industries),
    investmentStages: cleanArray(input.investmentStages),
    minCheckSize: numberOrNull(input.minCheckSize),
    maxCheckSize: numberOrNull(input.maxCheckSize),
    portfolio: cleanArray(input.portfolio),
    publicUrls: cleanArray(input.publicUrls).map(validUrl).filter(Boolean) as string[],
    sourceConfidence: confidence(input.sourceConfidence),
    sources: dedupeSources(input.sources ?? []),
    claims: (input.claims ?? []).filter((claim) => claim.text.trim().length > 0),
  };
}

export function clean(value?: string | null) {
  const text = value?.trim().replace(/\s+/g, " ");
  return text || null;
}

function cleanArray(values?: string[]) {
  return Array.from(new Set((values ?? []).map((value) => clean(value)).filter(Boolean) as string[])).slice(0, 100);
}

function splitName(fullName: string) {
  const parts = fullName.split(/\s+/).filter(Boolean);
  return { firstName: parts[0] ?? null, lastName: parts.length > 1 ? parts.at(-1) ?? null : null };
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

function numberOrNull(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
}

function confidence(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : null;
}

function dateOrNull(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}
