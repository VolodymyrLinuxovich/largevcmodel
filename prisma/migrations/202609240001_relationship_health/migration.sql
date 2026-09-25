-- CreateEnum
CREATE TYPE "RelationshipHealthState" AS ENUM ('STRENGTHENING', 'STABLE', 'COOLING', 'DORMANT', 'INSUFFICIENT_DATA');

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "healthCalculatedAt" TIMESTAMP(3),
ADD COLUMN     "healthScore" INTEGER,
ADD COLUMN     "healthState" "RelationshipHealthState",
ADD COLUMN     "nextFollowUpAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "RelationshipHealthSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "state" "RelationshipHealthState" NOT NULL,
    "score" INTEGER,
    "previousState" "RelationshipHealthState",
    "previousScore" INTEGER,
    "lastInteractionAt" TIMESTAMP(3),
    "nextFollowUpAt" TIMESTAMP(3),
    "components" JSONB NOT NULL,
    "evidence" JSONB NOT NULL,
    "explanation" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "algorithmVersion" TEXT NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RelationshipHealthSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RelationshipHealthSnapshot_userId_calculatedAt_idx" ON "RelationshipHealthSnapshot"("userId", "calculatedAt");

-- CreateIndex
CREATE INDEX "RelationshipHealthSnapshot_contactId_calculatedAt_idx" ON "RelationshipHealthSnapshot"("contactId", "calculatedAt");

-- CreateIndex
CREATE INDEX "Contact_userId_healthState_idx" ON "Contact"("userId", "healthState");

-- CreateIndex
CREATE INDEX "Contact_userId_nextFollowUpAt_idx" ON "Contact"("userId", "nextFollowUpAt");

-- AddForeignKey
ALTER TABLE "RelationshipHealthSnapshot" ADD CONSTRAINT "RelationshipHealthSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RelationshipHealthSnapshot" ADD CONSTRAINT "RelationshipHealthSnapshot_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

