import { PrismaClient } from "@prisma/client";
import { existsSync, copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function ensureWritableSqliteDemo() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl?.startsWith("file:/tmp/")) return;

  const targetPath = databaseUrl.replace(/^file:/, "");
  if (existsSync(targetPath)) return;

  const sourcePath = join(process.cwd(), "prisma", "demo-template.db");
  if (!existsSync(sourcePath)) return;

  mkdirSync(dirname(targetPath), { recursive: true });
  copyFileSync(sourcePath, targetPath);
}

ensureWritableSqliteDemo();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
