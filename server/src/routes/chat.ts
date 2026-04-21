import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/db.js";
import { requireAuth, verifySuperToken, writeLog } from "../lib/auth.js";
import { notifyMany } from "../lib/notify.js";
import { publishMany } from "../lib/sse.js";

/**
 * SSE 채팅 브로드캐스트.
 * 기존 알림용 스트림(/api/notification/stream) 을 재활용해서 "chat:*" 이벤트를
 * 같은 파이프로 흘려보낸다. 유저당 EventSource 한 개만 유지 → 연결 수 절반.
 *
 * 이벤트 종류:
 *  - chat:message     — 새 메시지 (즉시 전송분만. 예약은 제외)
 *  - chat:update      — 기존 메시지 수정/삭제/고정/리액션 변화
 *  - chat:room        — 방 생성/멤버 변화 등 방 목록 재조회가 필요할 때
 *
 * 수신 대상: 해당 방의 RoomMember 전부 (본인 포함 — 다른 탭/데스크톱 동기화).
 *
 * ⚡ 성능 메모:
 *  1) 호출자는 await 하지 않는다 — DB 조회/SSE write 가 요청 응답을 막지 않도록
 *     fire-and-forget 으로 처리. 실패해도 클라의 증분 폴링이 안전망.
 *  2) 방 멤버는 5초 메모리 캐시로 재사용 (메시지 연속 전송 시 findMany N회 → 1회).
 *     멤버 변경 시 invalidateRoomMembers(roomId) 로 즉시 무효화.
 */
const MEMBER_CACHE_TTL_MS = 5_000;
const memberCache = new Map<string, { at: number; ids: string[] }>();

export function invalidateRoomMembers(roomId: string) {
  memberCache.delete(roomId);
}

async function getRoomMemberIds(roomId: string): Promise<string[]> {
  const hit = memberCache.get(roomId);
  if (hit && Date.now() - hit.at < MEMBER_CACHE_TTL_MS) return hit.ids;
  const members = await prisma.roomMember.findMany({
    where: { roomId },
    select: { userId: true },
  });
  const ids = members.map((m) => m.userId);
  memberCache.set(roomId, { at: Date.now(), ids });
  return ids;
}

function broadcastToRoom(roomId: string, event: "chat:message" | "chat:update" | "chat:room", data: unknown) {
  // 응답 플러시를 절대 막지 않도록 마이크로태스크로 분리.
  queueMicrotask(() => {
    getRoomMemberIds(roomId)
      .then((ids) => publishMany(ids, event, data))
      .catch(() => {});
  });
}

const router = Router();
router.use(requireAuth);

/**
 * 채팅방 목록.
 * 기본: 내가 속한 방만 조회.
 * Super Admin + ?scope=audit: 모든 방 조회 (감사용).
 */
router.get("/rooms", async (req, res) => {
  const u = (req as any).user;
  const scope = String(req.query.scope ?? "");
  const auditMode = scope === "audit";

  if (auditMode) {
    if (!u.superAdmin) return res.status(403).json({ error: "forbidden" });
    if (!verifySuperToken(req, u.id)) {
      return res.status(401).json({
        error: "비밀번호 재확인이 필요합니다",
        code: "SUPER_STEPUP_REQUIRED",
      });
    }
  }

  const where = auditMode ? {} : { members: { some: { userId: u.id } } };
  const rooms = await prisma.chatRoom.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      members: { include: { user: { select: { id: true, name: true, avatarColor: true, avatarUrl: true } } } },
      messages: {
        where: { deletedAt: null, scheduledAt: null },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (auditMode) await writeLog(u.id, "CHAT_AUDIT_LIST", undefined, `count=${rooms.length}`);
  res.json({ rooms, auditMode });
});

/**
 * 방 생성. GROUP / DIRECT / TEAM 지원. DIRECT 는 dedupe.
 */
const roomSchema = z.object({
  name: z.string().optional(),
  type: z.enum(["GROUP", "DIRECT", "TEAM"]).default("GROUP"),
  team: z.string().optional(),
  memberIds: z.array(z.string()).min(1),
});

router.post("/rooms", async (req, res) => {
  const parsed = roomSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid input" });
  const u = (req as any).user;
  const d = parsed.data;

  if (d.type === "DIRECT") {
    const other = d.memberIds.find((id) => id !== u.id);
    if (!other || d.memberIds.filter((id) => id !== u.id).length > 1) {
      return res.status(400).json({ error: "1:1 대화는 상대 1명만 선택할 수 있습니다" });
    }
    const existing = await prisma.chatRoom.findFirst({
      where: {
        type: "DIRECT",
        AND: [
          { members: { some: { userId: u.id } } },
          { members: { some: { userId: other } } },
        ],
      },
      include: {
        members: { include: { user: { select: { id: true, name: true, avatarColor: true, avatarUrl: true } } } },
        messages: {
          where: { deletedAt: null, scheduledAt: null },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });
    if (existing) return res.json({ room: existing, reused: true });

    const otherUser = await prisma.user.findUnique({ where: { id: other } });
    if (!otherUser) return res.status(400).json({ error: "상대를 찾을 수 없습니다" });

    const room = await prisma.chatRoom.create({
      data: {
        name: `DM:${u.id}:${other}`,
        type: "DIRECT",
        members: { create: [{ userId: u.id }, { userId: other }] },
      },
      include: {
        members: { include: { user: { select: { id: true, name: true, avatarColor: true, avatarUrl: true } } } },
        messages: { where: { deletedAt: null, scheduledAt: null }, orderBy: { createdAt: "desc" }, take: 1 },
      },
    });
    await writeLog(u.id, "DM_CREATE", room.id, `with:${other}`);
    // 방 생성 직후 — 상대방 클라이언트가 rooms 목록을 다시 받을 수 있도록 신호.
    broadcastToRoom(room.id, "chat:room", { kind: "create", roomId: room.id });
    return res.json({ room });
  }

  if (!d.name) return res.status(400).json({ error: "방 이름이 필요합니다" });
  const memberIds = Array.from(new Set([u.id, ...d.memberIds]));
  const room = await prisma.chatRoom.create({
    data: {
      name: d.name,
      type: d.type,
      members: { create: memberIds.map((userId) => ({ userId })) },
    },
    include: {
      members: { include: { user: { select: { id: true, name: true, avatarColor: true, avatarUrl: true } } } },
      messages: { where: { deletedAt: null, scheduledAt: null }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  await writeLog(u.id, "ROOM_CREATE", room.id, `${d.type}:${d.name}`);
  broadcastToRoom(room.id, "chat:room", { kind: "create", roomId: room.id });
  res.json({ room });
});

/**
 * 메시지 본문 검색 — 내가 속한 방 한정.
 * 같은 방에서 여러 매치가 나올 수 있으므로 각 방의 가장 최근 매치 1건만 반환.
 * 응답: { hits: [{ roomId, room, message }] }
 */
router.get("/search", async (req, res) => {
  const u = (req as any).user;
  const q = String(req.query.q ?? "").trim();
  if (!q) return res.json({ hits: [] });

  const now = new Date();
  const raw = await prisma.chatMessage.findMany({
    where: {
      deletedAt: null,
      content: { contains: q },
      OR: [
        { scheduledAt: null },
        { scheduledAt: { lte: now } },
        { senderId: u.id },
      ],
      room: { members: { some: { userId: u.id } } },
    },
    orderBy: { createdAt: "desc" },
    take: 80,
    include: {
      sender: { select: { id: true, name: true, avatarColor: true, avatarUrl: true } },
      room: {
        include: {
          members: { include: { user: { select: { id: true, name: true, avatarColor: true, avatarUrl: true } } } },
        },
      },
    },
  });

  // 방 중복 제거 — 같은 방이면 가장 최근 매치만
  const seen = new Set<string>();
  const hits: any[] = [];
  for (const m of raw) {
    if (seen.has(m.roomId)) continue;
    seen.add(m.roomId);
    hits.push({
      roomId: m.roomId,
      room: m.room,
      message: {
        id: m.id,
        content: m.content,
        createdAt: m.createdAt,
        sender: m.sender,
      },
    });
  }
  res.json({ hits });
});

/**
 * 메시지 조회. 예약(scheduledAt > now) 은 자기 것만 보이도록.
 * 삭제(deletedAt != null) 는 "삭제된 메시지" 자리표시로 대체.
 */
router.get("/rooms/:id/messages", async (req, res) => {
  const u = (req as any).user;
  const afterId = req.query.after ? String(req.query.after) : undefined;

  // 1 roundtrip: 방 + 모든 멤버의 lastReadAt + (필요시) after 메시지의 createdAt
  // findFirst 를 별도로 돌리던 것을 members 안에서 찾아내도록 병합 → DB 왕복 1회 감소.
  const [room, after] = await Promise.all([
    prisma.chatRoom.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        type: true,
        members: { select: { userId: true, lastReadAt: true } },
      },
    }),
    afterId
      ? prisma.chatMessage.findUnique({
          where: { id: afterId },
          select: { createdAt: true, roomId: true },
        })
      : Promise.resolve(null),
  ]);
  if (!room) return res.status(404).json({ error: "not found" });

  const isMember = room.members.some((m) => m.userId === u.id);
  if (!isMember) {
    if (!u.superAdmin) return res.status(403).json({ error: "forbidden" });
    if (!verifySuperToken(req, u.id)) {
      return res.status(401).json({
        error: "비밀번호 재확인이 필요합니다",
        code: "SUPER_STEPUP_REQUIRED",
      });
    }
    // 감사 로그는 반드시 content 를 내리기 전에 persist — compliance 요건.
    await writeLog(u.id, "CHAT_AUDIT_READ", room.id, `type=${room.type}`);
  }

  const now = new Date();
  const where: any = {
    roomId: room.id,
    OR: [
      { scheduledAt: null },
      { scheduledAt: { lte: now } },
      { senderId: u.id }, // 자기 예약은 자기만 보임
    ],
  };
  // afterId 가 다른 방의 것을 가리키면 무시 — 클라이언트가 방을 막 전환한 상황
  if (after && after.roomId === room.id) {
    where.createdAt = { gt: after.createdAt };
  }

  const raw = await prisma.chatMessage.findMany({
    where,
    orderBy: { createdAt: "asc" },
    take: 300,
    include: {
      sender: { select: { id: true, name: true, avatarColor: true, avatarUrl: true } },
      reactions: { select: { userId: true, emoji: true, user: { select: { name: true } } } },
    },
  });

  // 삭제 메시지 마스킹 (단 본인 + superAdmin 은 원본 볼 수 있음)
  const messages = raw.map((m) => {
    const hide = m.deletedAt && m.senderId !== u.id && !u.superAdmin;
    if (hide) {
      return {
        ...m,
        content: "",
        kind: "TEXT",
        fileUrl: null,
        fileName: null,
        fileType: null,
        fileSize: null,
      };
    }
    return m;
  });

  // readStates 는 room.members 에서 곧바로 뽑아 재사용 — 별도 쿼리 제거.
  const readStates = room.members.map((m) => ({ userId: m.userId, lastReadAt: m.lastReadAt }));

  res.json({
    messages,
    auditMode: !isMember && u.superAdmin,
    roomType: room.type,
    serverTime: now.toISOString(),
    readStates,
  });
});

/**
 * 읽음 처리 — 방을 실제 포커스 중일 때만 호출.
 * 단순히 내 lastReadAt 을 now 로 갱신.
 */
router.post("/rooms/:id/read", async (req, res) => {
  const u = (req as any).user;
  const member = await prisma.roomMember.findFirst({
    where: { roomId: req.params.id, userId: u.id },
  });
  if (!member) return res.json({ ok: true });
  await prisma.roomMember.update({
    where: { id: member.id },
    data: { lastReadAt: new Date() },
  });
  res.json({ ok: true });
});

/**
 * 메시지 전송 (즉시 또는 예약).
 * 본문, 첨부, scheduledAt 지원.
 */
// fileUrl 은 반드시 우리가 업로드한 /uploads/ 경로로만 허용.
// javascript:, data:, 외부 URL 등을 저장했다가 다른 유저가 클릭하면 XSS/피싱 가능.
const safeFileUrl = z
  .string()
  .regex(/^\/uploads\/[A-Za-z0-9._-]+$/, "허용되지 않는 파일 경로")
  .optional();

const sendSchema = z.object({
  content: z.string().max(8000).optional().default(""),
  kind: z.enum(["TEXT", "IMAGE", "VIDEO", "FILE"]).default("TEXT"),
  fileUrl: safeFileUrl,
  fileName: z.string().max(256).optional(),
  fileType: z.string().max(128).optional(),
  fileSize: z.number().int().nonnegative().optional(),
  scheduledAt: z.string().optional(),
  mentions: z.array(z.string()).optional(),
});

router.post("/rooms/:id/messages", async (req, res) => {
  const u = (req as any).user;
  const parsed = sendSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "invalid input" });
  const d = parsed.data;
  if (!d.content.trim() && !d.fileUrl) return res.status(400).json({ error: "empty" });

  const member = await prisma.roomMember.findFirst({
    where: { roomId: req.params.id, userId: u.id },
  });
  if (!member) return res.status(403).json({ error: "멤버만 메시지를 보낼 수 있습니다" });

  const scheduledAt = d.scheduledAt ? new Date(d.scheduledAt) : null;
  if (scheduledAt && scheduledAt.getTime() <= Date.now() + 5000) {
    return res.status(400).json({ error: "예약 시간은 최소 5초 이후여야 합니다" });
  }

  const mentions = (d.mentions ?? []).filter((id) => id && id !== u.id);

  const msg = await prisma.chatMessage.create({
    data: {
      roomId: req.params.id,
      senderId: u.id,
      content: d.content ?? "",
      kind: d.kind,
      fileUrl: d.fileUrl,
      fileName: d.fileName,
      fileType: d.fileType,
      fileSize: d.fileSize,
      mentions: mentions.length ? mentions.join(",") : null,
      scheduledAt,
    },
    include: {
      sender: { select: { id: true, name: true, avatarColor: true, avatarUrl: true } },
      room: { select: { id: true, name: true, type: true } },
      reactions: { select: { userId: true, emoji: true, user: { select: { name: true } } } },
    },
  });

  // 보낸 사람은 곧바로 읽은 상태 — 자기 메시지가 안읽음으로 표시되지 않게
  if (!scheduledAt) {
    await prisma.roomMember.update({
      where: { id: member.id },
      data: { lastReadAt: msg.createdAt },
    }).catch(() => {});
  }

  // SSE 즉시 푸시 — 예약 메시지는 실제 발송 시점까지 숨김.
  if (!scheduledAt) {
    broadcastToRoom(req.params.id, "chat:message", { message: msg });
  }

  // 알림 정책
  // - DIRECT: 상대에게 DM 알림
  // - GROUP/TEAM: 멘션된 유저에게만 MENTION 알림 (소음 방지)
  if (!scheduledAt) {
    const preview = (d.content ?? "").trim() || (d.fileName ? `📎 ${d.fileName}` : "(첨부)");
    const roomName = msg.room.type === "DIRECT" ? `${u.name}님과의 1:1` : msg.room.name;

    if (msg.room.type === "DIRECT") {
      const others = await prisma.roomMember.findMany({
        where: { roomId: req.params.id, userId: { not: u.id } },
        select: { userId: true },
      });
      await notifyMany(
        others.map((o) => ({
          userId: o.userId,
          type: "DM" as const,
          title: u.name,
          body: preview.slice(0, 140),
          linkUrl: `/chat?room=${msg.roomId}`,
          actorName: u.name,
        }))
      );
    } else if (mentions.length) {
      await notifyMany(
        mentions.map((uid) => ({
          userId: uid,
          type: "MENTION" as const,
          title: `@${u.name} · ${roomName}`,
          body: preview.slice(0, 140),
          linkUrl: `/chat?room=${msg.roomId}`,
          actorName: u.name,
        }))
      );
    }
  }

  res.json({ message: msg });
});

/* ===== Reactions ===== */
router.post("/messages/:id/reactions", async (req, res) => {
  const u = (req as any).user;
  const emoji = String(req.body?.emoji ?? "").trim();
  if (!emoji) return res.status(400).json({ error: "invalid" });
  const msg = await prisma.chatMessage.findUnique({ where: { id: req.params.id } });
  if (!msg) return res.status(404).json({ error: "not found" });
  const member = await prisma.roomMember.findFirst({
    where: { roomId: msg.roomId, userId: u.id },
  });
  if (!member) return res.status(403).json({ error: "forbidden" });

  const existing = await prisma.messageReaction.findUnique({
    where: { messageId_userId_emoji: { messageId: msg.id, userId: u.id, emoji } },
  });
  if (existing) {
    await prisma.messageReaction.delete({ where: { id: existing.id } });
  } else {
    await prisma.messageReaction.create({
      data: { messageId: msg.id, userId: u.id, emoji },
    });
  }
  const list = await prisma.messageReaction.findMany({
    where: { messageId: msg.id },
    select: { userId: true, emoji: true, user: { select: { name: true } } },
  });
  broadcastToRoom(msg.roomId, "chat:update", {
    kind: "reactions",
    messageId: msg.id,
    reactions: list,
  });
  res.json({ reactions: list });
});

/**
 * 메시지 수정. 본인만.
 */
router.patch("/messages/:id", async (req, res) => {
  const u = (req as any).user;
  const content = req.body?.content !== undefined ? String(req.body.content) : undefined;
  const scheduledAt = req.body?.scheduledAt !== undefined
    ? (req.body.scheduledAt ? new Date(req.body.scheduledAt) : null)
    : undefined;

  const msg = await prisma.chatMessage.findUnique({ where: { id: req.params.id } });
  if (!msg) return res.status(404).json({ error: "not found" });
  if (msg.senderId !== u.id) return res.status(403).json({ error: "본인 메시지만 수정 가능" });
  if (msg.deletedAt) return res.status(400).json({ error: "삭제된 메시지는 수정 불가" });

  const data: any = { editedAt: new Date() };
  if (content !== undefined) data.content = content;
  if (scheduledAt !== undefined) data.scheduledAt = scheduledAt;

  const updated = await prisma.chatMessage.update({
    where: { id: msg.id },
    data,
    include: { sender: { select: { id: true, name: true, avatarColor: true, avatarUrl: true } } },
  });
  broadcastToRoom(msg.roomId, "chat:update", { kind: "edit", message: updated });
  res.json({ message: updated });
});

/**
 * 메시지 고정/해제 토글. 방 멤버 누구나.
 */
router.post("/messages/:id/pin", async (req, res) => {
  const u = (req as any).user;
  const msg = await prisma.chatMessage.findUnique({ where: { id: req.params.id } });
  if (!msg) return res.status(404).json({ error: "not found" });
  const membership = await prisma.roomMember.findUnique({
    where: { roomId_userId: { roomId: msg.roomId, userId: u.id } },
  });
  if (!membership) return res.status(403).json({ error: "방 멤버만 가능" });

  const pin = !msg.pinnedAt;
  const updated = await prisma.chatMessage.update({
    where: { id: msg.id },
    data: {
      pinnedAt: pin ? new Date() : null,
      pinnedById: pin ? u.id : null,
    },
    include: { sender: { select: { id: true, name: true, avatarColor: true, avatarUrl: true } } },
  });
  broadcastToRoom(msg.roomId, "chat:update", { kind: "pin", message: updated });
  res.json({ message: updated });
});

/**
 * 메시지 삭제(소프트). 본인만.
 */
router.delete("/messages/:id", async (req, res) => {
  const u = (req as any).user;
  const msg = await prisma.chatMessage.findUnique({ where: { id: req.params.id } });
  if (!msg) return res.status(404).json({ error: "not found" });
  if (msg.senderId !== u.id) return res.status(403).json({ error: "본인 메시지만 삭제 가능" });

  const updated = await prisma.chatMessage.update({
    where: { id: msg.id },
    data: { deletedAt: new Date() },
  });
  broadcastToRoom(msg.roomId, "chat:update", { kind: "delete", messageId: msg.id });
  res.json({ ok: true, message: updated });
});

/**
 * 내 예약 메시지 목록
 */
router.get("/scheduled", async (req, res) => {
  const u = (req as any).user;
  const list = await prisma.chatMessage.findMany({
    where: { senderId: u.id, scheduledAt: { gt: new Date() }, deletedAt: null },
    orderBy: { scheduledAt: "asc" },
    include: { room: { select: { id: true, name: true, type: true } } },
  });
  res.json({ scheduled: list });
});

export default router;
