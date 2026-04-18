import { prisma } from "../src/lib/db.js";
import { notifyMany } from "../src/lib/notify.js";

async function main() {
  // CLI args: from / to / message
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, ...rest] = a.split("=");
      return [k.replace(/^--/, ""), rest.join("=")];
    })
  ) as Record<string, string>;

  const fromEmail = args.from ?? "admin2";
  const toEmail = args.to ?? "admin1";
  const content = args.msg ?? "안녕하세요 admin1님, 잠깐 얘기 가능하실까요? 🙂";

  const sender = await prisma.user.findUnique({ where: { email: fromEmail } });
  const receiver = await prisma.user.findUnique({ where: { email: toEmail } });
  if (!sender || !receiver) {
    console.error("유저를 찾을 수 없어요:", fromEmail, toEmail);
    process.exit(1);
  }

  // 기존 DM 찾기
  let room = await prisma.chatRoom.findFirst({
    where: {
      type: "DIRECT",
      AND: [
        { members: { some: { userId: sender.id } } },
        { members: { some: { userId: receiver.id } } },
      ],
    },
  });
  if (!room) {
    room = await prisma.chatRoom.create({
      data: {
        name: `DM:${sender.id}:${receiver.id}`,
        type: "DIRECT",
        members: { create: [{ userId: sender.id }, { userId: receiver.id }] },
      },
    });
  }

  const msg = await prisma.chatMessage.create({
    data: {
      roomId: room.id,
      senderId: sender.id,
      content,
      kind: "TEXT",
    },
  });

  await notifyMany([
    {
      userId: receiver.id,
      type: "DM",
      title: sender.name,
      body: content.slice(0, 140),
      linkUrl: `/chat?room=${room.id}`,
      actorName: sender.name,
    },
  ]);

  console.log("DM 전송 완료");
  console.log("  발신:", sender.name, `(${sender.email})`);
  console.log("  수신:", receiver.name, `(${receiver.email})`);
  console.log("  방 ID:", room.id);
  console.log("  메시지:", content);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
