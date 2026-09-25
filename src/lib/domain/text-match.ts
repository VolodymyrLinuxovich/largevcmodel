function tokens(value: string) {
  return value
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

function containsSequence(haystack: string[], needle: string[]) {
  if (!needle.length || needle.length > haystack.length) return false;
  for (let start = 0; start + needle.length <= haystack.length; start += 1) {
    if (needle.every((token, offset) => haystack[start + offset] === token)) return true;
  }
  return false;
}

/**
 * Whole-word phrase match in either direction: "Industrial AI software" matches "Industrial AI",
 * but "Retail" does not match "AI" and "Australia" does not match "US".
 */
export function phraseMatch(value: string, target: string) {
  const valueTokens = tokens(value);
  const targetTokens = tokens(target);
  return containsSequence(valueTokens, targetTokens) || containsSequence(targetTokens, valueTokens);
}
