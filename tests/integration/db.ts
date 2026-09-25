import { PrismaClient } from "@prisma/client";

const url = process.env.TEST_DATABASE_URL;

if (!url) {
  throw new Error("TEST_DATABASE_URL is required for integration tests (use a disposable database).");
}

export const prisma = new PrismaClient({ datasourceUrl: url });

let counter = 0;

/** Creates an isolated user; deleting it cascades every user-owned record. */
export async function createUser(label: string) {
  counter += 1;
  const email = `${label}-${Date.now()}-${counter}@integration.test`;
  const user = await prisma.user.create({ data: { email, name: label } });
  return { id: user.id, email, name: label };
}

export async function deleteUsers(ids: string[]) {
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}
