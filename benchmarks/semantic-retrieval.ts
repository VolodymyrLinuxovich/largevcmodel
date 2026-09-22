import type { RetrievalCandidate } from "../src/lib/people/semantic";
import type { RetrievalEvaluationCase } from "../src/lib/people/retrieval-evaluation";

const sectors = [
  { id: "defense", text: "defense AI national security dual-use autonomous battlefield robotics" },
  { id: "fintech", text: "financial technology payments banking fraud risk infrastructure" },
  { id: "climate", text: "climate technology carbon energy weather environmental resilience" },
  { id: "healthcare", text: "healthcare clinical biotech diagnostics patient care life sciences" },
  { id: "developer-tools", text: "developer tools cloud infrastructure observability databases software engineering" },
] as const;

const stages = [
  { id: "pre-seed", text: "pre-seed earliest stage first institutional capital" },
  { id: "seed", text: "seed stage early-stage venture capital" },
  { id: "series-a", text: "series A growth stage institutional round" },
] as const;

const regions = [
  { id: "north-america", text: "North America United States Canada" },
  { id: "europe", text: "Europe European Union United Kingdom" },
  { id: "latin-america", text: "Latin America Brazil Mexico Colombia" },
  { id: "asia-pacific", text: "Asia Pacific APAC Japan Singapore Australia" },
] as const;

const roles = [
  { id: "investor", text: "investor venture capital partner fund check portfolio" },
  { id: "founder", text: "founder cofounder entrepreneur startup operator" },
] as const;

export const syntheticProfileCorpus: RetrievalCandidate[] = sectors.flatMap((sector) =>
  stages.flatMap((stage) =>
    regions.flatMap((region) =>
      roles.map((role) => ({
        id: `${sector.id}:${stage.id}:${region.id}:${role.id}`,
        text: `${role.text}. Focus: ${sector.text}. Stage: ${stage.text}. Geography: ${region.text}.`,
      })),
    ),
  ),
);

export const semanticRetrievalCases: RetrievalEvaluationCase[] = [
  {
    id: "dual-use-seed-europe-investor",
    query: "seed venture investor for dual-use autonomous defense software in Europe",
    relevantIds: ["defense:seed:europe:investor"],
  },
  {
    id: "climate-pre-seed-founder-latam",
    query: "pre-seed climate resilience startup founder in Latin America",
    relevantIds: ["climate:pre-seed:latin-america:founder"],
  },
  {
    id: "fintech-series-a-investor-north-america",
    query: "Series A fintech payments investor in the United States or Canada",
    relevantIds: ["fintech:series-a:north-america:investor"],
  },
  {
    id: "healthcare-seed-founder-apac",
    query: "Asia Pacific seed-stage healthcare diagnostics founder",
    relevantIds: ["healthcare:seed:asia-pacific:founder"],
  },
  {
    id: "developer-tools-series-a-investor-europe",
    query: "European Series A investor focused on cloud developer infrastructure",
    relevantIds: ["developer-tools:series-a:europe:investor"],
  },
  {
    id: "defense-pre-seed-founder-north-america",
    query: "North American pre-seed founder building national-security robotics",
    relevantIds: ["defense:pre-seed:north-america:founder"],
  },
  {
    id: "fintech-seed-founder-latam",
    query: "Latin American seed founder working on banking fraud prevention",
    relevantIds: ["fintech:seed:latin-america:founder"],
  },
  {
    id: "climate-series-a-investor-apac",
    query: "APAC growth-stage venture investor for carbon and clean energy",
    relevantIds: ["climate:series-a:asia-pacific:investor"],
  },
  {
    id: "healthcare-pre-seed-investor-europe",
    query: "European earliest-stage life sciences and clinical care fund",
    relevantIds: ["healthcare:pre-seed:europe:investor"],
  },
  {
    id: "developer-tools-seed-founder-north-america",
    query: "US seed startup founder building database observability tools",
    relevantIds: ["developer-tools:seed:north-america:founder"],
  },
];
