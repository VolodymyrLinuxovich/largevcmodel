-- Allow the same public source URL to support multiple discovered people or organizations.
DROP INDEX IF EXISTS "PersonSource_userId_canonicalUrl_key";
CREATE INDEX IF NOT EXISTS "PersonSource_userId_canonicalUrl_idx" ON "PersonSource"("userId", "canonicalUrl");
