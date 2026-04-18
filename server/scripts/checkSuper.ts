import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
(async () => {
  const all = await db.user.findMany({
    select: { id: true, email: true, name: true, role: true, superAdmin: true, superPasswordHash: true, active: true },
    orderBy: { createdAt: "asc" },
  });
  for (const u of all) {
    console.log(`- ${u.email.padEnd(24)} name=${u.name}  role=${u.role}  super=${u.superAdmin}  superPwSet=${!!u.superPasswordHash}  active=${u.active}`);
  }
  await db.$disconnect();
})();
