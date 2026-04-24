import { prisma } from "../src/lib/db.js";

/**
 * Petmoa 프로젝트 QA 체크리스트 — 실제 이슈/버그 데이터 적재.
 *
 * 각 항목: { screen, title, status, note, assigneeName, platform }
 * 기존 항목 전부 삭제 후 재적재 (초기화 후 덮어쓰기).
 *
 * 상태 매핑:
 *   시작 전   → BUG
 *   테스트 요망 → IN_PROGRESS
 *   수정필요   → IN_PROGRESS
 *   완료      → DONE
 *
 * 실행:
 *   cd server && npx tsx scripts/seedPetmoaQa.ts
 */

type RawItem = {
  screen: string;
  section: string;
  title: string;
  status: string;
  note?: string;
  assignee?: string;
};

const RAW: RawItem[] = [
  { screen: "네비게이션바", section: "전체", title: "위쪽으로 그림자 추가", status: "시작 전", assignee: "이경민" },
  { screen: "로그인", section: "로그인", title: "탈퇴시 비활성화 처리", status: "테스트 요망" },
  { screen: "로그인", section: "로그인", title: "탈퇴한 sns 계정 재가입 불가", status: "수정필요", note: '"로그인 중 오류가 발생했습니다"라고 뜨며 로그인 안됨' },
  { screen: "로그인", section: "로그인", title: "탈퇴 시 이메일 인증번호 받기 불가", status: "시작 전" },
  { screen: "로그인", section: "로그인", title: "전에 로그인한 계정 데이터 남아있는 오류", status: "시작 전" },
  { screen: "메인화면", section: "로그인", title: "자동 로그인 안됨", status: "시작 전", note: "나갔다 들어오면 다시 로그인 해야됨" },
  { screen: "메인화면", section: "로그인", title: "카카오 SNS 로그인 불가", status: "완료" },
  { screen: "메인화면", section: "로그인", title: "구글 SNS 로그인 불가", status: "완료" },
  { screen: "메인화면", section: "로그인", title: "애플 SNS 로그인 불가", status: "완료", note: "애플로그인 가능" },
  { screen: "메인화면", section: "로그인", title: "네이버 SNS 로그인 불가", status: "완료" },
  { screen: "메인화면", section: "로그인", title: "로고 위치 수정", status: "시작 전", assignee: "이경민" },
  { screen: "메인화면", section: "로그인", title: "SNS 로그인 버튼 텍스트 가운데로 수정", status: "시작 전", assignee: "이경민" },
  { screen: "회원가입 화면", section: "회원가입", title: "스크롤 시 앱바 색 수정", status: "시작 전", assignee: "이경민" },
  { screen: "회원가입 화면", section: "회원가입", title: "중복확인 버튼 텍스트 수정", status: "시작 전", assignee: "이경민" },
  { screen: "회원가입 화면", section: "회원가입", title: "생년월일 스크롤 년 부분 수정", status: "시작 전" },
  { screen: "회원가입 화면", section: "회원가입", title: "기본 년도 2026년으로 설정", status: "시작 전" },
  { screen: "회원가입 화면", section: "회원가입", title: "이메일 입력 양식과 다를 때 경고 문구 필요 및 회원가입 버튼 비활성화", status: "시작 전" },
  { screen: "기본정보 입력 화면", section: "회원가입", title: "스크롤 시 앱바 색 수정", status: "시작 전", assignee: "이경민" },
  { screen: "기본정보 입력 화면", section: "회원가입", title: "전체 양끝 마진 수정", status: "시작 전", assignee: "이경민" },
  { screen: "기본정보 입력 화면", section: "회원가입", title: "완료 버튼 반응형으로 앱바에 안가려지도록", status: "시작 전", assignee: "이경민" },
  { screen: "기본정보 입력 화면", section: "회원가입", title: "사진 연결", status: "시작 전" },
  { screen: "기본정보 입력 화면", section: "회원가입", title: "지도 연결", status: "시작 전" },
  { screen: "앨범 검색 화면", section: "앨범", title: "디폴트 앨범이 최근 항목에 보임", status: "시작 전" },
  { screen: "앨범 검색 화면", section: "앨범", title: "검색기능 불가", status: "시작 전" },
  { screen: "앨범 검색 화면", section: "앨범", title: "생성한 앨범 보이지 않음", status: "시작 전" },
  { screen: "앨범 선택 화면", section: "앨범", title: "앱바 오른쪽 아이콘 마진 수정", status: "시작 전", assignee: "이경민" },
  { screen: "앨범 편집 화면", section: "앨범 편집", title: "undo, redo 비활성화 표시 추가", status: "시작 전" },
  { screen: "앨범 편집 화면", section: "앨범 편집", title: "사진 추가 시 완료 버튼 안눌림", status: "완료" },
  { screen: "앨범 편집 화면", section: "앨범 편집", title: "완료 버튼 여러 번 클릭 시 오류", status: "시작 전", note: "똑같은 앨범이 여러개 저장됨, 가끔 아예 빨간화면으로 오류 뜸" },
  { screen: "앨범 편집 화면", section: "앨범 편집", title: "페이지 추가 기능", status: "시작 전" },
  { screen: "앨범 편집 화면", section: "앨범 편집", title: "위로 스와이프 시 페이지가 추가되는 방식", status: "시작 전" },
  { screen: "앨범 편집 배경", section: "앨범 편집", title: "배경 사진 추가 연결", status: "시작 전" },
  { screen: "앨범 편집 배경", section: "앨범 편집", title: "배경 템플릿 누락 (들판, 벚꽃, 구름)", status: "시작 전", assignee: "이경민" },
  { screen: "앨범 편집 사진", section: "앨범 편집", title: "사진 자르기 기능 추가", status: "완료" },
  { screen: "앨범 편집 사진", section: "앨범 편집", title: "사진 저장 시 오류 뜸", status: "완료", note: "403 오류 뜸" },
  { screen: "앨범 편집 텍스트", section: "앨범 편집", title: "X아이콘 클릭 시 텍스트 없어지고 취소", status: "시작 전" },
  { screen: "앨범 편집 텍스트", section: "앨범 편집", title: "폰트 적용 안됨", status: "시작 전", assignee: "이경민" },
  { screen: "앨범 편집 텍스트", section: "앨범 편집", title: "프리텐다드 폰트 굵기 수정", status: "시작 전" },
  { screen: "앨범 편집 텍스트", section: "앨범 편집", title: "한글 텍스트 사이 띄어쓰기 밑줄 오류", status: "시작 전" },
  { screen: "앨범 편집 텍스트", section: "앨범 편집", title: "텍스트 수정 데이터 바에 적용되도록 수정", status: "시작 전" },
  { screen: "앨범 편집 텍스트", section: "앨범 편집", title: "이미 써진 텍스트 클릭 시 수정 가능하도록", status: "시작 전" },
  { screen: "앨범 편집 텍스트", section: "앨범 편집", title: "텍스트 수정 데이터가 텍스트 도구 바에 적용되도록 수정", status: "시작 전", note: "전에 사용했던 텍스트 설정이 남아있는데 텍스트 도구 바는 바뀌어있지않음" },
  { screen: "앨범 편집 그리기", section: "앨범 편집", title: "아래에 지우개 추가", status: "시작 전", assignee: "이경민" },
  { screen: "앨범 편집 그리기", section: "앨범 편집", title: "스티커, 사진, 텍스트 위에 그리기 불가", status: "시작 전" },
  { screen: "앨범표지", section: "앨범", title: "앨범 표지 연동 불가", status: "시작 전" },
  { screen: "앨범 > 세로… 버튼시 메뉴보드", section: "앨범", title: "삭제 제외 전부 사용불가", status: "시작 전" },
  { screen: "앨범 > 북마크", section: "앨범", title: "북마크 아이콘만 변경되고 기능 없음", status: "시작 전" },
  { screen: "앨범화면> 선택", section: "앨범", title: "세로 …버튼 안 메뉴보드 기능 전부 사용불가", status: "시작 전" },
  { screen: "앨범 > 검색", section: "앨범", title: "검색기능 사용불가 / 새 앨범 안뜸 / 최근항목에 미생성 앨범 표시 / 상단바 스크롤시 색상 변경 / 검색 창 세로… 메뉴보드 삭제 외 사용불가", status: "시작 전" },
  { screen: "홈화면", section: "홈", title: "앨범 생성하기 실행 불가", status: "시작 전" },
  { screen: "펫카드", section: "마이", title: "펫카드 고양이/강아지 디자인 구별 안됨", status: "시작 전" },
  { screen: "펫카드", section: "마이", title: "펫 카드 정보(품종과 생일) 위아래 위치 안맞음", status: "시작 전" },
  { screen: "펫카드", section: "마이", title: "나이 안뜸", status: "시작 전", note: "생일 입력된 정보로 자동 계산되어 들어가도록 수정" },
  { screen: "펫카드", section: "마이", title: "반려동물 정보에 '있어요' 선택 후 상세 정보 미작성시 빈 텍스트 태그 생성됨", status: "시작 전" },
  { screen: "펫카드", section: "마이", title: "복용약 정보 입력해도 펫카드에 정보 입력 안됨", status: "완료" },
  { screen: "반려동물 정보", section: "마이", title: "성향, 건강, 복용약 텍스트 정렬 우측정렬로 수정", status: "시작 전" },
  { screen: "반려동물 정보", section: "마이", title: "성향 태그 기본 여백 제공 (태그가 없어도)", status: "시작 전" },
  { screen: "반려동물 정보", section: "마이", title: "아래 … 과 반려동물 사이 여백 수정", status: "시작 전" },
  { screen: "반려동물> 내앨범", section: "마이", title: "클릭 불가 (내 앨범으로 전환 불가)", status: "시작 전" },
  { screen: "마이페이지 아래 설정", section: "마이", title: "패밀리, 펫시터, 결제 등 첫 출시 미제공 서비스 설정 제거", status: "시작 전" },
  { screen: "설정 > 회원탈퇴", section: "설정", title: "탈퇴할 계정이 로그인 계정이 아닌 임시 계정으로 설정됨", status: "시작 전" },
  { screen: "설정 > 회원탈퇴", section: "설정", title: "이메일 인증 구현안됨", status: "시작 전" },
  { screen: "설정 > 회원탈퇴", section: "설정", title: "탈퇴해도 그 계정으로 로그인 가능", status: "수정필요", note: "로그인 안됨. 복구 가능하도록 수정" },
  { screen: "설정 > 도움", section: "설정", title: "자주묻는 질문 탭 삭제하고 고객센터로 통합", status: "시작 전" },
  { screen: "계정 정보변경", section: "설정", title: "계정 정보 변경 전 정보 입력이 안되어있음", status: "시작 전", note: "oauth 계정시 입력이 안 되어 있는게 당연함.", assignee: "오상민" },
  { screen: "설정", section: "설정", title: "스크롤시 상단바 색상 변경됨", status: "시작 전", assignee: "이경민" },
  { screen: "계정정보변경 > 비밀번호 변경", section: "설정", title: "현재 비밀번호 오류 팝업 배경 색상 변경 → #fff", status: "시작 전", assignee: "이경민" },
  { screen: "계정정보변경 > 비밀번호 변경", section: "설정", title: "비밀번호 수정시 맞는 비밀번호를 적어도 맞지 않다고 뜸", status: "완료", assignee: "오상민" },
  { screen: "계정 정보변경", section: "설정", title: "아이디 텍스트 입력조차 안됨", status: "완료", note: "원래 변경 불가", assignee: "오상민" },
  { screen: "설정> 로그인 기기관리", section: "설정", title: "구현안됨 (임시로 작성한 기기 로그아웃을 누르면 로그아웃은 됨)", status: "시작 전", assignee: "오상민" },
  { screen: "설정 > 이메일 문의하기", section: "설정", title: "+ 버튼 갤러리 연결", status: "시작 전", assignee: "오상민" },
  { screen: "sha-연결", section: "", title: "내부테스트가 끝나고 등록작업시 가능", status: "시작 전", assignee: "오상민" },
];

function mapStatus(s: string): string {
  if (s === "완료") return "DONE";
  if (s === "수정필요" || s === "테스트 요망") return "IN_PROGRESS";
  return "BUG"; // 시작 전
}

function mapPriority(title: string, note?: string): string {
  const text = (title + " " + (note ?? "")).toLowerCase();
  if (text.includes("오류") || text.includes("불가") || text.includes("안됨") || text.includes("crash")) return "HIGH";
  return "NORMAL";
}

async function main() {
  const project = await prisma.project.findFirst({
    where: { name: { contains: "petmoa", mode: "insensitive" } },
    include: { members: { orderBy: { joinedAt: "asc" }, take: 1 } },
  });
  if (!project) {
    console.error("❌ 'Petmoa' 프로젝트를 찾을 수 없어요.");
    process.exit(1);
  }

  let createdById = project.members[0]?.userId;
  if (!createdById) {
    const admin = await prisma.user.findFirst({
      where: { OR: [{ superAdmin: true }, { role: "ADMIN" }] },
      orderBy: { createdAt: "asc" },
    });
    if (!admin) { console.error("❌ 생성자로 쓸 사용자가 없어요."); process.exit(1); }
    createdById = admin.id;
  }

  // 기존 항목 전부 삭제 후 재적재.
  const deleted = await prisma.projectQaItem.deleteMany({ where: { projectId: project.id } });
  console.log(`🗑  기존 항목 ${deleted.count}개 삭제`);

  await prisma.projectQaItem.createMany({
    data: RAW.map((r, idx) => ({
      projectId: project.id,
      title: r.title,
      screen: r.screen || null,
      note: r.note ? `[${r.section}] ${r.note}` : (r.section ? `[${r.section}]` : null),
      platform: "IOS",
      status: mapStatus(r.status),
      priority: mapPriority(r.title, r.note),
      sortOrder: idx + 1,
      createdById,
    })),
  });

  console.log(`✅ ${RAW.length}개 QA 항목을 '${project.name}' 프로젝트에 적재했어요.`);

  // 담당자가 있는 항목 수 출력 (assigneeId 연결은 user 조회가 필요해 별도로).
  const withAssignee = RAW.filter((r) => r.assignee).length;
  console.log(`   담당자 명시 항목 ${withAssignee}개 (앱 내에서 직접 연결 필요 — 사용자 이름이 DB와 달라 자동매핑 생략)`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
