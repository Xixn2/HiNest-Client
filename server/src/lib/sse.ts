import type { Response } from "express";

/**
 * Server-Sent Events 허브.
 * - 유저별로 여러 커넥션(다른 탭/데스크톱 앱) 유지
 * - publish(userId, event) 로 해당 유저의 모든 커넥션에 즉시 push
 */

type Client = {
  id: number;
  userId: string;
  res: Response;
};

let seq = 0;
const clients = new Map<string, Set<Client>>();

export function addClient(userId: string, res: Response): Client {
  const client: Client = { id: ++seq, userId, res };
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId)!.add(client);
  return client;
}

export function removeClient(client: Client) {
  const set = clients.get(client.userId);
  if (!set) return;
  set.delete(client);
  if (set.size === 0) clients.delete(client.userId);
}

export function publish(userId: string, event: string, data: unknown) {
  const set = clients.get(userId);
  if (!set) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of set) {
    try {
      c.res.write(payload);
    } catch {
      // ignore broken pipe
    }
  }
}

export function publishMany(userIds: string[], event: string, data: unknown) {
  for (const u of userIds) publish(u, event, data);
}

/** 디버깅용 */
export function clientCount() {
  let n = 0;
  for (const s of clients.values()) n += s.size;
  return n;
}
