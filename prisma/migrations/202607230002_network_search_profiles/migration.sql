DO $$
BEGIN
  CREATE TYPE "ProfileVisibility" AS ENUM ('PUBLIC', 'CONNECTIONS', 'PRIVATE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "VerifiedStatus" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "ProfilePermission" AS ENUM ('EVERYONE', 'CONNECTIONS', 'NONE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "ProductStage" AS ENUM ('IDEA', 'MVP', 'PRIVATE_BETA', 'PUBLIC_BETA', 'LAUNCHED', 'SCALING', 'ACQUIRED', 'ARCHIVED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ARCHIVED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "ConnectionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'BLOCKED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "ProfileActivityVisibility" AS ENUM ('PUBLIC', 'CONNECTIONS', 'PRIVATE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "ProfileActivitySource" AS ENUM ('USER_POSTED', 'PLATFORM_ACTION', 'APPROVED_IMPORT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "GmailThread" ADD COLUMN IF NOT EXISTS "entityClassification" TEXT;
ALTER TABLE "GmailThread" ADD COLUMN IF NOT EXISTS "classificationConfidence" INTEGER;
ALTER TABLE "GmailThread" ADD COLUMN IF NOT EXISTS "classificationSignals" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "GmailMessage" ADD COLUMN IF NOT EXISTS "headers" JSONB;

CREATE TABLE IF NOT EXISTS "UserProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "fullName" TEXT,
  "headline" TEXT,
  "bio" TEXT,
  "location" TEXT,
  "status" TEXT,
  "availability" TEXT,
  "avatarUrl" TEXT,
  "websiteUrl" TEXT,
  "socialLinks" JSONB,
  "verifiedStatus" "VerifiedStatus" NOT NULL DEFAULT 'UNVERIFIED',
  "visibility" "ProfileVisibility" NOT NULL DEFAULT 'PUBLIC',
  "messagingPermission" "ProfilePermission" NOT NULL DEFAULT 'EVERYONE',
  "connectionPermission" "ProfilePermission" NOT NULL DEFAULT 'EVERYONE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserProfile_userId_key" ON "UserProfile"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "UserProfile_username_key" ON "UserProfile"("username");
CREATE INDEX IF NOT EXISTS "UserProfile_visibility_idx" ON "UserProfile"("visibility");
CREATE INDEX IF NOT EXISTS "UserProfile_username_idx" ON "UserProfile"("username");

DO $$
BEGIN
  ALTER TABLE "UserProfile"
    ADD CONSTRAINT "UserProfile_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Product" (
  "id" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "role" TEXT,
  "description" TEXT,
  "category" TEXT,
  "stage" "ProductStage",
  "tractionMetrics" JSONB,
  "teamSize" INTEGER,
  "fundingStatus" TEXT,
  "websiteUrl" TEXT,
  "demoUrl" TEXT,
  "repositoryUrl" TEXT,
  "logoUrl" TEXT,
  "coverImageUrl" TEXT,
  "isFeatured" BOOLEAN NOT NULL DEFAULT false,
  "verificationStatus" "VerifiedStatus" NOT NULL DEFAULT 'UNVERIFIED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Product_ownerUserId_slug_key" ON "Product"("ownerUserId", "slug");
CREATE INDEX IF NOT EXISTS "Product_ownerUserId_isFeatured_idx" ON "Product"("ownerUserId", "isFeatured");
CREATE INDEX IF NOT EXISTS "Product_ownerUserId_stage_idx" ON "Product"("ownerUserId", "stage");

DO $$
BEGIN
  ALTER TABLE "Product"
    ADD CONSTRAINT "Product_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Project" (
  "id" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "role" TEXT,
  "technologies" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "categories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
  "launchDate" TIMESTAMP(3),
  "keyMetric" TEXT,
  "websiteUrl" TEXT,
  "logoUrl" TEXT,
  "coverImageUrl" TEXT,
  "verificationStatus" "VerifiedStatus" NOT NULL DEFAULT 'UNVERIFIED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Project_ownerUserId_slug_key" ON "Project"("ownerUserId", "slug");
CREATE INDEX IF NOT EXISTS "Project_ownerUserId_status_idx" ON "Project"("ownerUserId", "status");

DO $$
BEGIN
  ALTER TABLE "Project"
    ADD CONSTRAINT "Project_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Achievement" (
  "id" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "organization" TEXT,
  "date" TIMESTAMP(3),
  "description" TEXT,
  "imageUrl" TEXT,
  "verificationUrl" TEXT,
  "verificationStatus" "VerifiedStatus" NOT NULL DEFAULT 'UNVERIFIED',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "archivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Achievement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Achievement_ownerUserId_sortOrder_idx" ON "Achievement"("ownerUserId", "sortOrder");
CREATE INDEX IF NOT EXISTS "Achievement_ownerUserId_type_idx" ON "Achievement"("ownerUserId", "type");

DO $$
BEGIN
  ALTER TABLE "Achievement"
    ADD CONSTRAINT "Achievement_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Connection" (
  "id" TEXT NOT NULL,
  "requesterUserId" TEXT NOT NULL,
  "recipientUserId" TEXT NOT NULL,
  "status" "ConnectionStatus" NOT NULL DEFAULT 'PENDING',
  "relationshipType" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Connection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Connection_requesterUserId_recipientUserId_key" ON "Connection"("requesterUserId", "recipientUserId");
CREATE INDEX IF NOT EXISTS "Connection_recipientUserId_status_idx" ON "Connection"("recipientUserId", "status");
CREATE INDEX IF NOT EXISTS "Connection_requesterUserId_status_idx" ON "Connection"("requesterUserId", "status");

DO $$
BEGIN
  ALTER TABLE "Connection"
    ADD CONSTRAINT "Connection_requesterUserId_fkey"
    FOREIGN KEY ("requesterUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "Connection"
    ADD CONSTRAINT "Connection_recipientUserId_fkey"
    FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Follow" (
  "followerUserId" TEXT NOT NULL,
  "followedUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Follow_pkey" PRIMARY KEY ("followerUserId", "followedUserId")
);

CREATE INDEX IF NOT EXISTS "Follow_followedUserId_idx" ON "Follow"("followedUserId");

DO $$
BEGIN
  ALTER TABLE "Follow"
    ADD CONSTRAINT "Follow_followerUserId_fkey"
    FOREIGN KEY ("followerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "Follow"
    ADD CONSTRAINT "Follow_followedUserId_fkey"
    FOREIGN KEY ("followedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ProfileActivity" (
  "id" TEXT NOT NULL,
  "ownerUserId" TEXT NOT NULL,
  "activityType" TEXT NOT NULL,
  "subjectType" TEXT,
  "subjectId" TEXT,
  "text" TEXT NOT NULL,
  "visibility" "ProfileActivityVisibility" NOT NULL DEFAULT 'PUBLIC',
  "source" "ProfileActivitySource" NOT NULL DEFAULT 'USER_POSTED',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProfileActivity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProfileActivity_ownerUserId_createdAt_idx" ON "ProfileActivity"("ownerUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "ProfileActivity_visibility_idx" ON "ProfileActivity"("visibility");

DO $$
BEGIN
  ALTER TABLE "ProfileActivity"
    ADD CONSTRAINT "ProfileActivity_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ProfileViewEvent" (
  "id" TEXT NOT NULL,
  "profileUserId" TEXT NOT NULL,
  "viewerUserId" TEXT,
  "anonymousSessionId" TEXT,
  "source" TEXT,
  "referrer" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProfileViewEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProfileViewEvent_profileUserId_createdAt_idx" ON "ProfileViewEvent"("profileUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "ProfileViewEvent_viewerUserId_idx" ON "ProfileViewEvent"("viewerUserId");

DO $$
BEGIN
  ALTER TABLE "ProfileViewEvent"
    ADD CONSTRAINT "ProfileViewEvent_profileUserId_fkey"
    FOREIGN KEY ("profileUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ProfileViewEvent"
    ADD CONSTRAINT "ProfileViewEvent_viewerUserId_fkey"
    FOREIGN KEY ("viewerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "ProfileLinkClick" (
  "id" TEXT NOT NULL,
  "profileUserId" TEXT NOT NULL,
  "linkType" TEXT NOT NULL,
  "targetUrl" TEXT NOT NULL,
  "viewerUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProfileLinkClick_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ProfileLinkClick_profileUserId_createdAt_idx" ON "ProfileLinkClick"("profileUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "ProfileLinkClick_linkType_idx" ON "ProfileLinkClick"("linkType");

DO $$
BEGIN
  ALTER TABLE "ProfileLinkClick"
    ADD CONSTRAINT "ProfileLinkClick_profileUserId_fkey"
    FOREIGN KEY ("profileUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ProfileLinkClick"
    ADD CONSTRAINT "ProfileLinkClick_viewerUserId_fkey"
    FOREIGN KEY ("viewerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "MessageThread" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MessageThread_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "MessageParticipant" (
  "threadId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "lastReadAt" TIMESTAMP(3),
  CONSTRAINT "MessageParticipant_pkey" PRIMARY KEY ("threadId", "userId")
);

CREATE INDEX IF NOT EXISTS "MessageParticipant_userId_idx" ON "MessageParticipant"("userId");

DO $$
BEGIN
  ALTER TABLE "MessageParticipant"
    ADD CONSTRAINT "MessageParticipant_threadId_fkey"
    FOREIGN KEY ("threadId") REFERENCES "MessageThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "MessageParticipant"
    ADD CONSTRAINT "MessageParticipant_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "PlatformMessage" (
  "id" TEXT NOT NULL,
  "threadId" TEXT NOT NULL,
  "senderUserId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "editedAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "PlatformMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PlatformMessage_threadId_createdAt_idx" ON "PlatformMessage"("threadId", "createdAt");
CREATE INDEX IF NOT EXISTS "PlatformMessage_senderUserId_createdAt_idx" ON "PlatformMessage"("senderUserId", "createdAt");

DO $$
BEGIN
  ALTER TABLE "PlatformMessage"
    ADD CONSTRAINT "PlatformMessage_threadId_fkey"
    FOREIGN KEY ("threadId") REFERENCES "MessageThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "PlatformMessage"
    ADD CONSTRAINT "PlatformMessage_senderUserId_fkey"
    FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
