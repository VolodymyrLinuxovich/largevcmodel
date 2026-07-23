import "server-only";

import { ProviderHealthStatus } from "@prisma/client";
import { getResearchProviderName } from "@/lib/config";
import { HermesPeopleDiscoveryProvider } from "./hermes";
import { OpenAIPeopleDiscoveryProvider } from "./openai";
import type { PeopleProviderSearchInput, PeopleProviderSearchResult, PeopleProviderStatus } from "./types";

export interface PeopleDiscoveryProvider {
  name: string;
  status(): Promise<PeopleProviderStatus>;
  searchPeople(input: PeopleProviderSearchInput): Promise<PeopleProviderSearchResult>;
  fetchPersonDetails?(providerPersonId: string): Promise<PeopleProviderSearchResult>;
  fetchOrganizationDetails?(providerOrgId: string): Promise<PeopleProviderSearchResult>;
  refreshPerson?(providerPersonId: string): Promise<PeopleProviderSearchResult>;
}

export function getConfiguredPeopleDiscoveryProvider(): PeopleDiscoveryProvider | null {
  const provider = getResearchProviderName();
  if (provider === "hermes") {
    return new HermesPeopleDiscoveryProvider({
      apiUrl: process.env.HERMES_API_URL,
      apiKey: process.env.HERMES_API_KEY,
      command: process.env.HERMES_COMMAND,
    });
  }
  if (provider === "openai") {
    return new OpenAIPeopleDiscoveryProvider({
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL,
    });
  }
  return null;
}

export async function getPeopleDiscoveryProviderStatus(): Promise<PeopleProviderStatus> {
  const provider = getConfiguredPeopleDiscoveryProvider();
  if (!provider) {
    return {
      name: getResearchProviderName(),
      status: ProviderHealthStatus.UNAVAILABLE,
      message:
        "External people discovery is not configured. Gmail and Google Contacts can enrich known candidates, but they cannot be used as the primary discovery source.",
    };
  }
  return provider.status();
}
