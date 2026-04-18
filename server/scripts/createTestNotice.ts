import { prisma } from "../src/lib/db.js";
import { notifyAllUsers } from "../src/lib/notify.js";

async function main() {
  // admin1(슈퍼관리자) 명의로 발송
  const author = await prisma.user.findFirst({
    where: { OR: [{ email: "admin1" }, { role: "ADMIN" }] },
    orderBy: { createdAt: "asc" },
  });
  if (!author) {
    console.error("관리자 계정을 찾을 수 없어요");
    process.exit(1);
  }

  const title = "📌 4월 26일 금요일 조기퇴근 안내";
  const content = [
    "안녕하세요, 하이비츠 임직원 여러분.",
    "",
    "4월 26일(금)은 전사 봄맞이 행사로 16시 조기퇴근입니다.",
    "일정을 참고하셔서 업무 마감 부탁드려요.",
    "",
    "감사합니다.",
    "— 경영지원팀",
  ].join("\n");

  const notice = await prisma.notice.create({
    data: { title, content, pinned: true, authorId: author.id },
  });
  await notifyAllUsers(
    {
      type: "NOTICE",
      title: `📌 ${title}`,
      body: content.slice(0, 120),
      linkUrl: `/notice`,
      actorName: author.name,
    },
    author.id // 작성자 본인은 제외
  );

  console.log("공지 생성 완료:", notice.id);
  console.log("작성자:", author.name, `(${author.email})`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
