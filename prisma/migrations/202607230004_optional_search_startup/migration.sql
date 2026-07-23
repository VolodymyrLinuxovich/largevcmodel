-- Allow people discovery searches to run from plain-language criteria without a saved startup profile.
ALTER TABLE "PeopleSearchRun" DROP CONSTRAINT IF EXISTS "PeopleSearchRun_startupId_fkey";
ALTER TABLE "PeopleSearchRun" ALTER COLUMN "startupId" DROP NOT NULL;
ALTER TABLE "PeopleSearchRun"
  ADD CONSTRAINT "PeopleSearchRun_startupId_fkey"
  FOREIGN KEY ("startupId") REFERENCES "StartupProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PersonFitScore" DROP CONSTRAINT IF EXISTS "PersonFitScore_startupId_fkey";
ALTER TABLE "PersonFitScore" ALTER COLUMN "startupId" DROP NOT NULL;
ALTER TABLE "PersonFitScore"
  ADD CONSTRAINT "PersonFitScore_startupId_fkey"
  FOREIGN KEY ("startupId") REFERENCES "StartupProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
