import "server-only";

import { OpportunityEventType, Prisma, type PrismaClient } from "@prisma/client";
import { ApiError } from "@/lib/api/errors";
import { audit } from "@/lib/audit";
import { calculateRelationshipHealth } from "@/lib/domain/relationship-health";
import { loadHealthInputs } from "@/lib/domain/relationship-health-service";
import { calculateFitScore, DEFAULT_SCORING_WEIGHTS } from "@/lib/domain/scoring";
import type { CreateOpportunityInput, StageChangeInput, UpdateOpportunityInput } from "./schemas";
import { openCompanyKey, STAGE_LABELS } from "./stages";
import { planStageChange } from "./transitions";

export type Actor = { id: string; email: string; name?: string | null };

const OPEN_OPPORTUNITY_CONFLICT = "An open opportunity already exists for this company.";

function isUniqueViolation(error: unknown, field: string) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return false;
  const target = error.meta?.target;
  return Array.isArray(target) ? target.includes(field) : String(target ?? "").includes(field);
}

async function assertOwned(prisma: PrismaClient, userId: string, input: { thesisId?: string | null; contactIds?: string[] }) {
  const contactIds = Array.from(new Set(input.contactIds ?? []));
  const [thesis, contacts] = await Promise.all([
    input.thesisId ? prisma.investmentThesis.findFirst({ where: { id: input.thesisId, userId }, select: { id: true } }) : null,
    contactIds.length ? prisma.contact.findMany({ where: { userId, id: { in: contactIds } }, select: { id: true } }) : [],
  ]);
  if (input.thesisId && !thesis) throw new ApiError(404, "Investment thesis not found", "THESIS_NOT_FOUND");
  if (contacts.length !== contactIds.length) throw new ApiError(404, "One or more contacts were not found", "CONTACT_NOT_FOUND");
}

/** Returns only the keys whose value was supplied, so partial updates never overwrite existing data with null. */
function definedFields<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Partial<T>;
}

const COMPANY_DETAIL_FIELDS = ["domain", "website", "description", "sector", "stage", "geography", "businessModel"] as const;

/**
 * Finds or creates the company inside the caller's transaction. For an existing company only empty
 * fields are filled: re-entering a company name never overwrites facts already recorded.
 */
async function resolveCompany(tx: Prisma.TransactionClient, userId: string, input: CreateOpportunityInput) {
  if (input.companyId) {
    const company = await tx.company.findFirst({ where: { id: input.companyId, userId }, select: { id: true, name: true } });
    if (!company) throw new ApiError(404, "Company not found", "COMPANY_NOT_FOUND");
    return company;
  }
  const { name, ...details } = input.company!;
  const existing = await tx.company.findUnique({ where: { userId_name: { userId, name } } });
  if (!existing) {
    const provided = Object.fromEntries(Object.entries(details).filter(([, value]) => value !== undefined && value !== null));
    return tx.company.create({ data: { userId, name, source: "user", ...provided }, select: { id: true, name: true } });
  }
  const fill = Object.fromEntries(
    COMPANY_DETAIL_FIELDS.filter((field) => existing[field] === null && details[field] !== undefined && details[field] !== null).map((field) => [
      field,
      details[field],
    ]),
  );
  if (Object.keys(fill).length) await tx.company.update({ where: { id: existing.id }, data: fill });
  return { id: existing.id, name: existing.name };
}

export async function createOpportunity(prisma: PrismaClient, actor: Actor, input: CreateOpportunityInput) {
  await assertOwned(prisma, actor.id, {
    thesisId: input.thesisId,
    contactIds: [...input.contacts.map((contact) => contact.contactId), ...(input.introducedByContactId ? [input.introducedByContactId] : [])],
  });
  try {
    const { opportunity, company } = await prisma.$transaction(async (tx) => {
      const company = await resolveCompany(tx, actor.id, input);
      const created = await tx.opportunity.create({
        data: {
          userId: actor.id,
          companyId: company.id,
          thesisId: input.thesisId ?? null,
          introducedByContactId: input.introducedByContactId ?? null,
          title: input.title ?? null,
          priority: input.priority ?? "MEDIUM",
          ownerName: input.ownerName ?? actor.name ?? null,
          source: input.source ?? "OTHER",
          sourceDetail: input.sourceDetail ?? null,
          nextAction: input.nextAction ?? null,
          nextActionAt: input.nextActionAt ?? null,
          notes: input.notes ?? null,
          stage: "SOURCED",
          openCompanyKey: openCompanyKey(actor.id, company.id, "SOURCED"),
        },
      });
      if (input.contacts.length) {
        await tx.opportunityContact.createMany({
          data: input.contacts.map((contact) => ({ userId: actor.id, opportunityId: created.id, contactId: contact.contactId, role: contact.role })),
          skipDuplicates: true,
        });
      }
      await tx.opportunityEvent.create({
        data: {
          userId: actor.id,
          opportunityId: created.id,
          type: OpportunityEventType.CREATED,
          toStage: "SOURCED",
          actor: actor.email,
          note: `Created from ${input.source?.toLowerCase().replaceAll("_", " ") ?? "other"} source.`,
        },
      });
      return { opportunity: created, company };
    });

    await audit(prisma, {
      userId: actor.id,
      actor: actor.email,
      actorType: "USER",
      action: "Opportunity created",
      outcome: "completed",
      dataSource: "User provided",
      details: `${company.name} added to the pipeline at ${STAGE_LABELS.SOURCED}.`,
      metadata: { opportunityId: opportunity.id, companyId: company.id },
    });
    return opportunity;
  } catch (error) {
    if (isUniqueViolation(error, "openCompanyKey")) {
      // The transaction rolled back, so find the conflicting open opportunity by company identity.
      const existing = await prisma.opportunity.findFirst({
        where: {
          userId: actor.id,
          openCompanyKey: { not: null },
          company: input.companyId ? { id: input.companyId } : { name: input.company!.name },
        },
        select: { id: true },
      });
      throw new ApiError(409, OPEN_OPPORTUNITY_CONFLICT, "OPEN_OPPORTUNITY_EXISTS", { opportunityId: existing?.id ?? null });
    }
    throw error;
  }
}

async function versionConflictOrMissing(prisma: Prisma.TransactionClient, userId: string, id: string): Promise<never> {
  const exists = await prisma.opportunity.findFirst({ where: { id, userId }, select: { version: true } });
  if (!exists) throw new ApiError(404, "Opportunity not found", "OPPORTUNITY_NOT_FOUND");
  throw new ApiError(409, "This opportunity was changed in another session. Reload and try again.", "VERSION_CONFLICT", {
    currentVersion: exists.version,
  });
}

export async function updateOpportunity(prisma: PrismaClient, actor: Actor, id: string, input: UpdateOpportunityInput) {
  const { expectedVersion, ...fields } = input;
  const data = definedFields(fields);
  await assertOwned(prisma, actor.id, {
    thesisId: data.thesisId,
    contactIds: data.introducedByContactId ? [data.introducedByContactId] : [],
  });

  const updated = await prisma.$transaction(async (tx) => {
    // A fit score only applies to the thesis it was calculated against.
    const current = data.thesisId !== undefined ? await tx.opportunity.findFirst({ where: { id, userId: actor.id }, select: { thesisId: true } }) : null;
    const thesisChanged = current !== null && current.thesisId !== data.thesisId;
    const result = await tx.opportunity.updateMany({
      where: { id, userId: actor.id, version: expectedVersion },
      data: { ...data, ...(thesisChanged ? { currentFitScoreId: null } : {}), version: { increment: 1 } },
    });
    if (result.count === 0) await versionConflictOrMissing(tx, actor.id, id);
    await tx.opportunityEvent.create({
      data: {
        userId: actor.id,
        opportunityId: id,
        type: OpportunityEventType.UPDATED,
        actor: actor.email,
        // Field names only: notes and other free text are not duplicated into history.
        metadata: { fields: Object.keys(data), ...(thesisChanged ? { fitScoreCleared: true } : {}) },
      },
    });
    return tx.opportunity.findFirstOrThrow({ where: { id, userId: actor.id } });
  });

  await audit(prisma, {
    userId: actor.id,
    actor: actor.email,
    actorType: "USER",
    action: "Opportunity updated",
    outcome: "completed",
    dataSource: "User provided",
    details: `Updated fields: ${Object.keys(data).join(", ")}.`,
    metadata: { opportunityId: id },
  });
  return updated;
}

export async function changeOpportunityStage(prisma: PrismaClient, actor: Actor, id: string, input: StageChangeInput, now = new Date()) {
  const { updated, fromStage } = await prisma
    .$transaction(async (tx) => {
      const current = await tx.opportunity.findFirst({
        where: { id, userId: actor.id },
        select: { id: true, userId: true, companyId: true, stage: true, passReason: true, version: true },
      });
      if (!current) throw new ApiError(404, "Opportunity not found", "OPPORTUNITY_NOT_FOUND");
      if (current.version !== input.expectedVersion) await versionConflictOrMissing(tx, actor.id, id);
      const plan = planStageChange(current, input, now);
      if (!plan.ok) throw new ApiError(422, plan.error.message, plan.error.code);

      const result = await tx.opportunity.updateMany({
        where: { id, userId: actor.id, version: input.expectedVersion },
        data: { ...plan.data, version: { increment: 1 } },
      });
      if (result.count === 0) await versionConflictOrMissing(tx, actor.id, id);
      await tx.opportunityEvent.create({
        data: {
          userId: actor.id,
          opportunityId: id,
          type: OpportunityEventType.STAGE_CHANGED,
          fromStage: plan.event.fromStage,
          toStage: plan.event.toStage,
          note: plan.event.note,
          actor: actor.email,
        },
      });
      const saved = await tx.opportunity.findFirstOrThrow({ where: { id, userId: actor.id }, include: { company: { select: { name: true } } } });
      return { updated: saved, fromStage: current.stage };
    })
    .catch((error: unknown) => {
      if (isUniqueViolation(error, "openCompanyKey")) {
        throw new ApiError(409, `${OPEN_OPPORTUNITY_CONFLICT} Close it before reopening this one.`, "OPEN_OPPORTUNITY_EXISTS");
      }
      throw error;
    });

  await audit(prisma, {
    userId: actor.id,
    actor: actor.email,
    actorType: "USER",
    action: "Opportunity stage changed",
    outcome: "completed",
    dataSource: "User provided",
    details: `${updated.company.name}: ${STAGE_LABELS[fromStage]} to ${STAGE_LABELS[updated.stage]}.`,
    metadata: { opportunityId: id, fromStage, toStage: updated.stage },
  });
  return updated;
}

export async function linkOpportunityContact(
  prisma: PrismaClient,
  actor: Actor,
  opportunityId: string,
  input: { contactId: string; role: "FOUNDER" | "EXECUTIVE" | "INTRODUCER" | "CO_INVESTOR" | "ADVISOR" | "OTHER" },
) {
  const [opportunity, contact] = await Promise.all([
    prisma.opportunity.findFirst({ where: { id: opportunityId, userId: actor.id }, select: { id: true } }),
    prisma.contact.findFirst({ where: { id: input.contactId, userId: actor.id }, select: { id: true, fullName: true, primaryEmail: true } }),
  ]);
  if (!opportunity) throw new ApiError(404, "Opportunity not found", "OPPORTUNITY_NOT_FOUND");
  if (!contact) throw new ApiError(404, "Contact not found", "CONTACT_NOT_FOUND");

  const link = await prisma.$transaction(async (tx) => {
    const saved = await tx.opportunityContact.upsert({
      where: { opportunityId_contactId: { opportunityId, contactId: contact.id } },
      create: { userId: actor.id, opportunityId, contactId: contact.id, role: input.role },
      update: { role: input.role },
    });
    await tx.opportunityEvent.create({
      data: {
        userId: actor.id,
        opportunityId,
        type: OpportunityEventType.CONTACT_LINKED,
        actor: actor.email,
        note: `${contact.fullName ?? contact.primaryEmail ?? "Contact"} linked as ${input.role.toLowerCase().replaceAll("_", " ")}.`,
        metadata: { contactId: contact.id, role: input.role },
      },
    });
    return saved;
  });
  await audit(prisma, {
    userId: actor.id,
    actor: actor.email,
    actorType: "USER",
    action: "Opportunity contact linked",
    outcome: "completed",
    affectedContactId: contact.id,
    dataSource: "User provided",
    metadata: { opportunityId, role: input.role },
  });
  return link;
}

export async function unlinkOpportunityContact(prisma: PrismaClient, actor: Actor, opportunityId: string, contactId: string) {
  const deleted = await prisma.$transaction(async (tx) => {
    const result = await tx.opportunityContact.deleteMany({ where: { opportunityId, contactId, userId: actor.id } });
    if (result.count === 0) throw new ApiError(404, "Linked contact not found", "LINK_NOT_FOUND");
    await tx.opportunityEvent.create({
      data: {
        userId: actor.id,
        opportunityId,
        type: OpportunityEventType.CONTACT_UNLINKED,
        actor: actor.email,
        metadata: { contactId },
      },
    });
    return result.count;
  });
  await audit(prisma, {
    userId: actor.id,
    actor: actor.email,
    actorType: "USER",
    action: "Opportunity contact unlinked",
    outcome: "completed",
    affectedContactId: contactId,
    dataSource: "User provided",
    metadata: { opportunityId },
  });
  return deleted;
}

/**
 * Scores the opportunity's company against its thesis (or the most recent active thesis) with the
 * existing heuristic. Relationship input is the strongest health among linked people, computed live
 * so a stale stored value cannot leak into the score.
 */
export async function scoreOpportunity(prisma: PrismaClient, actor: Actor, opportunityId: string, now = new Date()) {
  const opportunity = await prisma.opportunity.findFirst({
    where: { id: opportunityId, userId: actor.id },
    include: {
      company: true,
      currentFitScore: { select: { overall: true } },
      contacts: { select: { contactId: true } },
    },
  });
  if (!opportunity) throw new ApiError(404, "Opportunity not found", "OPPORTUNITY_NOT_FOUND");

  const contactIds = opportunity.contacts.map((link) => link.contactId);
  const [thesis, sourceCount, supportedClaimCount, healthInputs] = await Promise.all([
    opportunity.thesisId
      ? prisma.investmentThesis.findFirst({ where: { id: opportunity.thesisId, userId: actor.id } })
      : prisma.investmentThesis.findFirst({ where: { userId: actor.id, active: true }, orderBy: { updatedAt: "desc" } }),
    prisma.source.count({ where: { userId: actor.id, companyId: opportunity.companyId } }),
    prisma.researchClaim.count({ where: { userId: actor.id, companyId: opportunity.companyId, sources: { some: {} } } }),
    loadHealthInputs(prisma, actor.id, contactIds, now),
  ]);

  const strongest =
    contactIds
      .map((id) => ({ id, health: calculateRelationshipHealth(healthInputs.get(id)!) }))
      .filter((entry) => entry.health.score !== null)
      .sort((a, b) => b.health.score! - a.health.score!)[0] ?? null;
  const score = calculateFitScore(
    {
      companyId: opportunity.companyId,
      // No organization fallback: the company name is not a sector, so a missing sector stays unavailable.
      sector: opportunity.company.sector,
      stage: opportunity.company.stage,
      geography: opportunity.company.geography,
      relationshipStrength: strongest?.health.score ?? null,
      interactionCount: strongest?.health.trend.recentCount ?? null,
      lastInteractionAt: strongest?.health.lastInteractionAt ?? null,
      sourceCount,
      supportedClaimCount,
      thesis,
    },
    DEFAULT_SCORING_WEIGHTS,
  );
  const missingInfo = score.missingInfo;

  const stored = await prisma.$transaction(async (tx) => {
    const fitScore = await tx.fitScore.create({
      data: {
        userId: actor.id,
        companyId: opportunity.companyId,
        thesisId: thesis?.id ?? null,
        overall: score.overall,
        confidence: score.confidence,
        criteria: {
          thesisMatch: score.thesisMatch,
          stageFit: score.stageFit,
          geographyFit: score.geographyFit,
          momentum: score.momentum,
          relationship: score.relationship,
          evidence: score.evidence,
        },
        weights: score.weights,
        evidence: {
          opportunityId,
          sourceCount,
          supportedClaimCount,
          relationshipContactId: strongest?.id ?? null,
          relationshipHealthScore: strongest?.health.score ?? null,
        },
        missingInfo,
        explanation: score.explanation,
        modelOrProvider: "LargeVCModel heuristic v1",
      },
    });
    await tx.opportunity.updateMany({ where: { id: opportunityId, userId: actor.id }, data: { currentFitScoreId: fitScore.id } });
    await tx.opportunityEvent.create({
      data: {
        userId: actor.id,
        opportunityId,
        type: OpportunityEventType.SCORE_UPDATED,
        actor: actor.email,
        metadata: { fitScoreId: fitScore.id, previous: opportunity.currentFitScore?.overall ?? null, current: fitScore.overall },
      },
    });
    return fitScore;
  });

  await audit(prisma, {
    userId: actor.id,
    actor: "LargeVCModel",
    action: "Opportunity fit score generated",
    outcome: "completed",
    dataSource: "Company fields, research claims and relationship health",
    details: `Overall ${stored.overall} with confidence ${stored.confidence}.`,
    scoreDelta: opportunity.currentFitScore ? String(stored.overall - opportunity.currentFitScore.overall) : null,
    metadata: { opportunityId, fitScoreId: stored.id },
  });
  return stored;
}
