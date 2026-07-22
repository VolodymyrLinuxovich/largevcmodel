import { PrismaClient } from "@prisma/client";
import { resetDemoData } from "../src/lib/demo/reset";

const prisma = new PrismaClient();

async function main() {
  const result = await resetDemoData(prisma);
  console.log(`Seeded LargeVCModel demo: ${result.contacts} contacts, ${result.companies} companies, ${result.sources} sources.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
