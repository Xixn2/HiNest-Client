import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const NEW_SUPER_PASSWORD = process.argv[2] ?? "";
if (!NEW_SUPER_PASSWORD) {
  console.error("usage: npx tsx scripts/setSuperPassword.ts <password>");
  process.exit(1);
}

const db = new PrismaClient();
(async () => {
  const hash = await bcrypt.hash(NEW_SUPER_PASSWORD, 10);
  const admins = await db.user.findMany({
    where: { superAdmin: true },
    select: { id: true, email: true, name: true },
  });
  console.log("super admins:", admins);
  const r = await db.user.updateMany({
    where: { superAdmin: true },
    data: { superPasswordHash: hash },
  });
  console.log(`updated ${r.count} super admin(s) — length=${NEW_SUPER_PASSWORD.length}`);
  await db.$disconnect();
})();
