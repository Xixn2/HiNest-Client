# HiNest

사내 관리툴. Vite + React 프런트엔드와 Express + Prisma(SQLite) 백엔드로 구성되어 있습니다. 추후 Electron / Tauri 로 Windows · macOS 데스크톱 앱으로 감싸기 쉬운 구조입니다.

## 기능

- 로그인 / 회원가입 (관리자 발급 **초대키** 기반)
- 대시보드 (출퇴근 / 이번 주 일정 / 공지)
- 일정관리 (전사 · 팀 · 개인 월별 캘린더)
- 근태 · 월차 (출퇴근, 휴가 신청 / 승인)
- 업무일지
- 사내공지
- 사내톡 (그룹 채팅, 3초 폴링)
- 법인카드 사용내역 (영수증 이미지 업로드, 승인 워크플로우)
- 관리자 페이지 (초대키 발급 · 회수, 유저 직급/팀/권한/활성화 관리, 활동 로그)

## 실행

### 1. 의존성 설치

```bash
npm run install:all
```

### 2. DB 초기화 + 기본 관리자 시드

```bash
npm run db:setup
```

기본 관리자 계정이 생성됩니다:

- 이메일: `admin@hinest.local`
- 비밀번호: `admin1234`

### 3. 개발 서버 실행

```bash
npm run dev
```

- 웹앱: <http://localhost:1000>
- API: <http://localhost:4000>

## 사용 흐름

1. `admin@hinest.local / admin1234` 로 로그인
2. 좌측 사이드바 → **관리자** → **초대키 발급** 탭에서 키 발급 (이메일/이름/팀/직급/권한 지정 가능)
3. 발급된 키 (`HN-XXXX-XXXX`) 를 신규 입사자에게 전달
4. 신규 입사자는 `/signup` 에서 초대키 + 이메일 + 이름 + 비밀번호 입력 → 가입 완료
5. 관리자는 **유저 관리** 탭에서 직급/팀/권한을 수정하거나 계정을 비활성화/삭제할 수 있음
6. 모든 주요 액션은 **로그** 탭에 기록됨

## 권한

- `ADMIN` : 전체 관리. 관리자 페이지 진입 가능.
- `MANAGER` : 공지 작성, 전사 일정 등록, 휴가/법인카드 승인 가능.
- `MEMBER` : 일반 사용자.

## 프로젝트 구조

```
HiNest/
├── client/   # Vite + React + Tailwind (port 1000)
│   └── src/pages/...
├── server/   # Express + Prisma + SQLite (port 4000)
│   ├── src/routes/...
│   └── prisma/schema.prisma
└── package.json
```

## 데스크톱 앱 확장 (Windows / macOS)

현재 구조는 웹 클라이언트(Vite 빌드)와 API 서버가 분리되어 있어 Electron 또는 Tauri 래퍼를 추가하기 쉽습니다. 빌드된 `client/dist` 를 로드하고 `server` 를 자식 프로세스로 띄우는 메인 프로세스만 작성하면 데스크톱 앱으로 패키징할 수 있습니다.

## 데이터 리셋

```bash
rm server/prisma/dev.db
npm run db:setup
```
