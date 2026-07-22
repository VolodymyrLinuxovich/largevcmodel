import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";
import { revokeIntegration } from "@/lib/google/api";

const payloadSchema = z.object({
  deleteImportedData: z.boolean().default(false),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    const body = request.headers.get("content-type")?.includes("application/json") ? await request.json() : {};
    const parsed = payloadSchema.parse(body);
    const integration = await prisma.integration.findFirst({ where: { id, userId: user.id } });
    if (!integration) return NextResponse.json({ error: "Integration not found" }, { status: 404 });

    await revokeIntegration(prisma, user.id, id);

    if (parsed.deleteImportedData) {
      await prisma.contact.deleteMany({ where: { userId: user.id, sourceIntegrationId: id } });
      await prisma.gmailThread.deleteMany({ where: { userId: user.id } });
      await prisma.calendarEvent.deleteMany({ where: { userId: user.id } });
    }

    await audit(prisma, {
      userId: user.id,
      actor: user.email,
      actorType: "USER",
      action: "Integration disconnected",
      outcome: "completed",
      dataSource: integration.service,
      details: parsed.deleteImportedData ? "Provider tokens revoked and imported records deleted." : "Provider tokens revoked.",
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "disconnect_failed" }, { status: 400 });
  }
}
