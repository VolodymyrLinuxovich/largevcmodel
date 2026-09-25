-- CreateIndex
CREATE INDEX "ContactInteraction_contactId_createdAt_idx" ON "ContactInteraction"("contactId", "createdAt");

-- CreateIndex
CREATE INDEX "GmailThread_userId_contactId_lastMessageAt_idx" ON "GmailThread"("userId", "contactId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "GmailThread_participantEmails_idx" ON "GmailThread" USING GIN ("participantEmails");

-- CreateIndex
CREATE INDEX "CalendarEvent_userId_contactId_startsAt_idx" ON "CalendarEvent"("userId", "contactId", "startsAt");

-- CreateIndex
CREATE INDEX "CalendarEvent_attendees_idx" ON "CalendarEvent" USING GIN ("attendees");

-- CreateIndex
CREATE INDEX "ResearchClaim_userId_companyId_extractedAt_idx" ON "ResearchClaim"("userId", "companyId", "extractedAt");

-- CreateIndex
CREATE INDEX "ResearchClaim_userId_contactId_extractedAt_idx" ON "ResearchClaim"("userId", "contactId", "extractedAt");

-- CreateIndex
CREATE INDEX "ResearchClaim_userId_createdAt_idx" ON "ResearchClaim"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Source_userId_companyId_createdAt_idx" ON "Source"("userId", "companyId", "createdAt");

-- CreateIndex
CREATE INDEX "Source_userId_contactId_createdAt_idx" ON "Source"("userId", "contactId", "createdAt");

-- CreateIndex
CREATE INDEX "Opportunity_thesisId_idx" ON "Opportunity"("thesisId");

-- CreateIndex
CREATE INDEX "Opportunity_introducedByContactId_idx" ON "Opportunity"("introducedByContactId");

