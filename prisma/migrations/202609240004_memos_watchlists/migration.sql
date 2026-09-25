-- CreateEnum
CREATE TYPE "InvestmentMemoStatus" AS ENUM ('DRAFT', 'FINALIZED');

-- CreateEnum
CREATE TYPE "WatchEntityType" AS ENUM ('COMPANY', 'CONTACT', 'OPPORTUNITY');

-- CreateEnum
CREATE TYPE "WatchSignalType" AS ENUM ('NEW_RESEARCH_CLAIM', 'NEW_SOURCE', 'NEW_EMAIL', 'NEW_MEETING', 'RELATIONSHIP_HEALTH_CHANGED', 'OPPORTUNITY_STAGE_CHANGED', 'FIT_SCORE_CHANGED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OpportunityEventType" ADD VALUE 'MEMO_GENERATED';
ALTER TYPE "OpportunityEventType" ADD VALUE 'MEMO_FINALIZED';

-- CreateTable
CREATE TABLE "InvestmentMemo" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "InvestmentMemoStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "contentVersion" TEXT NOT NULL,
    "claimCount" INTEGER NOT NULL DEFAULT 0,
    "sourceCount" INTEGER NOT NULL DEFAULT 0,
    "reviewerNotes" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizedAt" TIMESTAMP(3),
    "finalizedBy" TEXT,

    CONSTRAINT "InvestmentMemo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WatchlistItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityType" "WatchEntityType" NOT NULL,
    "companyId" TEXT,
    "contactId" TEXT,
    "opportunityId" TEXT,
    "note" TEXT,
    "lastCheckedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WatchlistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WatchSignal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "watchlistItemId" TEXT NOT NULL,
    "type" "WatchSignalType" NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "provenance" TEXT NOT NULL,
    "sourceRecordType" TEXT NOT NULL,
    "sourceRecordId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    "dedupeKey" TEXT NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "WatchSignal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvestmentMemo_userId_generatedAt_idx" ON "InvestmentMemo"("userId", "generatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "InvestmentMemo_opportunityId_version_key" ON "InvestmentMemo"("opportunityId", "version");

-- CreateIndex
CREATE INDEX "WatchlistItem_userId_createdAt_idx" ON "WatchlistItem"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WatchlistItem_userId_companyId_key" ON "WatchlistItem"("userId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "WatchlistItem_userId_contactId_key" ON "WatchlistItem"("userId", "contactId");

-- CreateIndex
CREATE UNIQUE INDEX "WatchlistItem_userId_opportunityId_key" ON "WatchlistItem"("userId", "opportunityId");

-- CreateIndex
CREATE INDEX "WatchSignal_userId_readAt_detectedAt_idx" ON "WatchSignal"("userId", "readAt", "detectedAt");

-- CreateIndex
CREATE INDEX "WatchSignal_watchlistItemId_detectedAt_idx" ON "WatchSignal"("watchlistItemId", "detectedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WatchSignal_userId_dedupeKey_key" ON "WatchSignal"("userId", "dedupeKey");

-- AddForeignKey
ALTER TABLE "InvestmentMemo" ADD CONSTRAINT "InvestmentMemo_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestmentMemo" ADD CONSTRAINT "InvestmentMemo_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchlistItem" ADD CONSTRAINT "WatchlistItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchlistItem" ADD CONSTRAINT "WatchlistItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchlistItem" ADD CONSTRAINT "WatchlistItem_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchlistItem" ADD CONSTRAINT "WatchlistItem_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchSignal" ADD CONSTRAINT "WatchSignal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchSignal" ADD CONSTRAINT "WatchSignal_watchlistItemId_fkey" FOREIGN KEY ("watchlistItemId") REFERENCES "WatchlistItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- A watchlist item targets exactly one record, matching its entity type.
ALTER TABLE "WatchlistItem" ADD CONSTRAINT "WatchlistItem_single_target_check" CHECK (
  ("entityType" = 'COMPANY' AND "companyId" IS NOT NULL AND "contactId" IS NULL AND "opportunityId" IS NULL) OR
  ("entityType" = 'CONTACT' AND "contactId" IS NOT NULL AND "companyId" IS NULL AND "opportunityId" IS NULL) OR
  ("entityType" = 'OPPORTUNITY' AND "opportunityId" IS NOT NULL AND "companyId" IS NULL AND "contactId" IS NULL)
);
