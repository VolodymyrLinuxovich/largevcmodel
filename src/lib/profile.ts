import "server-only";

import {
  ConnectionStatus,
  Prisma,
  PrismaClient,
  ProductStage,
  ProfilePermission,
  ProfileVisibility,
  ProjectStatus,
  VerifiedStatus,
} from "@prisma/client";
import { z } from "zod";

export function normalizeUsername(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

export function slugify(value: string) {
  return normalizeUsername(value).replace(/_/g, "-") || "untitled";
}

const optionalUrl = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined)
  .pipe(z.string().url().optional());

const optionalText = (max = 280) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || undefined);

export const profileSaveSchema = z.object({
  profile: z.object({
    username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/),
    fullName: optionalText(120),
    headline: optionalText(180),
    bio: optionalText(1200),
    location: optionalText(120),
    status: optionalText(180),
    availability: optionalText(180),
    avatarUrl: optionalUrl,
    websiteUrl: optionalUrl,
    visibility: z.nativeEnum(ProfileVisibility).default(ProfileVisibility.PUBLIC),
    messagingPermission: z.nativeEnum(ProfilePermission).default(ProfilePermission.EVERYONE),
    connectionPermission: z.nativeEnum(ProfilePermission).default(ProfilePermission.EVERYONE),
    socialLinks: z
      .object({
        linkedin: optionalUrl,
        github: optionalUrl,
        x: optionalUrl,
      })
      .optional(),
  }),
  product: z
    .object({
      id: z.string().optional(),
      name: optionalText(120),
      role: optionalText(120),
      description: optionalText(500),
      category: optionalText(120),
      stage: z.nativeEnum(ProductStage).optional(),
      teamSize: z.coerce.number().int().min(0).max(100000).optional().or(z.literal("").transform(() => undefined)),
      fundingStatus: optionalText(160),
      tractionMetric: optionalText(220),
      websiteUrl: optionalUrl,
      demoUrl: optionalUrl,
      repositoryUrl: optionalUrl,
      logoUrl: optionalUrl,
      coverImageUrl: optionalUrl,
    })
    .optional(),
  project: z
    .object({
      id: z.string().optional(),
      name: optionalText(120),
      description: optionalText(600),
      role: optionalText(120),
      technologies: optionalText(240),
      categories: optionalText(240),
      status: z.nativeEnum(ProjectStatus).default(ProjectStatus.ACTIVE),
      launchDate: optionalText(40),
      keyMetric: optionalText(180),
      websiteUrl: optionalUrl,
      logoUrl: optionalUrl,
      coverImageUrl: optionalUrl,
    })
    .optional(),
  achievement: z
    .object({
      id: z.string().optional(),
      type: optionalText(80),
      title: optionalText(160),
      organization: optionalText(160),
      date: optionalText(40),
      description: optionalText(600),
      imageUrl: optionalUrl,
      verificationUrl: optionalUrl,
    })
    .optional(),
});

export async function usernameAvailable(prisma: PrismaClient, username: string, userId?: string) {
  const normalized = normalizeUsername(username);
  if (normalized.length < 3) return false;
  const existing = await prisma.userProfile.findUnique({ where: { username: normalized }, select: { userId: true } });
  return !existing || existing.userId === userId;
}

export async function ensureProfile(prisma: PrismaClient, user: { id: string; email: string; name: string | null; imageUrl?: string | null }) {
  const existing = await prisma.userProfile.findUnique({ where: { userId: user.id } });
  if (existing) return existing;
  const base = normalizeUsername(user.email.split("@")[0] || user.id.slice(0, 8));
  let username = base || `user-${user.id.slice(0, 8)}`;
  for (let index = 2; !(await usernameAvailable(prisma, username, user.id)); index += 1) {
    username = `${base}-${index}`;
  }
  return prisma.userProfile.create({
    data: {
      userId: user.id,
      username,
      fullName: user.name ?? user.email,
      avatarUrl: user.imageUrl ?? null,
      visibility: ProfileVisibility.PUBLIC,
    },
  });
}

function stringList(value?: string) {
  return value
    ? value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function parsedDate(value?: string) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export async function saveProfile(prisma: PrismaClient, userId: string, input: z.infer<typeof profileSaveSchema>) {
  const username = normalizeUsername(input.profile.username);
  if (!(await usernameAvailable(prisma, username, userId))) {
    throw new Error("Username is already taken.");
  }

  const profile = await prisma.userProfile.upsert({
    where: { userId },
    create: {
      userId,
      username,
      fullName: input.profile.fullName,
      headline: input.profile.headline,
      bio: input.profile.bio,
      location: input.profile.location,
      status: input.profile.status,
      availability: input.profile.availability,
      avatarUrl: input.profile.avatarUrl,
      websiteUrl: input.profile.websiteUrl,
      socialLinks: input.profile.socialLinks as Prisma.InputJsonObject,
      visibility: input.profile.visibility,
      messagingPermission: input.profile.messagingPermission,
      connectionPermission: input.profile.connectionPermission,
      verifiedStatus: VerifiedStatus.UNVERIFIED,
    },
    update: {
      username,
      fullName: input.profile.fullName,
      headline: input.profile.headline,
      bio: input.profile.bio,
      location: input.profile.location,
      status: input.profile.status,
      availability: input.profile.availability,
      avatarUrl: input.profile.avatarUrl,
      websiteUrl: input.profile.websiteUrl,
      socialLinks: input.profile.socialLinks as Prisma.InputJsonObject,
      visibility: input.profile.visibility,
      messagingPermission: input.profile.messagingPermission,
      connectionPermission: input.profile.connectionPermission,
    },
  });

  if (input.product?.name) {
    const slug = slugify(input.product.name);
    if (input.product.id) {
      await prisma.product.updateMany({
        where: { id: input.product.id, ownerUserId: userId },
        data: productData(userId, input.product, slug),
      });
    } else {
      await prisma.product.upsert({
        where: { ownerUserId_slug: { ownerUserId: userId, slug } },
        create: productData(userId, input.product, slug),
        update: productData(userId, input.product, slug),
      });
    }
  }

  if (input.project?.name) {
    const slug = slugify(input.project.name);
    const data = {
      ownerUserId: userId,
      name: input.project.name,
      slug,
      description: input.project.description,
      role: input.project.role,
      technologies: stringList(input.project.technologies),
      categories: stringList(input.project.categories),
      status: input.project.status,
      launchDate: parsedDate(input.project.launchDate),
      keyMetric: input.project.keyMetric,
      websiteUrl: input.project.websiteUrl,
      logoUrl: input.project.logoUrl,
      coverImageUrl: input.project.coverImageUrl,
    };
    if (input.project.id) {
      await prisma.project.updateMany({ where: { id: input.project.id, ownerUserId: userId }, data });
    } else {
      await prisma.project.upsert({ where: { ownerUserId_slug: { ownerUserId: userId, slug } }, create: data, update: data });
    }
  }

  if (input.achievement?.title) {
    const data = {
      ownerUserId: userId,
      type: input.achievement.type ?? "Milestone",
      title: input.achievement.title,
      organization: input.achievement.organization,
      date: parsedDate(input.achievement.date),
      description: input.achievement.description,
      imageUrl: input.achievement.imageUrl,
      verificationUrl: input.achievement.verificationUrl,
      verificationStatus: VerifiedStatus.UNVERIFIED,
    };
    if (input.achievement.id) {
      await prisma.achievement.updateMany({ where: { id: input.achievement.id, ownerUserId: userId }, data });
    } else {
      await prisma.achievement.create({ data });
    }
  }

  return profile;
}

function productData(
  ownerUserId: string,
  product: NonNullable<z.infer<typeof profileSaveSchema>["product"]>,
  slug: string,
) {
  return {
    ownerUserId,
    name: product.name!,
    slug,
    role: product.role,
    description: product.description,
    category: product.category,
    stage: product.stage,
    teamSize: product.teamSize ? Number(product.teamSize) : undefined,
    fundingStatus: product.fundingStatus,
    tractionMetrics: product.tractionMetric ? ({ selfReported: product.tractionMetric, verification: "unverified self-reported" } as Prisma.InputJsonObject) : undefined,
    websiteUrl: product.websiteUrl,
    demoUrl: product.demoUrl,
    repositoryUrl: product.repositoryUrl,
    logoUrl: product.logoUrl,
    coverImageUrl: product.coverImageUrl,
    isFeatured: true,
    verificationStatus: VerifiedStatus.UNVERIFIED,
  };
}

export async function canViewProfile(
  prisma: PrismaClient,
  profile: { userId: string; visibility: ProfileVisibility },
  viewerUserId?: string | null,
) {
  if (viewerUserId === profile.userId) return true;
  if (profile.visibility === ProfileVisibility.PUBLIC) return true;
  if (!viewerUserId || profile.visibility === ProfileVisibility.PRIVATE) return false;
  const connection = await prisma.connection.findFirst({
    where: {
      status: ConnectionStatus.ACCEPTED,
      OR: [
        { requesterUserId: viewerUserId, recipientUserId: profile.userId },
        { requesterUserId: profile.userId, recipientUserId: viewerUserId },
      ],
    },
  });
  return Boolean(connection);
}
