import { requireCurrentUser } from "@/lib/auth/current-user";
import { badRequest, ok, serverError } from "@/lib/api/respond";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { deletePitchDeck, getCurrentPitchDeck, uploadPitchDeck } from "@/lib/startups/pitch-deck";

export async function GET(_: Request, { params }: { params: Promise<{ startupId: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { startupId } = await params;
    const deck = await getCurrentPitchDeck(prisma, user.id, startupId);
    return ok({
      deck: deck
        ? {
            id: deck.id,
            filename: deck.filename,
            mimeType: deck.mimeType,
            fileSize: deck.fileSize,
            uploadedAt: deck.uploadedAt,
            extractionStatus: deck.extractionStatus,
            extractionConfidence: deck.extractionConfidence,
            extractionWarnings: deck.extractionWarnings,
            lastProcessedAt: deck.lastProcessedAt,
            extraction: deck.extractions[0] ?? null,
          }
        : null,
    });
  } catch (error) {
    return serverError(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ startupId: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { startupId } = await params;
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return badRequest("Upload a PDF pitch deck in the file field.");
    const deck = await uploadPitchDeck(prisma, user.id, startupId, file);
    await audit(prisma, {
      userId: user.id,
      actor: user.email,
      actorType: "USER",
      action: "Pitch deck uploaded",
      outcome: "completed",
      dataSource: "User provided",
      details: deck.filename,
      metadata: { startupId, pitchDeckId: deck.id, fileSize: deck.fileSize },
    });
    return ok({ deck: { id: deck.id, filename: deck.filename, fileSize: deck.fileSize, extractionStatus: deck.extractionStatus } }, 201);
  } catch (error) {
    return serverError(error);
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ startupId: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { startupId } = await params;
    const deleted = await deletePitchDeck(prisma, user.id, startupId);
    await audit(prisma, {
      userId: user.id,
      actor: user.email,
      actorType: "USER",
      action: "Pitch deck deleted",
      outcome: "completed",
      dataSource: "User provided",
      details: `${deleted} active deck record removed from the workspace.`,
      metadata: { startupId },
    });
    return ok({ deleted });
  } catch (error) {
    return serverError(error);
  }
}
