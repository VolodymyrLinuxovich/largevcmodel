-- CreateTable
CREATE TABLE "MeetingBrief" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "calendarEventId" TEXT,
    "title" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "version" TEXT NOT NULL,
    "claimCount" INTEGER NOT NULL DEFAULT 0,
    "sourceCount" INTEGER NOT NULL DEFAULT 0,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingBrief_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MeetingBrief_userId_generatedAt_idx" ON "MeetingBrief"("userId", "generatedAt");

-- CreateIndex
CREATE INDEX "MeetingBrief_opportunityId_generatedAt_idx" ON "MeetingBrief"("opportunityId", "generatedAt");

-- AddForeignKey
ALTER TABLE "MeetingBrief" ADD CONSTRAINT "MeetingBrief_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingBrief" ADD CONSTRAINT "MeetingBrief_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingBrief" ADD CONSTRAINT "MeetingBrief_calendarEventId_fkey" FOREIGN KEY ("calendarEventId") REFERENCES "CalendarEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

