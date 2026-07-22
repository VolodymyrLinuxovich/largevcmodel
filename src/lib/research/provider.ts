import type { ResearchRequest, ResearchResult } from "@/lib/domain/types";
import { HermesResearchProvider } from "./hermes";

export interface ResearchProvider {
  researchFounder(input: ResearchRequest): Promise<ResearchResult>;
}

export function getConfiguredResearchProvider(): ResearchProvider | null {
  if (process.env.RESEARCH_PROVIDER === "hermes") {
    return new HermesResearchProvider({
      apiUrl: process.env.HERMES_API_URL,
      apiKey: process.env.HERMES_API_KEY,
      command: process.env.HERMES_COMMAND,
    });
  }

  return null;
}

export async function researchWithConfiguredProvider(input: ResearchRequest) {
  const provider = getConfiguredResearchProvider();
  if (!provider) {
    throw new Error("No research provider is configured. Set RESEARCH_PROVIDER=hermes and configure HERMES_API_URL or HERMES_COMMAND.");
  }
  return provider.researchFounder(input);
}
