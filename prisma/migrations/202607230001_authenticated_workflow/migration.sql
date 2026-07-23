ALTER TYPE "ContactSource" ADD VALUE IF NOT EXISTS 'GOOGLE_CALENDAR';

DO $$
BEGIN
  CREATE TYPE "ContactInteractionType" AS ENUM (
    'EMAIL_SENT',
    'EMAIL_RECEIVED',
    'CALENDAR_MEETING',
    'CONTACT_IMPORTED',
    'MANUAL_NOTE'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "SyncJobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "SyncProvider" AS ENUM ('GOOGLE_CONTACTS', 'GMAIL', 'GOOGLE_CALENDAR');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Session" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  ALTER TABLE "Session"
    ADD CONSTRAINT "Session_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON "Session"("userId");
CREATE INDEX IF NOT EXISTS "Session_expiresAt_idx" ON "Session"("expiresAt");

ALTER TABLE "Integration" ADD COLUMN IF NOT EXISTS "syncCursor" JSONB;
ALTER TABLE "Integration" ADD COLUMN IF NOT EXISTS "recordsProcessed" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "ContactInteraction" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "type" "ContactInteractionType" NOT NULL,
  "providerId" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContactInteraction_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  ALTER TABLE "ContactInteraction"
    ADD CONSTRAINT "ContactInteraction_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "ContactInteraction"
    ADD CONSTRAINT "ContactInteraction_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "ContactInteraction_userId_type_providerId_key"
  ON "ContactInteraction"("userId", "type", "providerId");
CREATE INDEX IF NOT EXISTS "ContactInteraction_userId_occurredAt_idx"
  ON "ContactInteraction"("userId", "occurredAt");
CREATE INDEX IF NOT EXISTS "ContactInteraction_contactId_occurredAt_idx"
  ON "ContactInteraction"("contactId", "occurredAt");

ALTER TABLE "GmailThread" ADD COLUMN IF NOT EXISTS "participantEmails" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "GmailThread" ADD COLUMN IF NOT EXISTS "hasUserReply" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "SyncJob" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" "SyncProvider" NOT NULL,
  "status" "SyncJobStatus" NOT NULL DEFAULT 'PENDING',
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "recordsProcessed" INTEGER NOT NULL DEFAULT 0,
  "cursor" JSONB,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SyncJob_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  ALTER TABLE "SyncJob"
    ADD CONSTRAINT "SyncJob_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "SyncJob_userId_status_idx" ON "SyncJob"("userId", "status");
CREATE INDEX IF NOT EXISTS "SyncJob_userId_provider_status_idx" ON "SyncJob"("userId", "provider", "status");
CREATE INDEX IF NOT EXISTS "SyncJob_createdAt_idx" ON "SyncJob"("createdAt");
