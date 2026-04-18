import { prisma } from "./db.js";
import { publish } from "./sse.js";

export type NotifyType =
  | "NOTICE"
  | "DM"
  | "APPROVAL_REQUEST"
  | "APPROVAL_REVIEW"
  | "MENTION"
  | "SYSTEM";

export interface NotifyInput {
  userId: string;
  type: NotifyType;
  title: string;
  body?: string;
  linkUrl?: string;
  actorName?: string;
  actorColor?: string;
}

export async function notify(input: NotifyInput) {
  try {
    const created = await prisma.notification.create({ data: input });
    publish(input.userId, "notification", created);
  } catch (e) {
    console.error("notify failed", e);
  }
}

export async function notifyMany(inputs: NotifyInput[]) {
  if (!inputs.length) return;
  try {
    await prisma.notification.createMany({ data: inputs });
    // createMany 는 ID를 반환 안 하므로, userId 별 최신 한 건씩 가져와서 푸시
    const byUser = new Map<string, NotifyInput>();
    for (const i of inputs) byUser.set(i.userId, i);
    const latest = await prisma.notification.findMany({
      where: { userId: { in: Array.from(byUser.keys()) } },
      orderBy: { createdAt: "desc" },
      take: inputs.length,
    });
    // user별로 최신 1건만 푸시 (createMany 배치 안의 것 = 방금 생성된 것일 확률 높음)
    const picked = new Map<string, (typeof latest)[number]>();
    for (const n of latest) {
      if (!picked.has(n.userId)) picked.set(n.userId, n);
    }
    for (const [uid, n] of picked) publish(uid, "notification", n);
  } catch (e) {
    console.error("notifyMany failed", e);
  }
}

/** 전사 공지 — 총관리자 제외 모든 활성 유저에게 발송 */
export async function notifyAllUsers(
  tpl: Omit<NotifyInput, "userId">,
  excludeUserId?: string
) {
  const users = await prisma.user.findMany({
    where: { active: true, ...(excludeUserId ? { id: { not: excludeUserId } } : {}) },
    select: { id: true },
  });
  await notifyMany(
    users.map((u) => ({ ...tpl, userId: u.id }))
  );
}
