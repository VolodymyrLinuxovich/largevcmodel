import type { ZodType, ZodTypeDef } from "zod";
import { ApiError } from "./errors";

/** Parses and validates a JSON request body; malformed JSON and schema violations become HTTP 400. */
export async function parseJsonBody<Output>(request: Request, schema: ZodType<Output, ZodTypeDef, unknown>, message: string) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ApiError(400, "Request body must be valid JSON", "INVALID_JSON");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new ApiError(400, message, "VALIDATION_ERROR", parsed.error.flatten());
  return parsed.data;
}
