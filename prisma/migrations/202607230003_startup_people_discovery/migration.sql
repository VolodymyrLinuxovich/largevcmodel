-- CreateEnum
CREATE TYPE "PitchDeckProcessingStatus" AS ENUM ('NOT_UPLOADED', 'UPLOADED', 'PARSING', 'NEEDS_REVIEW', 'APPROVED', 'ERROR');

-- CreateEnum
CREATE TYPE "ExtractionFieldStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'EDITED');

-- CreateEnum
CREATE TYPE "PersonType" AS ENUM ('INVESTOR', 'FOUNDER', 'OPERATOR', 'ADVISOR', 'ACCELERATOR', 'SCOUT', 'RESEARCHER', 'POTENTIAL_CUSTOMER', 'STRATEGIC_PARTNER');

-- CreateEnum
CREATE TYPE "PeopleSearchStatus" AS ENUM ('RUNNING', 'COMPLETED', 'PARTIAL', 'UNAVAILABLE', 'ERROR');

-- CreateEnum
CREATE TYPE "ProviderHealthStatus" AS ENUM ('CONFIGURED', 'UNAVAILABLE', 'DEGRADED', 'AUTHENTICATION_ERROR', 'RATE_LIMITED', 'PROVIDER_ERROR');

-- CreateEnum
CREATE TYPE "PersonDiscoveryType" AS ENUM ('EXTERNALLY_DISCOVERED', 'MANUALLY_ADDED');

-- CreateEnum
CREATE TYPE "SavedPersonStatus" AS ENUM ('RESEARCHING', 'HIGH_PRIORITY', 'READY_FOR_OUTREACH', 'CONTACTED', 'REPLIED', 'MEETING_SCHEDULED', 'PASSED', 'NOT_RELEVANT');

-- CreateEnum
CREATE TYPE "EntityResolutionOutcome" AS ENUM ('EXACT_MATCH', 'PROBABLE_MATCH', 'UNCERTAIN_MATCH', 'NO_MATCH');

-- CreateTable
CREATE TABLE "StartupProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "logoUrl" TEXT,
    "oneLineDescription" TEXT,
    "description" TEXT,
    "industry" TEXT,
    "subIndustries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "product" TEXT,
    "problem" TEXT,
    "solution" TEXT,
    "targetCustomers" TEXT,
    "customerSegments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "businessModel" TEXT,
    "revenueModel" TEXT,
    "fundingStage" TEXT,
    "fundingTarget" INTEGER,
    "minCheckSize" INTEGER,
    "maxCheckSize" INTEGER,
    "headquarters" TEXT,
    "targetGeographies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "traction" TEXT,
    "revenue" TEXT,
    "growthMetrics" JSONB,
    "customerCount" INTEGER,
    "pilots" TEXT,
    "partnerships" TEXT,
    "team" TEXT,
    "founderBackgrounds" TEXT,
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "technologies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "moat" TEXT,
    "competitors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferredInvestorTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "excludedInvestors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "excludedOrganizations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fundraisingStatus" TEXT,
    "fundraisingTimeline" TEXT,
    "customNotes" TEXT,
    "searchCriteria" JSONB,
    "profileCompleteness" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StartupProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PitchDeck" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startupId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileData" BYTEA NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "extractionStatus" "PitchDeckProcessingStatus" NOT NULL DEFAULT 'UPLOADED',
    "extractionVersion" INTEGER NOT NULL DEFAULT 1,
    "extractedText" TEXT,
    "structuredFields" JSONB,
    "extractionConfidence" INTEGER,
    "extractionWarnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastProcessedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PitchDeck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PitchDeckExtraction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startupId" TEXT NOT NULL,
    "pitchDeckId" TEXT NOT NULL,
    "status" "PitchDeckProcessingStatus" NOT NULL DEFAULT 'PARSING',
    "extractionVersion" INTEGER NOT NULL DEFAULT 1,
    "extractedText" TEXT,
    "structuredFields" JSONB,
    "extractionConfidence" INTEGER,
    "extractionWarnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "PitchDeckExtraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PitchDeckExtractionField" (
    "id" TEXT NOT NULL,
    "extractionId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "extractedValue" TEXT,
    "currentValue" TEXT,
    "confidence" INTEGER,
    "sourcePage" INTEGER,
    "status" "ExtractionFieldStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PitchDeckExtractionField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscoveredOrganization" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerOrgId" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "website" TEXT,
    "domain" TEXT,
    "description" TEXT,
    "location" TEXT,
    "industries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "investmentStages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "minCheckSize" INTEGER,
    "maxCheckSize" INTEGER,
    "portfolio" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "publicUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sourceConfidence" INTEGER,
    "firstResearchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastResearchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscoveredOrganization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscoveredPerson" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerPersonId" TEXT,
    "fullName" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "currentTitle" TEXT,
    "currentOrganizationId" TEXT,
    "currentOrganizationName" TEXT,
    "previousOrganizations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "personTypes" "PersonType"[] DEFAULT ARRAY[]::"PersonType"[],
    "location" TEXT,
    "biography" TEXT,
    "investmentThesis" TEXT,
    "industries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "subIndustries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferredStages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "minCheckSize" INTEGER,
    "maxCheckSize" INTEGER,
    "geographyPreferences" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "portfolioCompanies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notableInvestments" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notableExperience" TEXT,
    "education" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "technologies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "emailAddresses" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "organizationDomain" TEXT,
    "linkedinUrl" TEXT,
    "xUrl" TEXT,
    "personalWebsite" TEXT,
    "publicProfileUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sourceConfidence" INTEGER,
    "fieldConfidence" JSONB,
    "conflictingClaims" JSONB,
    "searchText" TEXT NOT NULL,
    "normalizedFingerprint" TEXT,
    "firstResearchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastResearchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "researchProvider" TEXT NOT NULL,
    "manuallyAdded" BOOLEAN NOT NULL DEFAULT false,
    "externallyDiscovered" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscoveredPerson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonOrganization" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "title" TEXT,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "confidence" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonOrganization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonSource" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "personId" TEXT,
    "organizationId" TEXT,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "canonicalUrl" TEXT NOT NULL,
    "publisher" TEXT,
    "publishedAt" TIMESTAMP(3),
    "accessedAt" TIMESTAMP(3) NOT NULL,
    "sourceType" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "snippet" TEXT,
    "supportsClaims" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "confidence" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonClaim" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "personId" TEXT,
    "organizationId" TEXT,
    "fieldKey" TEXT,
    "text" TEXT NOT NULL,
    "provenance" "ClaimProvenance" NOT NULL,
    "confidence" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonClaimSource" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "supportedClaim" TEXT NOT NULL,

    CONSTRAINT "PersonClaimSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PeopleSearchRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startupId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "interpretedCriteria" JSONB NOT NULL,
    "filters" JSONB,
    "provider" TEXT NOT NULL,
    "providerStatus" "ProviderHealthStatus" NOT NULL,
    "status" "PeopleSearchStatus" NOT NULL DEFAULT 'RUNNING',
    "total" INTEGER NOT NULL DEFAULT 0,
    "candidateCount" INTEGER NOT NULL DEFAULT 0,
    "normalizedCount" INTEGER NOT NULL DEFAULT 0,
    "dedupedCount" INTEGER NOT NULL DEFAULT 0,
    "filteredCount" INTEGER NOT NULL DEFAULT 0,
    "rankedCount" INTEGER NOT NULL DEFAULT 0,
    "providerLatencyMs" INTEGER,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PeopleSearchRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PeopleSearchResult" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "searchRunId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "organizationId" TEXT,
    "rank" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "confidence" INTEGER NOT NULL,
    "explanation" TEXT NOT NULL,
    "matchedCriteria" JSONB NOT NULL,
    "missingCriteria" JSONB NOT NULL,
    "uncertainCriteria" JSONB NOT NULL,
    "relationship" JSONB,
    "sourcesSnapshot" JSONB NOT NULL,
    "discoveryType" "PersonDiscoveryType" NOT NULL DEFAULT 'EXTERNALLY_DISCOVERED',
    "savedSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PeopleSearchResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonFitScore" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startupId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "overall" INTEGER NOT NULL,
    "confidence" INTEGER NOT NULL,
    "components" JSONB NOT NULL,
    "explanation" TEXT NOT NULL,
    "matchedCriteria" JSONB NOT NULL,
    "missingCriteria" JSONB NOT NULL,
    "uncertainCriteria" JSONB NOT NULL,
    "sourceCoverage" JSONB NOT NULL,
    "relationshipContribution" INTEGER NOT NULL DEFAULT 0,
    "modelVersion" TEXT NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonFitScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonRelationshipEnrichment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "contactId" TEXT,
    "directEmailHistory" BOOLEAN NOT NULL DEFAULT false,
    "gmailThreadCount" INTEGER NOT NULL DEFAULT 0,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "mostRecentInteraction" TIMESTAMP(3),
    "firstInteraction" TIMESTAMP(3),
    "inboundOutboundBalance" JSONB,
    "googleContactPresent" BOOLEAN NOT NULL DEFAULT false,
    "savedContactOrg" TEXT,
    "knownAliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "relationshipStrength" INTEGER NOT NULL DEFAULT 0,
    "possibleIntroPath" JSONB,
    "evidence" JSONB NOT NULL,
    "confidence" INTEGER NOT NULL DEFAULT 0,
    "refreshedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonRelationshipEnrichment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedPeopleList" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startupId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedPeopleList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedPerson" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "searchRunId" TEXT,
    "searchResultId" TEXT,
    "status" "SavedPersonStatus" NOT NULL DEFAULT 'RESEARCHING',
    "notes" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "savedReason" TEXT,
    "lastResearchRefresh" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedPerson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonEmbedding" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "dimensions" INTEGER NOT NULL,
    "vector" DOUBLE PRECISION[],
    "sourceContentHash" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stale" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PersonEmbedding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntityResolutionDecision" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "incomingFingerprint" TEXT NOT NULL,
    "canonicalPersonId" TEXT,
    "outcome" "EntityResolutionOutcome" NOT NULL,
    "confidence" INTEGER NOT NULL,
    "rationale" TEXT NOT NULL,
    "signals" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntityResolutionDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StartupProfile_userId_updatedAt_idx" ON "StartupProfile"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "StartupProfile_userId_isActive_idx" ON "StartupProfile"("userId", "isActive");

-- CreateIndex
CREATE INDEX "PitchDeck_userId_startupId_idx" ON "PitchDeck"("userId", "startupId");

-- CreateIndex
CREATE INDEX "PitchDeck_userId_uploadedAt_idx" ON "PitchDeck"("userId", "uploadedAt");

-- CreateIndex
CREATE INDEX "PitchDeckExtraction_userId_startupId_createdAt_idx" ON "PitchDeckExtraction"("userId", "startupId", "createdAt");

-- CreateIndex
CREATE INDEX "PitchDeckExtraction_pitchDeckId_createdAt_idx" ON "PitchDeckExtraction"("pitchDeckId", "createdAt");

-- CreateIndex
CREATE INDEX "PitchDeckExtractionField_fieldKey_status_idx" ON "PitchDeckExtractionField"("fieldKey", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PitchDeckExtractionField_extractionId_fieldKey_key" ON "PitchDeckExtractionField"("extractionId", "fieldKey");

-- CreateIndex
CREATE INDEX "DiscoveredOrganization_userId_name_idx" ON "DiscoveredOrganization"("userId", "name");

-- CreateIndex
CREATE INDEX "DiscoveredOrganization_userId_domain_idx" ON "DiscoveredOrganization"("userId", "domain");

-- CreateIndex
CREATE INDEX "DiscoveredOrganization_userId_lastResearchedAt_idx" ON "DiscoveredOrganization"("userId", "lastResearchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DiscoveredOrganization_userId_provider_providerOrgId_key" ON "DiscoveredOrganization"("userId", "provider", "providerOrgId");

-- CreateIndex
CREATE INDEX "DiscoveredPerson_userId_fullName_idx" ON "DiscoveredPerson"("userId", "fullName");

-- CreateIndex
CREATE INDEX "DiscoveredPerson_userId_lastResearchedAt_idx" ON "DiscoveredPerson"("userId", "lastResearchedAt");

-- CreateIndex
CREATE INDEX "DiscoveredPerson_userId_currentOrganizationName_idx" ON "DiscoveredPerson"("userId", "currentOrganizationName");

-- CreateIndex
CREATE INDEX "DiscoveredPerson_userId_sourceConfidence_idx" ON "DiscoveredPerson"("userId", "sourceConfidence");

-- CreateIndex
CREATE INDEX "DiscoveredPerson_userId_normalizedFingerprint_idx" ON "DiscoveredPerson"("userId", "normalizedFingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "DiscoveredPerson_userId_provider_providerPersonId_key" ON "DiscoveredPerson"("userId", "provider", "providerPersonId");

-- CreateIndex
CREATE INDEX "PersonOrganization_userId_organizationId_idx" ON "PersonOrganization"("userId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonOrganization_personId_organizationId_relationship_key" ON "PersonOrganization"("personId", "organizationId", "relationship");

-- CreateIndex
CREATE INDEX "PersonSource_userId_sourceType_idx" ON "PersonSource"("userId", "sourceType");

-- CreateIndex
CREATE INDEX "PersonSource_personId_idx" ON "PersonSource"("personId");

-- CreateIndex
CREATE INDEX "PersonSource_organizationId_idx" ON "PersonSource"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonSource_userId_canonicalUrl_key" ON "PersonSource"("userId", "canonicalUrl");

-- CreateIndex
CREATE INDEX "PersonClaim_userId_provenance_idx" ON "PersonClaim"("userId", "provenance");

-- CreateIndex
CREATE INDEX "PersonClaim_personId_fieldKey_idx" ON "PersonClaim"("personId", "fieldKey");

-- CreateIndex
CREATE UNIQUE INDEX "PersonClaimSource_claimId_sourceId_key" ON "PersonClaimSource"("claimId", "sourceId");

-- CreateIndex
CREATE INDEX "PeopleSearchRun_userId_createdAt_idx" ON "PeopleSearchRun"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PeopleSearchRun_userId_startupId_createdAt_idx" ON "PeopleSearchRun"("userId", "startupId", "createdAt");

-- CreateIndex
CREATE INDEX "PeopleSearchRun_userId_status_idx" ON "PeopleSearchRun"("userId", "status");

-- CreateIndex
CREATE INDEX "PeopleSearchResult_userId_score_idx" ON "PeopleSearchResult"("userId", "score");

-- CreateIndex
CREATE INDEX "PeopleSearchResult_userId_personId_idx" ON "PeopleSearchResult"("userId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "PeopleSearchResult_searchRunId_personId_key" ON "PeopleSearchResult"("searchRunId", "personId");

-- CreateIndex
CREATE INDEX "PersonFitScore_userId_startupId_calculatedAt_idx" ON "PersonFitScore"("userId", "startupId", "calculatedAt");

-- CreateIndex
CREATE INDEX "PersonFitScore_personId_calculatedAt_idx" ON "PersonFitScore"("personId", "calculatedAt");

-- CreateIndex
CREATE INDEX "PersonRelationshipEnrichment_userId_relationshipStrength_idx" ON "PersonRelationshipEnrichment"("userId", "relationshipStrength");

-- CreateIndex
CREATE INDEX "PersonRelationshipEnrichment_contactId_idx" ON "PersonRelationshipEnrichment"("contactId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonRelationshipEnrichment_userId_personId_key" ON "PersonRelationshipEnrichment"("userId", "personId");

-- CreateIndex
CREATE INDEX "SavedPeopleList_userId_startupId_idx" ON "SavedPeopleList"("userId", "startupId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedPeopleList_userId_name_key" ON "SavedPeopleList"("userId", "name");

-- CreateIndex
CREATE INDEX "SavedPerson_userId_status_idx" ON "SavedPerson"("userId", "status");

-- CreateIndex
CREATE INDEX "SavedPerson_userId_personId_idx" ON "SavedPerson"("userId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedPerson_listId_personId_key" ON "SavedPerson"("listId", "personId");

-- CreateIndex
CREATE INDEX "PersonEmbedding_userId_entityType_stale_idx" ON "PersonEmbedding"("userId", "entityType", "stale");

-- CreateIndex
CREATE UNIQUE INDEX "PersonEmbedding_userId_entityType_entityId_model_key" ON "PersonEmbedding"("userId", "entityType", "entityId", "model");

-- CreateIndex
CREATE INDEX "EntityResolutionDecision_userId_incomingFingerprint_idx" ON "EntityResolutionDecision"("userId", "incomingFingerprint");

-- CreateIndex
CREATE INDEX "EntityResolutionDecision_canonicalPersonId_idx" ON "EntityResolutionDecision"("canonicalPersonId");

-- AddForeignKey
ALTER TABLE "StartupProfile" ADD CONSTRAINT "StartupProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PitchDeck" ADD CONSTRAINT "PitchDeck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PitchDeck" ADD CONSTRAINT "PitchDeck_startupId_fkey" FOREIGN KEY ("startupId") REFERENCES "StartupProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PitchDeckExtraction" ADD CONSTRAINT "PitchDeckExtraction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PitchDeckExtraction" ADD CONSTRAINT "PitchDeckExtraction_startupId_fkey" FOREIGN KEY ("startupId") REFERENCES "StartupProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PitchDeckExtraction" ADD CONSTRAINT "PitchDeckExtraction_pitchDeckId_fkey" FOREIGN KEY ("pitchDeckId") REFERENCES "PitchDeck"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PitchDeckExtractionField" ADD CONSTRAINT "PitchDeckExtractionField_extractionId_fkey" FOREIGN KEY ("extractionId") REFERENCES "PitchDeckExtraction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscoveredOrganization" ADD CONSTRAINT "DiscoveredOrganization_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscoveredPerson" ADD CONSTRAINT "DiscoveredPerson_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscoveredPerson" ADD CONSTRAINT "DiscoveredPerson_currentOrganizationId_fkey" FOREIGN KEY ("currentOrganizationId") REFERENCES "DiscoveredOrganization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonOrganization" ADD CONSTRAINT "PersonOrganization_personId_fkey" FOREIGN KEY ("personId") REFERENCES "DiscoveredPerson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonOrganization" ADD CONSTRAINT "PersonOrganization_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "DiscoveredOrganization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonSource" ADD CONSTRAINT "PersonSource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonSource" ADD CONSTRAINT "PersonSource_personId_fkey" FOREIGN KEY ("personId") REFERENCES "DiscoveredPerson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonSource" ADD CONSTRAINT "PersonSource_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "DiscoveredOrganization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonClaim" ADD CONSTRAINT "PersonClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonClaim" ADD CONSTRAINT "PersonClaim_personId_fkey" FOREIGN KEY ("personId") REFERENCES "DiscoveredPerson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonClaim" ADD CONSTRAINT "PersonClaim_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "DiscoveredOrganization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonClaimSource" ADD CONSTRAINT "PersonClaimSource_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "PersonClaim"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonClaimSource" ADD CONSTRAINT "PersonClaimSource_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "PersonSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeopleSearchRun" ADD CONSTRAINT "PeopleSearchRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeopleSearchRun" ADD CONSTRAINT "PeopleSearchRun_startupId_fkey" FOREIGN KEY ("startupId") REFERENCES "StartupProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeopleSearchResult" ADD CONSTRAINT "PeopleSearchResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeopleSearchResult" ADD CONSTRAINT "PeopleSearchResult_searchRunId_fkey" FOREIGN KEY ("searchRunId") REFERENCES "PeopleSearchRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeopleSearchResult" ADD CONSTRAINT "PeopleSearchResult_personId_fkey" FOREIGN KEY ("personId") REFERENCES "DiscoveredPerson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeopleSearchResult" ADD CONSTRAINT "PeopleSearchResult_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "DiscoveredOrganization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonFitScore" ADD CONSTRAINT "PersonFitScore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonFitScore" ADD CONSTRAINT "PersonFitScore_startupId_fkey" FOREIGN KEY ("startupId") REFERENCES "StartupProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonFitScore" ADD CONSTRAINT "PersonFitScore_personId_fkey" FOREIGN KEY ("personId") REFERENCES "DiscoveredPerson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonRelationshipEnrichment" ADD CONSTRAINT "PersonRelationshipEnrichment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonRelationshipEnrichment" ADD CONSTRAINT "PersonRelationshipEnrichment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "DiscoveredPerson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonRelationshipEnrichment" ADD CONSTRAINT "PersonRelationshipEnrichment_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedPeopleList" ADD CONSTRAINT "SavedPeopleList_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedPeopleList" ADD CONSTRAINT "SavedPeopleList_startupId_fkey" FOREIGN KEY ("startupId") REFERENCES "StartupProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedPerson" ADD CONSTRAINT "SavedPerson_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedPerson" ADD CONSTRAINT "SavedPerson_listId_fkey" FOREIGN KEY ("listId") REFERENCES "SavedPeopleList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedPerson" ADD CONSTRAINT "SavedPerson_personId_fkey" FOREIGN KEY ("personId") REFERENCES "DiscoveredPerson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedPerson" ADD CONSTRAINT "SavedPerson_searchRunId_fkey" FOREIGN KEY ("searchRunId") REFERENCES "PeopleSearchRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedPerson" ADD CONSTRAINT "SavedPerson_searchResultId_fkey" FOREIGN KEY ("searchResultId") REFERENCES "PeopleSearchResult"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonEmbedding" ADD CONSTRAINT "PersonEmbedding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityResolutionDecision" ADD CONSTRAINT "EntityResolutionDecision_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntityResolutionDecision" ADD CONSTRAINT "EntityResolutionDecision_canonicalPersonId_fkey" FOREIGN KEY ("canonicalPersonId") REFERENCES "DiscoveredPerson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

