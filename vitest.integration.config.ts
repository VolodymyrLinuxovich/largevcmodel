import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * PostgreSQL-backed integration tests. They require TEST_DATABASE_URL pointing at a disposable
 * database whose schema matches prisma/schema.prisma (for example after `prisma db push`).
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.int.test.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/server-only-shim.ts", import.meta.url)),
    },
  },
});
