import "server-only";

import { createHash } from "node:crypto";
import { ExtractionFieldStatus, PitchDeckProcessingStatus, Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { calculateStartupCompleteness } from "./profile";

const MAX_DECK_BYTES = 12 * 1024 * 1024;
const PDF_MIME_TYPES = new Set(["application/pdf", "application/x-pdf"]);

export const extractionMergeSchema = z.object({
  extractionId: z.string().min(1),
  fields: z.array(
    z.object({
      fieldId: z.string().min(1),
      action: z.enum(["accept", "reject", "edit"]),
      value: z.string().max(8000).optional(),
    }),
  ),
});

export type ExtractionMergeInput = z.infer<typeof extractionMergeSchema>;

type ExtractedField = {
  fieldKey: string;
  extractedValue: string;
  confidence: number;
  sourcePage?: number;
};

const fieldLabels: Record<string, string[]> = {
  oneLineDescription: ["one-line", "tagline", "summary"],
  description: ["company description", "overview"],
  industry: ["industry", "sector"],
  product: ["product"],
  problem: ["problem"],
  solution: ["solution"],
  targetCustomers: ["customers", "target customers", "customer"],
  businessModel: ["business model"],
  revenueModel: ["revenue model"],
  fundingStage: ["stage", "funding stage"],
  fundingTarget: ["raising", "raise", "funding target"],
  headquarters: ["headquarters", "hq"],
  targetGeographies: ["markets", "geography", "geographies"],
  traction: ["traction"],
  revenue: ["revenue", "arr", "mrr"],
  pilots: ["pilots", "pilot"],
  partnerships: ["partnerships", "partners"],
  team: ["team"],
  founderBackgrounds: ["founders", "founder backgrounds"],
  technologies: ["technology", "technologies", "tech stack"],
  moat: ["moat", "defensibility"],
  competitors: ["competitors", "competition"],
  fundraisingStatus: ["fundraising status"],
  fundraisingTimeline: ["timeline"],
};

const arrayFields = new Set(["targetGeographies", "technologies", "competitors"]);
const numberFields = new Set(["fundingTarget", "customerCount", "minCheckSize", "maxCheckSize"]);

export async function uploadPitchDeck(prisma: PrismaClient, userId: string, startupId: string, file: File) {
  const startup = await prisma.startupProfile.findFirst({ where: { id: startupId, userId }, select: { id: true } });
  if (!startup) throw new Error("Startup profile not found.");
  if (!PDF_MIME_TYPES.has(file.type)) throw new Error("Pitch deck must be a PDF.");
  if (file.size <= 0 || file.size > MAX_DECK_BYTES) throw new Error("Pitch deck must be a non-empty PDF under 12 MB.");

  const bytes = Buffer.from(await file.arrayBuffer());
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const storageKey = `db://${userId}/${startupId}/${checksum}.pdf`;

  await prisma.pitchDeck.updateMany({
    where: { userId, startupId, deletedAt: null },
    data: { deletedAt: new Date() },
  });

  return prisma.pitchDeck.create({
    data: {
      userId,
      startupId,
      filename: file.name || "pitch-deck.pdf",
      mimeType: file.type,
      fileSize: file.size,
      checksum,
      storageKey,
      fileData: bytes,
      extractionStatus: PitchDeckProcessingStatus.UPLOADED,
    },
  });
}

export async function getCurrentPitchDeck(prisma: PrismaClient, userId: string, startupId: string) {
  return prisma.pitchDeck.findFirst({
    where: { userId, startupId, deletedAt: null },
    orderBy: { uploadedAt: "desc" },
    include: { extractions: { orderBy: { createdAt: "desc" }, take: 1, include: { fields: { orderBy: { fieldKey: "asc" } } } } },
  });
}

export async function deletePitchDeck(prisma: PrismaClient, userId: string, startupId: string) {
  const result = await prisma.pitchDeck.updateMany({
    where: { userId, startupId, deletedAt: null },
    data: { deletedAt: new Date(), extractionStatus: PitchDeckProcessingStatus.NOT_UPLOADED },
  });
  return result.count;
}

export async function runPitchDeckExtraction(prisma: PrismaClient, userId: string, startupId: string) {
  const deck = await prisma.pitchDeck.findFirst({
    where: { userId, startupId, deletedAt: null },
    orderBy: { uploadedAt: "desc" },
  });
  if (!deck) throw new Error("Upload a pitch deck before running extraction.");
  const startup = await prisma.startupProfile.findFirst({ where: { id: startupId, userId } });
  if (!startup) throw new Error("Startup profile not found.");

  const extraction = await prisma.pitchDeckExtraction.create({
    data: {
      userId,
      startupId,
      pitchDeckId: deck.id,
      status: PitchDeckProcessingStatus.PARSING,
      extractionVersion: deck.extractionVersion + 1,
    },
  });

  try {
    const text = extractPdfText(Buffer.from(deck.fileData));
    const fields = extractStartupFields(text);
    const warnings = [
      text.length < 200 ? "Only limited text could be extracted from this PDF. It may be image-heavy or encoded." : null,
      fields.length === 0 ? "No structured startup fields were detected. Review the deck manually." : null,
    ].filter(Boolean) as string[];
    const confidence = fields.length ? Math.max(35, Math.min(92, Math.round(fields.reduce((sum, field) => sum + field.confidence, 0) / fields.length))) : 20;

    await prisma.pitchDeckExtraction.update({
      where: { id: extraction.id },
      data: {
        status: fields.length ? PitchDeckProcessingStatus.NEEDS_REVIEW : PitchDeckProcessingStatus.ERROR,
        extractedText: text,
        structuredFields: fields as unknown as Prisma.InputJsonArray,
        extractionConfidence: confidence,
        extractionWarnings: warnings,
        error: fields.length ? null : "No structured startup fields were detected.",
        completedAt: new Date(),
      },
    });

    await prisma.pitchDeck.update({
      where: { id: deck.id },
      data: {
        extractionStatus: fields.length ? PitchDeckProcessingStatus.NEEDS_REVIEW : PitchDeckProcessingStatus.ERROR,
        extractionVersion: { increment: 1 },
        extractedText: text,
        structuredFields: fields as unknown as Prisma.InputJsonArray,
        extractionConfidence: confidence,
        extractionWarnings: warnings,
        lastProcessedAt: new Date(),
      },
    });

    for (const field of fields) {
      await prisma.pitchDeckExtractionField.create({
        data: {
          extractionId: extraction.id,
          fieldKey: field.fieldKey,
          extractedValue: field.extractedValue,
          currentValue: currentStartupValue(startup, field.fieldKey),
          confidence: field.confidence,
          sourcePage: field.sourcePage ?? null,
        },
      });
    }

    return prisma.pitchDeckExtraction.findUnique({
      where: { id: extraction.id },
      include: { fields: { orderBy: { fieldKey: "asc" } } },
    });
  } catch (error) {
    await prisma.pitchDeckExtraction.update({
      where: { id: extraction.id },
      data: {
        status: PitchDeckProcessingStatus.ERROR,
        error: error instanceof Error ? error.message : "Pitch deck extraction failed.",
        completedAt: new Date(),
      },
    });
    await prisma.pitchDeck.update({
      where: { id: deck.id },
      data: {
        extractionStatus: PitchDeckProcessingStatus.ERROR,
        extractionWarnings: ["Pitch deck extraction failed."],
        lastProcessedAt: new Date(),
      },
    });
    throw error;
  }
}

export async function mergePitchDeckExtraction(prisma: PrismaClient, userId: string, startupId: string, input: ExtractionMergeInput) {
  const extraction = await prisma.pitchDeckExtraction.findFirst({
    where: { id: input.extractionId, userId, startupId },
    include: { fields: true, startup: true, pitchDeck: true },
  });
  if (!extraction) throw new Error("Pitch deck extraction not found.");

  const updates: Record<string, unknown> = {};
  const fieldById = new Map(extraction.fields.map((field) => [field.id, field]));
  for (const decision of input.fields) {
    const field = fieldById.get(decision.fieldId);
    if (!field) continue;
    if (decision.action === "reject") {
      await prisma.pitchDeckExtractionField.update({
        where: { id: field.id },
        data: { status: ExtractionFieldStatus.REJECTED },
      });
      continue;
    }
    const nextValue = decision.action === "edit" ? decision.value ?? "" : field.extractedValue ?? "";
    updates[field.fieldKey] = valueForStartupField(field.fieldKey, nextValue);
    await prisma.pitchDeckExtractionField.update({
      where: { id: field.id },
      data: {
        extractedValue: nextValue,
        status: decision.action === "edit" ? ExtractionFieldStatus.EDITED : ExtractionFieldStatus.ACCEPTED,
      },
    });
  }

  const merged = { ...extraction.startup, ...updates } as Partial<Record<string, unknown>>;
  const startup = await prisma.startupProfile.update({
    where: { id: extraction.startupId },
    data: {
      ...updates,
      profileCompleteness: calculateStartupCompleteness(merged),
    },
  });
  await prisma.pitchDeck.update({
    where: { id: extraction.pitchDeckId },
    data: { extractionStatus: PitchDeckProcessingStatus.APPROVED },
  });
  await prisma.pitchDeckExtraction.update({
    where: { id: extraction.id },
    data: { status: PitchDeckProcessingStatus.APPROVED },
  });

  return startup;
}

export function extractPdfText(bytes: Buffer) {
  const latin = bytes.toString("latin1");
  const literalStrings = Array.from(latin.matchAll(/\(([^()]{2,500})\)/g)).map((match) => match[1] ?? "");
  const textLike = literalStrings.length > 10 ? literalStrings.join(" ") : latin;
  return textLike
    .replace(/\\r|\\n/g, "\n")
    .replace(/\\([()\\])/g, "$1")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120_000);
}

export function extractStartupFields(text: string): ExtractedField[] {
  const fields = new Map<string, ExtractedField>();
  const normalized = text.replace(/\s+/g, " ");
  for (const [fieldKey, labels] of Object.entries(fieldLabels)) {
    for (const label of labels) {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`\\b${escaped}\\b\\s*[:\\-–]\\s*([^.;\\n]{3,420})`, "i");
      const match = normalized.match(regex);
      if (match?.[1]) {
        fields.set(fieldKey, {
          fieldKey,
          extractedValue: match[1].trim(),
          confidence: label.length > 8 ? 82 : 70,
          sourcePage: estimatePageForText(text, match.index ?? 0),
        });
        break;
      }
    }
  }
  detectFundingAmounts(normalized, fields);
  detectStage(normalized, fields);
  return Array.from(fields.values());
}

function detectFundingAmounts(text: string, fields: Map<string, ExtractedField>) {
  const raise = text.match(/\b(?:raising|raise|seeking|target)\s+\$?([0-9]+(?:\.[0-9]+)?)\s*(m|mm|million|k|thousand)\b/i);
  if (!raise || fields.has("fundingTarget")) return;
  fields.set("fundingTarget", {
    fieldKey: "fundingTarget",
    extractedValue: String(moneyAmount(raise[1] ?? "0", raise[2] ?? "")),
    confidence: 72,
    sourcePage: estimatePageForText(text, raise.index ?? 0),
  });
}

function detectStage(text: string, fields: Map<string, ExtractedField>) {
  if (fields.has("fundingStage")) return;
  const stage = text.match(/\b(pre-seed|pre seed|seed|series a|series b|growth)\b/i);
  if (!stage?.[1]) return;
  fields.set("fundingStage", {
    fieldKey: "fundingStage",
    extractedValue: stage[1].replace("pre seed", "pre-seed"),
    confidence: 64,
    sourcePage: estimatePageForText(text, stage.index ?? 0),
  });
}

function moneyAmount(value: string, unit: string) {
  const number = Number(value);
  const normalized = unit.toLowerCase();
  if (normalized === "k" || normalized === "thousand") return Math.round(number * 1_000);
  return Math.round(number * 1_000_000);
}

function estimatePageForText(text: string, index: number) {
  const before = text.slice(0, index);
  const explicitPages = before.match(/\b(?:page|slide)\s+\d+\b/gi);
  if (explicitPages?.length) return explicitPages.length;
  return Math.max(1, Math.floor(index / 2500) + 1);
}

function currentStartupValue(startup: Record<string, unknown>, fieldKey: string) {
  const value = startup[fieldKey];
  if (Array.isArray(value)) return value.join(", ");
  if (value === null || value === undefined) return null;
  return String(value);
}

function valueForStartupField(fieldKey: string, value: string) {
  if (arrayFields.has(fieldKey)) return value.split(",").map((item) => item.trim()).filter(Boolean);
  if (numberFields.has(fieldKey)) return Number(value.replace(/[^0-9]/g, "")) || null;
  return value.trim() || null;
}
