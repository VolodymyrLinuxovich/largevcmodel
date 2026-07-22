import type { ResearchRequest, ResearchResult } from "@/lib/domain/types";
import { HermesResearchProvider } from "./hermes";
import { MockResearchProvider } from "./mock";

export interface ResearchProvider {
  researchFounder(input: ResearchRequest): Promise<ResearchResult>;
}

export function getConfiguredResearchProvider(): ResearchProvider {
  if (process.env.RESEARCH_PROVIDER === "hermes") {
    return new HermesResearchProvider({
      apiUrl: process.env.HERMES_API_URL,
      apiKey: process.env.HERMES_API_KEY,
      command: process.env.HERMES_COMMAND,
    });
  }

  return new MockResearchProvider();
}

export async function researchWithFallback(input: ResearchRequest) {
  const provider = getConfiguredResearchProvider();
  try {
    return await provider.researchFounder(input);
  } catch (error) {
    const fallback = new MockResearchProvider();
    const result = await fallback.researchFounder(input);
    return {
      ...result,
      unavailable: [
        ...result.unavailable,
        `Hermes provider unavailable; fell back to mock research. ${error instanceof Error ? error.message : "Unknown error"}`,
      ],
    };
  }
}
