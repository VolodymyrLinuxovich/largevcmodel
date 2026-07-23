import { createHash } from "node:crypto";

const MODEL = "local-keyword-v1";
const DIMENSIONS = 64;

const SYNONYMS: Record<string, string[]> = {
  defense: ["national-security", "dual-use", "military", "warfighter"],
  ai: ["artificial-intelligence", "machine-learning", "ml"],
  autonomy: ["autonomous", "unmanned", "robotics", "drones"],
  geospatial: ["gis", "imagery", "mapping", "intelligence"],
  climate: ["weather", "risk", "earth", "environment"],
  investor: ["venture", "capital", "partner", "fund"],
  founder: ["cofounder", "entrepreneur", "startup"],
  customer: ["buyer", "procurement", "user"],
};

export type LocalEmbedding = {
  model: typeof MODEL;
  dimensions: typeof DIMENSIONS;
  vector: number[];
  sourceContentHash: string;
};

export function embedTextLocally(text: string): LocalEmbedding {
  const tokens = expandTokens(tokenize(text));
  const vector = Array.from({ length: DIMENSIONS }, () => 0);
  for (const token of tokens) {
    const index = hashIndex(token);
    vector[index] += weight(token);
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return {
    model: MODEL,
    dimensions: DIMENSIONS,
    vector: vector.map((value) => Number((value / norm).toFixed(6))),
    sourceContentHash: createHash("sha256").update(text).digest("hex"),
  };
}

export function semanticSimilarity(left: string, right: string) {
  const a = embedTextLocally(left).vector;
  const b = embedTextLocally(right).vector;
  return Math.max(0, Math.min(1, a.reduce((sum, value, index) => sum + value * (b[index] ?? 0), 0)));
}

export function fullTextScore(query: string, document: string) {
  const q = new Set(expandTokens(tokenize(query)));
  const d = new Set(expandTokens(tokenize(document)));
  if (!q.size || !d.size) return 0;
  let matched = 0;
  for (const token of q) {
    if (d.has(token) || Array.from(d).some((candidate) => candidate.startsWith(token) || token.startsWith(candidate))) {
      matched += 1;
    }
  }
  return matched / q.size;
}

export function tokenize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9$.\-\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function expandTokens(tokens: string[]) {
  const values = new Set<string>();
  for (const token of tokens) {
    values.add(token);
    for (const [canonical, related] of Object.entries(SYNONYMS)) {
      if (token === canonical || related.includes(token)) {
        values.add(canonical);
        related.forEach((item) => values.add(item));
      }
    }
  }
  return Array.from(values);
}

function hashIndex(token: string) {
  const digest = createHash("sha1").update(token).digest();
  return digest[0]! % DIMENSIONS;
}

function weight(token: string) {
  if (token.length > 8) return 1.25;
  if (token.length > 4) return 1;
  return 0.7;
}
