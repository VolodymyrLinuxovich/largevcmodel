import { z } from "zod";
import { OPPORTUNITY_STAGES } from "./stages";

export const OPPORTUNITY_PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;
export const OPPORTUNITY_SOURCES = ["INBOUND", "WARM_INTRO", "OUTBOUND", "RESEARCH", "EVENT", "REFERRAL", "OTHER"] as const;
export const OPPORTUNITY_CONTACT_ROLES = ["FOUNDER", "EXECUTIVE", "INTRODUCER", "CO_INVESTOR", "ADVISOR", "OTHER"] as const;

const id = z.string().trim().min(1).max(64);

/** Optional free text: blank strings are stored as null rather than empty values. */
export function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => (value ? value : value === undefined ? undefined : null));
}

/** Accepts an ISO timestamp or an HTML date-input value (YYYY-MM-DD, interpreted as UTC midnight). */
export const optionalDate = z
  .union([z.string().datetime({ offset: true }), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"), z.literal(""), z.null()])
  .optional()
  .transform((value) => {
    if (value === undefined) return undefined;
    if (!value) return null;
    const date = new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value);
    return Number.isNaN(date.getTime()) ? null : date;
  });

const httpUrl = z
  .string()
  .trim()
  .max(2048)
  .url("Enter a valid URL.")
  .refine((value) => /^https?:\/\//i.test(value), "Only http(s) URLs are allowed.");

export const companyInputSchema = z
  .object({
    name: z.string().trim().min(1, "Company name is required.").max(160),
    domain: optionalText(253),
    website: z.union([httpUrl, z.literal(""), z.null()]).optional().transform((value) => (value === undefined ? undefined : value || null)),
    description: optionalText(4000),
    sector: optionalText(160),
    stage: optionalText(80),
    geography: optionalText(160),
    businessModel: optionalText(160),
  })
  .strict();

const opportunityFields = {
  title: optionalText(160),
  thesisId: id.nullable().optional(),
  priority: z.enum(OPPORTUNITY_PRIORITIES).optional(),
  ownerName: optionalText(120),
  source: z.enum(OPPORTUNITY_SOURCES).optional(),
  sourceDetail: optionalText(500),
  introducedByContactId: id.nullable().optional(),
  nextAction: optionalText(500),
  nextActionAt: optionalDate,
  notes: optionalText(10_000),
};

export const createOpportunitySchema = z
  .object({
    companyId: id.optional(),
    company: companyInputSchema.optional(),
    ...opportunityFields,
    contacts: z
      .array(z.object({ contactId: id, role: z.enum(OPPORTUNITY_CONTACT_ROLES).default("OTHER") }).strict())
      .max(25)
      .default([]),
  })
  .strict()
  .refine((value) => Boolean(value.companyId) !== Boolean(value.company), {
    message: "Provide either an existing companyId or a new company, not both.",
    path: ["company"],
  });

export const updateOpportunitySchema = z
  .object({ ...opportunityFields, expectedVersion: z.number().int().positive() })
  .strict()
  .refine((value) => Object.keys(value).some((key) => key !== "expectedVersion"), { message: "No fields to update." });

export const stageChangeSchema = z
  .object({
    toStage: z.enum(OPPORTUNITY_STAGES),
    note: optionalText(2000),
    passReason: optionalText(2000),
    expectedVersion: z.number().int().positive(),
  })
  .strict();

export const linkContactSchema = z
  .object({ contactId: id, role: z.enum(OPPORTUNITY_CONTACT_ROLES).default("OTHER") })
  .strict();

export const unlinkContactSchema = z.object({ contactId: id }).strict();

export type CreateOpportunityInput = z.infer<typeof createOpportunitySchema>;
export type UpdateOpportunityInput = z.infer<typeof updateOpportunitySchema>;
export type StageChangeInput = z.infer<typeof stageChangeSchema>;
