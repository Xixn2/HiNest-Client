import { Router } from "express";
import { prisma } from "../lib/db.js";
import { requireAuth } from "../lib/auth.js";

const router = Router();
router.use(requireAuth);

/**
 * 글로벌 검색. 결과는 섹션별로 묶어서 반환.
 * - people : 유저 (총관리자는 제외)
 * - notices
 * - events (내가 볼 수 있는)
 * - documents
 * - messages (내가 멤버인 방만)
 */
router.get("/", async (req, res) => {
  const u = (req as any).user;
  const raw = String(req.query.q ?? "").trim();
  // 검색어는 실무상 20자 내외. 과도한 길이는 여러 테이블에 LIKE '%...%' 로 들어가
  // DB 를 쥐어짜는 DoS 벡터가 되므로 128자로 자름.
  // (UI 도 maxLength=80 이라서 일반 경로는 영향 없음.)
  const q = raw.length > 128 ? raw.slice(0, 128) : raw;
  if (q.length < 1) return res.json({ q, results: {} });

  const meUser = await prisma.user.findUnique({ where: { id: u.id } });
  const isAdmin = u.role === "ADMIN";

  // 일정(TEAM) — 빈 team 을 "매칭" 으로 만들지 않도록 team 이 있을 때만 clause 추가.
  const eventOr: any[] = [
    { scope: "COMPANY" },
    { scope: "PERSONAL", createdBy: u.id },
    { scope: "TARGETED", createdBy: u.id },
    { scope: "TARGETED", targetUserIds: { contains: u.id } },
  ];
  if (meUser?.team) eventOr.push({ scope: "TEAM", team: meUser.team });

  // 문서 검색 — 내가 실제로 볼 수 있는 것만 돌려줘야 함.
  // scope 는 ALL/TEAM/PRIVATE/CUSTOM + 프로젝트 문서(projectId != null 이면 프로젝트 멤버) 체크.
  // ADMIN 은 전체 조회.
  let myProjectIds: string[] = [];
  if (!isAdmin) {
    const mems = await prisma.projectMember.findMany({
      where: { userId: u.id },
      select: { projectId: true },
    });
    myProjectIds = mems.map((m) => m.projectId);
  }
  const docScopeOr: any[] = isAdmin
    ? [{}]
    : [
        // 내가 만든 건 무조건 보임
        { authorId: u.id },
        // 프로젝트 멤버인 프로젝트의 문서
        { projectId: { in: myProjectIds.length ? myProjectIds : ["__none__"] } },
        // 전체 공개
        { scope: "ALL", projectId: null },
        // 팀 공개 — 내 팀과 일치할 때만
        ...(meUser?.team ? [{ scope: "TEAM", scopeTeam: meUser.team, projectId: null }] : []),
        // 사용자지정 — scopeUserIds 에 내가 포함
        { scope: "CUSTOM", scopeUserIds: { contains: u.id }, projectId: null },
      ];

  const [people, notices, events, documents, messages] = await Promise.all([
    prisma.user.findMany({
      where: {
        active: true,
        OR: [{ superAdmin: false }, { id: u.id }],
        AND: [
          {
            OR: [
              { name: { contains: q } },
              { email: { contains: q } },
              { team: { contains: q } },
              { position: { contains: q } },
            ],
          },
        ],
      },
      take: 8,
      select: { id: true, name: true, email: true, team: true, position: true, avatarColor: true, avatarUrl: true },
    }),
    prisma.notice.findMany({
      where: {
        OR: [{ title: { contains: q } }, { content: { contains: q } }],
      },
      take: 8,
      orderBy: { createdAt: "desc" },
      include: { author: { select: { name: true } } },
    }),
    prisma.event.findMany({
      where: {
        AND: [
          { OR: eventOr },
          { OR: [{ title: { contains: q } }, { content: { contains: q } }] },
        ],
      },
      take: 8,
      orderBy: { startAt: "desc" },
    }),
    prisma.document.findMany({
      where: {
        AND: [
          { OR: [{ title: { contains: q } }, { description: { contains: q } }, { tags: { contains: q } }] },
          { OR: docScopeOr },
        ],
      },
      take: 8,
      orderBy: { updatedAt: "desc" },
      include: { author: { select: { name: true } }, folder: { select: { name: true } } },
    }),
    prisma.chatMessage.findMany({
      where: {
        deletedAt: null,
        room: { members: { some: { userId: u.id } } },
        content: { contains: q },
      },
      take: 8,
      orderBy: { createdAt: "desc" },
      include: {
        sender: { select: { name: true, avatarColor: true, avatarUrl: true } },
        room: { select: { id: true, name: true, type: true } },
      },
    }),
  ]);

  res.json({
    q,
    results: { people, notices, events, documents, messages },
  });
});

export default router;
