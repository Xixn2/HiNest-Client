import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase Storage 래퍼.
 *
 * 왜: Render Free 의 디스크는 재시작 시 휘발성이라 업로드한 파일이 사라진다.
 * Supabase Storage (Private 버킷) 로 영구 저장하고, 다운로드는 서버가 프록시한다.
 *
 * 설계 결정:
 *  - "Private 버킷 + 서버 프록시 다운로드". 클라이언트가 바로 Supabase 로 가지 않고
 *    /uploads/:key 를 치면 서버가 requireAuth 후 스트림으로 내려준다. 이렇게 해야
 *    기존의 CSP / Content-Disposition / nosniff 방어선을 그대로 유지 가능.
 *  - 환경변수(SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_STORAGE_BUCKET)가
 *    없으면 완전히 비활성화되고, 기존 디스크 저장 경로로 fallback 된다 (로컬 dev 용).
 */

const URL = process.env.SUPABASE_URL?.trim();
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET?.trim() || "hinest-uploads";

let client: SupabaseClient | null = null;
if (URL && KEY) {
  client = createClient(URL, KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function isStorageEnabled(): boolean {
  return !!client;
}

export function storageBucket(): string {
  return BUCKET;
}

/** 파일 저장. key 는 /uploads/<key> 의 "key" 부분 (파일명). */
export async function uploadFile(
  key: string,
  body: Buffer,
  contentType: string
): Promise<void> {
  if (!client) throw new Error("storage disabled");
  const { error } = await client.storage.from(BUCKET).upload(key, body, {
    contentType,
    // upsert 는 안전 — key 자체에 랜덤 해시가 들어있어 충돌 불가.
    upsert: false,
    cacheControl: "86400",
  });
  if (error) throw new Error(`storage upload: ${error.message}`);
}

/** 스트림으로 내려받기. 서버가 중계해서 /uploads/<key> 응답을 만든다. */
export async function downloadFile(key: string): Promise<{
  buffer: Buffer;
  contentType: string;
  size: number;
} | null> {
  if (!client) return null;
  const { data, error } = await client.storage.from(BUCKET).download(key);
  if (error || !data) return null;
  const ab = await data.arrayBuffer();
  return {
    buffer: Buffer.from(ab),
    contentType: data.type || "application/octet-stream",
    size: ab.byteLength,
  };
}

/** 삭제 (메시지 삭제 등에서 호출 예정 — 현재는 호출 부 없음, 수단만 제공). */
export async function deleteFile(key: string): Promise<void> {
  if (!client) return;
  await client.storage.from(BUCKET).remove([key]);
}
