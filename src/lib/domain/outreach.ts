type OutreachContact = {
  fullName: string;
  role: string;
  sector: string;
  company?: {
    name: string;
    sector: string;
    description: string;
    latestFundingRound?: string | null;
    latestFundingAmount?: string | null;
    latestFundingDate?: Date | string | null;
  } | null;
};

type OutreachSource = {
  id: string;
  title: string;
  sourceType: string;
  origin: string;
  supportsClaims: string;
};

type OutreachOptions = {
  tone?: string;
  version?: string;
  format?: string;
};

function firstName(name: string) {
  return name.split(" ")[0] ?? name;
}

function fundingPhrase(contact: OutreachContact) {
  const company = contact.company;
  if (!company?.latestFundingRound) return "given where the company appears to be in market";
  return `after the ${company.latestFundingRound.toLowerCase()} financing`;
}

export function generateOutreachDraft(
  contact: OutreachContact,
  sources: OutreachSource[],
  options: OutreachOptions = {},
) {
  const tone = options.tone ?? "thoughtful";
  const version = options.version ?? "short";
  const format = options.format ?? "email";
  const company = contact.company;
  const companyName = company?.name ?? "your company";
  const short = version === "short";
  const opener =
    tone === "direct"
      ? `I wanted to compare notes on ${companyName}.`
      : `I have been looking closely at technical AI infrastructure teams and ${companyName} stood out.`;
  const evidenceLine = company
    ? `The combination of ${company.sector.toLowerCase()}, ${fundingPhrase(contact)}, and the product wedge around ${company.description.toLowerCase()} maps closely to Northstar Seed's current thesis.`
    : `The available internal CRM and research notes map to Northstar Seed's current thesis.`;

  const body = short
    ? `Hi ${firstName(contact.fullName)},\n\n${opener} ${evidenceLine}\n\nNorthstar Seed backs technical founders at seed, usually before the market has fully agreed on the category. Would you be open to a 25-minute conversation next week?\n\nAva`
    : `Hi ${firstName(contact.fullName)},\n\n${opener}\n\n${evidenceLine}\n\nWe are especially interested in infrastructure categories where engineering teams feel operational pain before procurement budgets are obvious. If that is the world you are seeing, I would value a short conversation and can keep it practical.\n\nWould you be open to a 25-minute conversation next week?\n\nAva`;

  const rationaleClaims = sources
    .slice(0, 4)
    .map((source) => {
      const claims = safeParseClaims(source.supportsClaims);
      return {
        sourceId: source.id,
        sourceTitle: source.title,
        origin: source.origin,
        sourceType: source.sourceType,
        claim: claims[0] ?? "Source supports personalization context.",
      };
    });

  return {
    format,
    tone,
    version,
    subject: `${companyName} and Northstar's AI infrastructure thesis`,
    body,
    rationale:
      "The founder-facing message excludes citation markers. Personalization is grounded in the separate rationale below, using only available CRM and research evidence.",
    rationaleClaims,
  };
}

function safeParseClaims(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((claim): claim is string => typeof claim === "string") : [];
  } catch {
    return [];
  }
}
