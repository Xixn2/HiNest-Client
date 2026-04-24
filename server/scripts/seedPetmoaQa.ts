import { prisma } from "../src/lib/db.js";

/**
 * Petmoa 프로젝트의 QA 체크리스트 초기 적재 스크립트.
 *
 * 입력 원본: 클라가 전달한 Notion 페이지 목록 (앱의 화면/플로우 이름).
 * 처리: 중복 제거 + 빈 제목 제거 후, 각 화면을 QA 항목(status=BUG) 으로 일괄 생성.
 * createdBy: Petmoa 프로젝트의 첫 멤버(생성자) → 없으면 슈퍼관리자.
 *
 * 실행:
 *   cd server
 *   npx tsx scripts/seedPetmoaQa.ts
 */

const RAW_TITLES = [
  "앨범 > 세로… 버튼시 메뉴보드",
  "앨범 > 북마크",
  "앨범화면> 선택",
  "앨범 > 검색",
  "홈화면",
  "펫카드",
  "반려동물 정보",
  "반려동물> 내앨범",
  "마이페이지 아래 설정",
  "설정 > 회원탈퇴",
  "설정 > 도움",
  "계정 정보변경",
  "설정",
  "계정정보변경 > 비밀번호 변경",
  "설정> 로그인 기기관리",
  "설정 > 이메일 문의하기",
  "sha-연결",
  "앨범표지",
  "앨범 편집 그리기",
  "앨범 편집 스티커",
  "앨범 편집 텍스트",
  "앨범 편집 사진",
  "앨범 편집 배경",
  "앨범 편집 화면",
  "앨범 보기 화면",
  "앨범 검색 화면",
  "앨범 선택 화면",
  "기본정보 입력 화면",
  "회원가입 화면",
  "메인화면",
  "로그인",
  "네비게이션바",
];

async function main() {
  // 프로젝트 이름에 "petmoa" 가 들어가면 매칭. 대소문자 무관.
  const project = await prisma.project.findFirst({
    where: { name: { contains: "petmoa", mode: "insensitive" } },
    include: { members: { orderBy: { joinedAt: "asc" }, take: 1 } },
  });
  if (!project) {
    console.error("❌ 'Petmoa' 프로젝트를 찾을 수 없어요. Project.name 에 'petmoa' 가 들어가 있어야 해요.");
    process.exit(1);
  }

  // createdBy 는 프로젝트 첫 멤버 → 없으면 전역 슈퍼관리자.
  let createdById = project.members[0]?.userId;
  if (!createdById) {
    const admin = await prisma.user.findFirst({
      where: { OR: [{ superAdmin: true }, { role: "ADMIN" }] },
      orderBy: { createdAt: "asc" },
    });
    if (!admin) {
      console.error("❌ 프로젝트 멤버도, 슈퍼관리자도 없어요. 최소 한 명은 필요해요.");
      process.exit(1);
    }
    createdById = admin.id;
  }

  // 중복 제거 + 앞뒤 공백 정리. 원본 순서 보존(먼저 등장한 인덱스 유지).
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const raw of RAW_TITLES) {
    const t = raw.replace(/\s+/g, " ").trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(t);
  }

  // 기존 QA 항목과 제목 중복되는 건 건너뛴다 — 재실행 멱등성.
  const existing = await prisma.projectQaItem.findMany({
    where: { projectId: project.id },
    select: { title: true, sortOrder: true },
  });
  const existingTitles = new Set(existing.map((e) => e.title.toLowerCase()));
  const toCreate = unique.filter((t) => !existingTitles.has(t.toLowerCase()));
  if (toCreate.length === 0) {
    console.log("✅ 새로 추가할 항목이 없어요. 모두 이미 존재합니다.");
    return;
  }

  // sortOrder 는 현재 최댓값 뒤에 순서대로 쌓기.
  const baseOrder = Math.max(0, ...existing.map((e) => e.sortOrder));
  await prisma.projectQaItem.createMany({
    data: toCreate.map((title, idx) => ({
      projectId: project.id,
      title,
      status: "BUG",
      priority: "NORMAL",
      sortOrder: baseOrder + idx + 1,
      createdById,
      platform: "IOS",
    })),
  });

  console.log(`✅ ${toCreate.length}개 QA 항목을 '${project.name}' 프로젝트에 추가했어요.`);
  console.log("   (기존 중복은 스킵, 플랫폼=IOS, 상태=BUG 로 설정)");
  console.log("   첫 3개:", toCreate.slice(0, 3).join(" / "));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
