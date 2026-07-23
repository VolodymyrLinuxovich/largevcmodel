-- Persist source/filter diagnostics for external people search runs.
ALTER TABLE "PeopleSearchRun" ADD COLUMN "diagnostics" JSONB;
