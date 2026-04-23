import { PrismaClient } from "@prisma/client";

/**
 * PrismaClient 는 싱글턴으로 관리. 모듈이 여러 번 임포트돼도 연결 풀은 하나만 유지.
 *
 * 커넥션 풀 크기: 기본값(10)을 Fargate task 단위로 조정.
 * - RDS(PostgreSQL) 기본 max_connections = 100.
 * - Fargate 태스크가 3개 뜨면 3 * N 연결. pgBouncer 없이 직접 연결이므로 5로 보수적 설정.
 * - DATABASE_URL 에 ?connection_limit=X&pool_timeout=20 으로도 설정 가능.
 *   환경변수를 그대로 쓰는 경우엔 아래 datasources 오버라이드가 우선됩니다.
 */
const CONNECTION_LIMIT = Number(process.env.DB_POOL_SIZE ?? "5");

export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL
        ? `${process.env.DATABASE_URL}${process.env.DATABASE_URL.includes("?") ? "&" : "?"}connection_limit=${CONNECTION_LIMIT}&pool_timeout=20`
        : undefined,
    },
  },
});
