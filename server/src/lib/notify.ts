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
    // createMany 는 ID를 반환 안 하므로 시간 범위로 방금 만든 레코드만 골라온다.
    // take: inputs.length 로 top-N 을 쓰면, 고빈도 알림 상황에서 동시에 발생한 다른 배치가
    // 창(window)을 밀어내 해당 유저의 SSE push 가 누락되는 레이스가 있었음. 1 ms 여유를 빼서
    // createdAt 의 초단위 절단/클럭 드리프트를 보정.
    const since = new Date(Date.now() - 1);
    await prisma.notification.createMany({ data: inputs });
    const byUser = new Map<string, NotifyInput>();
    for (const i of inputs) byUser.set(i.userId, i);
    const fresh = await prisma.notification.findMany({
      where: {
        userId: { in: Array.from(byUser.keys()) },
        createdAt: { gte: since },
      },
      orderBy: { createdAt: "desc" },
    });
    // user별로 가장 최근 1건만 푸시.
    const picked = new Map<string, (typeof fresh)[number]>();
    for (const n of fresh) {
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
