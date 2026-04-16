import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // 기본 관리자
  const email = "admin@hinest.local";
  let admin = await prisma.user.findUnique({ where: { email } });
  if (!admin) {
    const passwordHash = await bcrypt.hash("admin1234", 10);
    admin = await prisma.user.create({
      data: {
        email,
        name: "관리자",
        passwordHash,
        role: "ADMIN",
        position: "시스템관리자",
        team: "경영지원",
        avatarColor: "#36D7B7",
      },
    });

    // 샘플 공지
    await prisma.notice.create({
      data: {
        title: "HiNest 오픈 안내",
        content:
          "안녕하세요. 사내 관리툴 HiNest 가 오픈되었습니다. 관리자 페이지에서 초대키를 발급받아 회원가입 해주세요.",
        pinned: true,
        authorId: admin.id,
      },
    });

    // 전사 채팅방
    const room = await prisma.chatRoom.create({
      data: {
        name: "전사 공지방",
        type: "GROUP",
        members: { create: [{ userId: admin.id }] },
      },
    });
    await prisma.chatMessage.create({
      data: {
        roomId: room.id,
        senderId: admin.id,
        content: "반갑습니다. HiNest 전사 공지방입니다.",
      },
    });

    console.log("Seeded admin:", email, "/ password: admin1234");
  } else {
    console.log("Admin already exists:", email);
  }

  // 임시 테스트 관리자 계정
  const testEmail = "test1234@hinest.local";
  const testExisting = await prisma.user.findUnique({ where: { email: testEmail } });
  if (!testExisting) {
    const hash = await bcrypt.hash("test1234!", 10);
    await prisma.user.create({
      data: {
        email: testEmail,
        name: "테스트관리자",
        passwordHash: hash,
        role: "ADMIN",
        position: "테스터",
        team: "QA",
        avatarColor: "#1fbda0",
      },
    });
    console.log("Seeded test admin:", testEmail, "/ password: test1234!");
  } else {
    console.log("Test admin already exists:", testEmail);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
