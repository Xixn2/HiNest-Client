import { prisma } from "../src/lib/db.js";
import { notifyAllUsers } from "../src/lib/notify.js";

async function main() {
  const users = await prisma.user.findMany({
    where: { active: true },
    select: { id: true, email: true },
  });
  await notifyAllUsers({
    type: "SYSTEM",
    title: "🔔 HiNest 테스트 알림",
    body: "전 구성원에게 발송된 시스템 테스트 알림입니다. 탭이 비활성 상태면 OS 토스트로도 표시돼요.",
    linkUrl: "/",
    actorName: "시스템",
  });
  console.log("Notified:", users.length, "users");
  users.forEach((u) => console.log("  -", u.email));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
