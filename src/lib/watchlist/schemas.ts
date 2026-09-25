import { z } from "zod";
import { optionalText } from "@/lib/pipeline/schemas";

const id = z.string().trim().min(1).max(64);

export const addWatchSchema = z
  .object({ entityType: z.enum(["COMPANY", "CONTACT", "OPPORTUNITY"]), targetId: id, note: optionalText(500) })
  .strict();

export const removeWatchSchema = z.object({ itemId: id }).strict();

export const markSignalsReadSchema = z
  .union([z.object({ signalIds: z.array(id).min(1).max(200) }).strict(), z.object({ all: z.literal(true) }).strict()]);
