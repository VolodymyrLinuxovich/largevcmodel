-- CreateEnum
CREATE TYPE "OpportunityStage" AS ENUM ('SOURCED', 'SCREENING', 'MEETING', 'DILIGENCE', 'IC', 'INVESTED', 'PASSED');

-- CreateEnum
CREATE TYPE "OpportunityPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "OpportunitySource" AS ENUM ('INBOUND', 'WARM_INTRO', 'OUTBOUND', 'RESEARCH', 'EVENT', 'REFERRAL', 'OTHER');

-- CreateEnum
CREATE TYPE "OpportunityContactRole" AS ENUM ('FOUNDER', 'EXECUTIVE', 'INTRODUCER', 'CO_INVESTOR', 'ADVISOR', 'OTHER');

-- CreateEnum
CREATE TYPE "OpportunityEventType" AS ENUM ('CREATED', 'STAGE_CHANGED', 'UPDATED', 'CONTACT_LINKED', 'CONTACT_UNLINKED', 'SCORE_UPDATED');

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "thesisId" TEXT,
    "currentFitScoreId" TEXT,
    "introducedByContactId" TEXT,
    "title" TEXT,
    "stage" "OpportunityStage" NOT NULL DEFAULT 'SOURCED',
    "priority" "OpportunityPriority" NOT NULL DEFAULT 'MEDIUM',
    "ownerName" TEXT,
    "source" "OpportunitySource" NOT NULL DEFAULT 'OTHER',
    "sourceDetail" TEXT,
    "nextAction" TEXT,
    "nextActionAt" TIMESTAMP(3),
    "notes" TEXT,
    "passReason" TEXT,
    "openCompanyKey" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "stageChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunityContact" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "role" "OpportunityContactRole" NOT NULL DEFAULT 'OTHER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpportunityContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunityEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "type" "OpportunityEventType" NOT NULL,
    "fromStage" "OpportunityStage",
    "toStage" "OpportunityStage",
    "actor" TEXT NOT NULL,
    "note" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpportunityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Opportunity_openCompanyKey_key" ON "Opportunity"("openCompanyKey");

-- CreateIndex
CREATE INDEX "Opportunity_userId_stage_updatedAt_idx" ON "Opportunity"("userId", "stage", "updatedAt");

-- CreateIndex
CREATE INDEX "Opportunity_userId_nextActionAt_idx" ON "Opportunity"("userId", "nextActionAt");

-- CreateIndex
CREATE INDEX "Opportunity_companyId_idx" ON "Opportunity"("companyId");

-- CreateIndex
CREATE INDEX "OpportunityContact_userId_contactId_idx" ON "OpportunityContact"("userId", "contactId");

-- CreateIndex
CREATE UNIQUE INDEX "OpportunityContact_opportunityId_contactId_key" ON "OpportunityContact"("opportunityId", "contactId");

-- CreateIndex
CREATE INDEX "OpportunityEvent_opportunityId_createdAt_idx" ON "OpportunityEvent"("opportunityId", "createdAt");

-- CreateIndex
CREATE INDEX "OpportunityEvent_userId_createdAt_idx" ON "OpportunityEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "FitScore_companyId_calculatedAt_idx" ON "FitScore"("companyId", "calculatedAt");

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_thesisId_fkey" FOREIGN KEY ("thesisId") REFERENCES "InvestmentThesis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_currentFitScoreId_fkey" FOREIGN KEY ("currentFitScoreId") REFERENCES "FitScore"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_introducedByContactId_fkey" FOREIGN KEY ("introducedByContactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityContact" ADD CONSTRAINT "OpportunityContact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityContact" ADD CONSTRAINT "OpportunityContact_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityContact" ADD CONSTRAINT "OpportunityContact_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityEvent" ADD CONSTRAINT "OpportunityEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityEvent" ADD CONSTRAINT "OpportunityEvent_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

