import "server-only";

import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { optionalText } from "./schemas";
import type { Actor } from "./service";

/** Accepts either an array or a comma-separated string, as the form and the API send different shapes. */
const list = z
  .union([z.array(z.string()), z.string()])
  .optional()
  .transform((value) =>
    (Array.isArray(value) ? value : (value ?? "").split(","))
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 30),
  );

const money = z
  .union([z.number().int().nonnegative(), z.literal(""), z.null()])
  .optional()
  .transform((value) => (typeof value === "number" ? value : null));

export const thesisInputSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    targetSectors: list,
    stages: list,
    geographies: list,
    businessModels: list,
    checkSizeMin: money,
    checkSizeMax: money,
    technicalRequirements: optionalText(2000),
    founderCharacteristics: optionalText(2000),
    exclusionCriteria: optionalText(2000),
  })
  .strict()
  .refine((value) => value.checkSizeMin === null || value.checkSizeMax === null || value.checkSizeMin <= value.checkSizeMax, {
    message: "Minimum check size cannot exceed maximum.",
    path: ["checkSizeMax"],
  });

export type ThesisInput = z.infer<typeof thesisInputSchema>;

export async function createThesis(prisma: PrismaClient, actor: Actor, input: ThesisInput) {
  const thesis = await prisma.investmentThesis.create({
    data: {
      userId: actor.id,
      name: input.name,
      targetSectors: input.targetSectors,
      stages: input.stages,
      geographies: input.geographies,
      businessModels: input.businessModels,
      checkSizeMin: input.checkSizeMin,
      checkSizeMax: input.checkSizeMax,
      technicalRequirements: input.technicalRequirements ?? null,
      founderCharacteristics: input.founderCharacteristics ?? null,
      exclusionCriteria: input.exclusionCriteria ?? null,
      active: true,
    },
  });
  await audit(prisma, {
    userId: actor.id,
    actor: actor.email,
    actorType: "USER",
    action: "Investment thesis created",
    outcome: "completed",
    dataSource: "User provided",
    details: thesis.name,
    metadata: { thesisId: thesis.id },
  });
  return thesis;
}

export function listTheses(prisma: PrismaClient, userId: string) {
  return prisma.investmentThesis.findMany({
    where: { userId },
    orderBy: [{ active: "desc" }, { updatedAt: "desc" }],
    select: { id: true, name: true, targetSectors: true, stages: true, geographies: true, active: true, updatedAt: true },
  });
}
