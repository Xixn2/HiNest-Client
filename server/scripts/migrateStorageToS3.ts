/**
 * Supabase Storage → AWS S3 일회성 마이그레이션.
 *
 * 언제 돌리나:
 *   1) server/.env 에 SUPABASE_* 와 AWS_* + S3_BUCKET 이 모두 세팅된 상태에서
 *   2) storage.ts 가 S3 를 primary 로 쓰도록 배포된 상태에서
 *   3) 이 스크립트 1회 실행 → 과거 Supabase 에 올라간 모든 파일을 동일 key 로 S3 에 복제.
 *
 * 실행:
 *   cd server && npx tsx scripts/migrateStorageToS3.ts
 *   (기본은 dry-run — 실제 복사하려면 --apply)
 *
 * 설계 원칙:
 *  - **동일 key 로 복사**. DB/메시지에 저장된 /uploads/<key> URL 이 그대로 유지됨.
 *  - **idempotent**. 이미 S3 에 같은 key 가 있으면 skip → 중간에 끊기고 재실행해도 안전.
 *  - **삭제 안 함**. Supabase 원본은 수동으로 2주 뒤 제거 (fallback 기간 보장).
 *  - **페이지네이션**. Supabase list 는 기본 100개 제한이라 offset 으로 루프.
 */

import "dotenv/config";
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import mime from "mime-types";

const APPLY = process.argv.includes("--apply");
const PAGE = 1000;

const {
  AWS_REGION,
  AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY,
  S3_BUCKET,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_STORAGE_BUCKET,
} = process.env;

if (!AWS_REGION || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !S3_BUCKET) {
  console.error("❌ AWS_REGION / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / S3_BUCKET 이 .env 에 필요합니다.");
  process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 .env 에 필요합니다.");
  process.exit(1);
}

const SB_BUCKET = (SUPABASE_STORAGE_BUCKET ?? "hinest-uploads").trim();

const s3 = new S3Client({
  region: AWS_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  },
});
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function existsInS3(key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: S3_BUCKET!, Key: key }));
    return true;
  } catch (e: any) {
    if (e?.$metadata?.httpStatusCode === 404 || e?.name === "NotFound") return false;
    throw e;
  }
}

async function listAllKeys(): Promise<string[]> {
  const keys: string[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase.storage
      .from(SB_BUCKET)
      .list("", { limit: PAGE, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`supabase list: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const row of data) {
      // 디렉터리(폴더) 항목 배제 — 실제 파일만
      if (row.name && row.id) keys.push(row.name);
    }
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return keys;
}

async function copyOne(key: string): Promise<"copied" | "skipped" | "failed"> {
  if (await existsInS3(key)) return "skipped";

  const { data, error } = await supabase.storage.from(SB_BUCKET).download(key);
  if (error || !data) {
    console.error(`  ⚠️  download fail: ${key} — ${error?.message ?? "no data"}`);
    return "failed";
  }
  const buf = Buffer.from(await data.arrayBuffer());
  const ct =
    data.type ||
    mime.lookup(key) ||
    "application/octet-stream";

  if (!APPLY) return "copied"; // dry-run — 집계만

  await s3.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET!,
      Key: key,
      Body: buf,
      ContentType: String(ct),
      CacheControl: "max-age=86400",
    })
  );
  return "copied";
}

async function main() {
  console.log(`🚚 Supabase(${SB_BUCKET}) → S3(${S3_BUCKET}) 마이그레이션`);
  console.log(`   mode: ${APPLY ? "APPLY (실제 복사)" : "DRY-RUN (--apply 붙이면 실행)"}\n`);

  const keys = await listAllKeys();
  console.log(`📋 대상 ${keys.length} 개`);

  let copied = 0, skipped = 0, failed = 0;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    process.stdout.write(`[${i + 1}/${keys.length}] ${key} ... `);
    try {
      const r = await copyOne(key);
      if (r === "copied") copied++;
      else if (r === "skipped") skipped++;
      else failed++;
      console.log(r);
    } catch (e: any) {
      failed++;
      console.log(`failed — ${e?.message ?? e}`);
    }
  }

  console.log(`\n✅ 완료: copied=${copied}  skipped=${skipped}  failed=${failed}`);
  if (!APPLY && copied > 0) {
    console.log(`\n➡️  실제로 복사하려면:  npx tsx scripts/migrateStorageToS3.ts --apply`);
  }
}

main().catch((e) => {
  console.error("💥", e);
  process.exit(1);
});
