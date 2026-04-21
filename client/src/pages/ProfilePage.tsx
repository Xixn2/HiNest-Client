import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import PageHeader from "../components/PageHeader";
import { useTheme, type ThemeMode } from "../theme";
import { PRESENCE_CHOICES, resolvePresence, type PresenceStatus } from "../lib/presence";
import {
  getDesktopPermission,
  isDesktopEnabled,
  requestDesktopPermission,
  setDesktopEnabled,
  showDesktopNotification,
  type DesktopNotifPermission,
} from "../lib/desktopNotify";

// 아바타 색상 팔레트.
// 다크 모드 surface (#17191F 부근) 와 거의 같은 `#17191F` 를 빼고
// 한 단계 밝은 슬레이트 (#64748B) 로 대체 — 어느 테마에서도 아바타 이니셜이 시인됨.
const COLORS = [
  "#3B5CF0", "#2962FF", "#6278D0", "#0EA5E9", "#0891B2", "#14B8A6",
  "#16A34A", "#65A30D", "#CA8A04", "#D97706", "#EA580C", "#DC2626",
  "#DB2777", "#C026D3", "#9333EA", "#7C3AED", "#475569", "#64748B",
];

export default function ProfilePage() {
  const { user, refresh } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [color, setColor] = useState(user?.avatarColor ?? "#3D54C4");
  // null = 색상 이니셜 사용. 문자열 = 업로드된 /uploads/... 경로.
  // 서버에 저장될 때까지 로컬 state 에서 임시 보관해 미리보기 즉시 반영.
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user?.avatarUrl ?? null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [savedMsg, setSavedMsg] = useState("");
  const [err, setErr] = useState("");
  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });
  const [pwMsg, setPwMsg] = useState("");
  const [pwErr, setPwErr] = useState("");

  // 업로드/저장 중에 사용자가 페이지를 떠나면 setState 가 언마운트 후 호출될 수 있음.
  // setTimeout 으로 메시지 초기화도 언마운트 후에 불릴 수 있어 일괄 가드.
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  useEffect(() => {
    if (user) {
      setName(user.name);
      setColor(user.avatarColor ?? "#3D54C4");
      setAvatarUrl(user.avatarUrl ?? null);
    }
  }, [user?.id]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setSavedMsg("");
    try {
      // avatarUrl 은 명시적으로 항상 함께 전송 — 이미지 제거도 PATCH 로 반영해야 하니까.
      await api("/api/profile", {
        method: "PATCH",
        json: { name, avatarColor: color, avatarUrl: avatarUrl ?? "" },
      });
      await refresh();
      if (!aliveRef.current) return;
      setSavedMsg("저장되었습니다");
      setTimeout(() => {
        if (aliveRef.current) setSavedMsg("");
      }, 2000);
    } catch (e: any) {
      if (aliveRef.current) setErr(e.message ?? "저장 실패");
    }
  }

  async function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // 같은 파일 다시 올릴 수 있게 리셋
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setErr("이미지 파일만 업로드할 수 있어요.");
      return;
    }
    // 프로필 이미지는 작게 제한 — 큰 파일 올려봐야 원형 아바타로 작게만 쓰임.
    if (file.size > 10 * 1024 * 1024) {
      setErr("프로필 이미지는 10MB 이하만 업로드할 수 있어요.");
      return;
    }
    setErr("");
    setUploadingAvatar(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const r = await fetch("/api/upload", { method: "POST", body: form, credentials: "include" });
      if (!r.ok) {
        const msg = await r.json().catch(() => ({}));
        throw new Error((msg as any)?.error ?? "업로드 실패");
      }
      const data = await r.json();
      const url: string | undefined = data?.url;
      if (!url) throw new Error("업로드 응답이 올바르지 않습니다.");
      if (!aliveRef.current) return;
      setAvatarUrl(url);
    } catch (e: any) {
      if (aliveRef.current) setErr(e.message ?? "업로드 실패");
    } finally {
      if (aliveRef.current) setUploadingAvatar(false);
    }
  }

  function clearAvatar() {
    setAvatarUrl(null);
  }

  async function changePw(e: React.FormEvent) {
    e.preventDefault();
    setPwErr(""); setPwMsg("");
    if (pwForm.next !== pwForm.confirm) return setPwErr("새 비밀번호 확인이 일치하지 않습니다");
    if (pwForm.next.length < 8) return setPwErr("새 비밀번호는 8자 이상이어야 합니다");
    try {
      await api("/api/profile/password", {
        method: "POST",
        json: { current: pwForm.current, next: pwForm.next },
      });
      setPwMsg("비밀번호가 변경되었습니다");
      setPwForm({ current: "", next: "", confirm: "" });
      setTimeout(() => {
        if (aliveRef.current) setPwMsg("");
      }, 3000);
    } catch (e: any) {
      if (aliveRef.current) setPwErr(e.message ?? "변경 실패");
    }
  }

  if (!user) return null;

  return (
    <div>
      <PageHeader
        eyebrow="계정"
        title="내 프로필"
        description="프로필 이름과 아바타 색을 변경하고 비밀번호를 관리합니다."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* 미리보기 */}
        <div className="lg:col-span-1">
          <div className="panel p-6 sticky top-4">
            <div className="flex items-center gap-3">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={name}
                  className="w-16 h-16 rounded-full object-cover border border-ink-150"
                />
              ) : (
                <div
                  className="w-16 h-16 rounded-full grid place-items-center text-white text-[22px] font-extrabold"
                  style={{ background: color, letterSpacing: "-0.03em" }}
                >
                  {name[0] ?? "?"}
                </div>
              )}
              <div className="min-w-0">
                <div className="text-[18px] font-extrabold text-ink-900 tracking-tight truncate">{name}</div>
                <div className="text-[12px] text-ink-500 truncate">{user.email}</div>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-ink-100 grid grid-cols-2 gap-3">
              <InfoField label="사번" value={user.employeeNo ?? "—"} mono />
              <InfoField label="직급" value={user.position ?? "—"} />
              <InfoField label="팀" value={user.team ?? "—"} />
              <InfoField label="권한" value={user.role} />
            </div>
          </div>
        </div>

        {/* 편집 */}
        <div className="lg:col-span-2 space-y-5">
          <div className="panel p-6">
            <div className="h-sub mb-4">기본 정보</div>
            <form onSubmit={saveProfile} className="space-y-4">
              <div>
                <label className="field-label">이름</label>
                <input
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={200}
                />
              </div>
              <div>
                <label className="field-label">프로필 이미지</label>
                <div className="flex items-center gap-3">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt="프로필"
                      className="w-14 h-14 rounded-full object-cover border border-ink-150"
                    />
                  ) : (
                    <div
                      className="w-14 h-14 rounded-full grid place-items-center text-white text-[18px] font-extrabold"
                      style={{ background: color, letterSpacing: "-0.03em" }}
                    >
                      {name[0] ?? "?"}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => avatarInputRef.current?.click()}
                      disabled={uploadingAvatar}
                    >
                      {uploadingAvatar ? "업로드 중…" : (avatarUrl ? "이미지 변경" : "이미지 업로드")}
                    </button>
                    {avatarUrl && (
                      <button type="button" className="btn-ghost" onClick={clearAvatar} disabled={uploadingAvatar}>
                        이미지 제거
                      </button>
                    )}
                  </div>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={onPickAvatar}
                  />
                </div>
                <div className="text-[11px] text-ink-500 mt-1.5">
                  이미지가 없을 땐 아래 아바타 색과 이름 첫 글자로 표시됩니다. (10MB 이하)
                </div>
              </div>
              <div>
                <label className="field-label">아바타 색</label>
                <div className="flex flex-wrap gap-2">
                  {COLORS.map((c) => (
                    <button
                      type="button"
                      key={c}
                      onClick={() => setColor(c)}
                      className={`w-9 h-9 rounded-xl relative transition ${color === c ? "scale-110" : "hover:scale-105"}`}
                      style={{ background: c }}
                    >
                      {color === c && (
                        <svg className="absolute inset-0 m-auto" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m5 12 5 5L20 7" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="field-label">이메일</label>
                  <input className="input" value={user.email} disabled />
                  <div className="text-[11px] text-ink-500 mt-1">이메일은 관리자만 변경할 수 있습니다.</div>
                </div>
                <div>
                  <label className="field-label">사번</label>
                  <input className="input font-mono" value={user.employeeNo ?? ""} disabled placeholder="—" />
                  <div className="text-[11px] text-ink-500 mt-1">가입 시 자동으로 부여됩니다.</div>
                </div>
              </div>
              {err && <InlineAlert tone="error">{err}</InlineAlert>}
              {savedMsg && <InlineAlert tone="success">{savedMsg}</InlineAlert>}
              <div className="flex justify-end">
                <button className="btn-primary">저장</button>
              </div>
            </form>
          </div>

          <PresencePanel />
          <ThemePanel />
          <DesktopNotifyPanel />

          <div className="panel p-6">
            <div className="h-sub mb-4">비밀번호 변경</div>
            <form onSubmit={changePw} className="space-y-3">
              <div>
                <label className="field-label">현재 비밀번호</label>
                <input
                  className="input"
                  type="password"
                  value={pwForm.current}
                  onChange={(e) => setPwForm({ ...pwForm, current: e.target.value })}
                  required
                  maxLength={200}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="field-label">새 비밀번호 (8자 이상)</label>
                  <input
                    className="input"
                    type="password"
                    value={pwForm.next}
                    onChange={(e) => setPwForm({ ...pwForm, next: e.target.value })}
                    required
                    minLength={8}
                    maxLength={128}
                  />
                </div>
                <div>
                  <label className="field-label">새 비밀번호 확인</label>
                  <input
                    className="input"
                    type="password"
                    value={pwForm.confirm}
                    onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })}
                    required
                    minLength={8}
                    maxLength={128}
                  />
                </div>
              </div>
              {pwErr && <InlineAlert tone="error">{pwErr}</InlineAlert>}
              {pwMsg && <InlineAlert tone="success">{pwMsg}</InlineAlert>}
              <div className="flex justify-end">
                <button className="btn-primary">비밀번호 변경</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

function DesktopNotifyPanel() {
  const [perm, setPerm] = useState<DesktopNotifPermission>(() => getDesktopPermission());
  const [enabled, setEnabled] = useState<boolean>(() => isDesktopEnabled());

  async function onEnable() {
    const p = await requestDesktopPermission();
    setPerm(p);
    if (p === "granted") {
      setDesktopEnabled(true);
      setEnabled(true);
    }
  }

  function onToggle(next: boolean) {
    setDesktopEnabled(next);
    setEnabled(next);
  }

  function onTest() {
    showDesktopNotification({
      id: `test-${Date.now()}`,
      title: "HiNest 데스크톱 알림",
      body: "알림이 정상적으로 동작해요. 앞으로 새 공지·DM·결재 요청 등이 생기면 이렇게 알려드릴게요.",
      url: "/",
    });
  }

  const statusChip = () => {
    if (perm === "unsupported")
      return <span className="chip-gray">지원 안함</span>;
    if (perm === "granted" && enabled)
      return <span className="chip-green"><span className="badge-dot" style={{ background: "#16A34A" }} />활성화됨</span>;
    if (perm === "granted")
      return <span className="chip-gray">꺼짐</span>;
    if (perm === "denied")
      return <span className="chip-red">차단됨</span>;
    return <span className="chip-amber">권한 필요</span>;
  };

  const ua = typeof navigator !== "undefined" ? navigator.userAgent.toLowerCase() : "";
  const os = ua.includes("mac") ? "mac" : ua.includes("win") ? "win" : "other";

  return (
    <div className="panel p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="h-sub">데스크톱 알림</div>
          <div className="t-caption mt-0.5">
            브라우저 탭이 비활성일 때 Windows·macOS 시스템 알림으로 알려드려요.
          </div>
        </div>
        <div>{statusChip()}</div>
      </div>

      {perm === "unsupported" && (
        <div className="mt-4 p-3 rounded-lg bg-ink-50 border border-ink-150 text-[12px] text-ink-600">
          이 브라우저는 데스크톱 알림을 지원하지 않아요. Chrome, Edge, Safari, Firefox 최신 버전을 이용해 주세요.
        </div>
      )}

      {perm === "default" && (
        <button type="button" className="btn-primary mt-4" onClick={onEnable}>
          데스크톱 알림 켜기
        </button>
      )}

      {perm === "denied" && (
        <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-[12px] text-amber-800 leading-relaxed">
          브라우저 알림 권한이 차단돼 있어요. 주소창 왼쪽 자물쇠 아이콘 → 사이트 설정 → 알림을 "허용"으로 바꾼 뒤 페이지를 새로고침해 주세요.
          {os === "mac" && (
            <div className="mt-1 text-ink-700">
              macOS: 시스템 설정 → 알림 → 사용 중인 브라우저에서도 "알림 허용"이 켜져 있어야 해요.
            </div>
          )}
          {os === "win" && (
            <div className="mt-1 text-ink-700">
              Windows: 설정 → 시스템 → 알림에서 브라우저 알림이 켜져 있는지 확인해 주세요. 집중 모드(방해 금지)가 켜져 있으면 알림이 뜨지 않아요.
            </div>
          )}
        </div>
      )}

      {perm === "granted" && (
        <div className="mt-4 space-y-3">
          <label className="flex items-center justify-between gap-3 p-3 rounded-lg bg-ink-25 border border-ink-150 cursor-pointer">
            <div>
              <div className="text-[13px] font-bold text-ink-900">새 알림을 OS 알림으로 보기</div>
              <div className="text-[11.5px] text-ink-500 mt-0.5">탭이 비활성일 때만 자동 발송돼요</div>
            </div>
            <input
              type="checkbox"
              className="accent-brand-500 w-5 h-5"
              checked={enabled}
              onChange={(e) => onToggle(e.target.checked)}
            />
          </label>
          <button type="button" className="btn-ghost" onClick={onTest}>
            테스트 알림 보내기
          </button>
        </div>
      )}
    </div>
  );
}

function ThemePanel() {
  const { mode, resolved, setMode } = useTheme();
  const options: { value: ThemeMode; label: string; desc: string; icon: JSX.Element }[] = [
    {
      value: "light",
      label: "라이트",
      desc: "밝은 화면",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
      ),
    },
    {
      value: "dark",
      label: "다크",
      desc: "어두운 화면",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      ),
    },
    {
      value: "system",
      label: "시스템 설정",
      desc: "OS 설정을 따름",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="14" rx="2" />
          <path d="M8 21h8M12 18v3" />
        </svg>
      ),
    },
  ];

  return (
    <div className="panel p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="h-sub">화면 테마</div>
          <div className="t-caption mt-0.5">현재 적용: <b className="text-ink-900">{resolved === "dark" ? "다크" : "라이트"}</b></div>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {options.map((opt) => {
          const active = mode === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setMode(opt.value)}
              className={`panel p-0 overflow-hidden text-left transition ${
                active ? "!border-brand-500 ring-2 ring-brand-500/20" : "hover:!border-ink-300"
              }`}
            >
              <div className="h-[90px] flex items-center justify-center relative" aria-hidden>
                {opt.value === "light" && <SwatchLight />}
                {opt.value === "dark" && <SwatchDark />}
                {opt.value === "system" && <SwatchSystem />}
              </div>
              <div className="p-3 border-t border-ink-150">
                <div className="flex items-center gap-1.5">
                  <span className={active ? "text-brand-600" : "text-ink-600"}>{opt.icon}</span>
                  <div className="text-[13px] font-bold text-ink-900">{opt.label}</div>
                  {active && (
                    <span className="ml-auto w-5 h-5 rounded-full bg-brand-500 text-white grid place-items-center">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m5 12 5 5L20 7" />
                      </svg>
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-ink-500 mt-0.5">{opt.desc}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SwatchLight() {
  return (
    <div className="w-full h-full p-3 bg-ink-25 flex gap-2">
      <div className="w-10 rounded-md bg-white border border-ink-150" />
      <div className="flex-1 space-y-1.5">
        <div className="h-2 rounded bg-ink-200" />
        <div className="h-2 rounded bg-ink-150 w-3/4" />
        <div className="h-6 rounded bg-white border border-ink-150" />
      </div>
    </div>
  );
}
function SwatchDark() {
  return (
    <div className="w-full h-full p-3 flex gap-2" style={{ background: "#0F1115" }}>
      <div className="w-10 rounded-md" style={{ background: "#17191F", border: "1px solid #2A2E37" }} />
      <div className="flex-1 space-y-1.5">
        <div className="h-2 rounded" style={{ background: "#343942" }} />
        <div className="h-2 rounded w-3/4" style={{ background: "#2A2E37" }} />
        <div className="h-6 rounded" style={{ background: "#17191F", border: "1px solid #2A2E37" }} />
      </div>
    </div>
  );
}
function SwatchSystem() {
  return (
    <div className="w-full h-full flex">
      <div className="w-1/2 p-3 bg-ink-25 flex gap-1.5">
        <div className="w-6 rounded bg-white border border-ink-150" />
        <div className="flex-1 space-y-1">
          <div className="h-1.5 rounded bg-ink-200" />
          <div className="h-1.5 rounded bg-ink-150 w-2/3" />
        </div>
      </div>
      <div className="w-1/2 p-3 flex gap-1.5" style={{ background: "#0F1115" }}>
        <div className="w-6 rounded" style={{ background: "#17191F", border: "1px solid #2A2E37" }} />
        <div className="flex-1 space-y-1">
          <div className="h-1.5 rounded" style={{ background: "#343942" }} />
          <div className="h-1.5 rounded w-2/3" style={{ background: "#2A2E37" }} />
        </div>
      </div>
    </div>
  );
}

function InfoField({ label, value, tone, mono }: { label: string; value: string; tone?: "green"; mono?: boolean }) {
  return (
    <div>
      <div className="text-[11px] font-bold text-ink-500 uppercase tracking-[0.06em]">{label}</div>
      <div className={`text-[13px] font-semibold mt-0.5 ${tone === "green" ? "text-emerald-600" : "text-ink-900"} ${mono ? "font-mono tracking-[0.02em]" : ""}`}>{value}</div>
    </div>
  );
}

function InlineAlert({ tone, children }: { tone: "error" | "success"; children: React.ReactNode }) {
  const cls =
    tone === "error"
      ? "bg-red-50 border-red-100 text-red-700"
      : "bg-emerald-50 border-emerald-100 text-emerald-700";
  const Icon = tone === "error" ? (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" /></svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></svg>
  );
  return (
    <div className={`flex items-start gap-2 p-2.5 rounded-md border text-[12px] font-semibold ${cls}`}>
      <span className="mt-0.5 flex-shrink-0">{Icon}</span>
      {children}
    </div>
  );
}

/* ===== 업무 상태 패널 — 다른 사람에게 내 상태 표시 ===== */
function PresencePanel() {
  const { user, refresh } = useAuth();
  const [status, setStatus] = useState<PresenceStatus | null>(
    ((user as any)?.presenceStatus ?? null) as PresenceStatus | null
  );
  const [message, setMessage] = useState<string>((user as any)?.presenceMessage ?? "");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // user 가 뒤늦게 로드되거나 refresh() 후 최신 값으로 동기화
  useEffect(() => {
    if (!user) return;
    setStatus(((user as any).presenceStatus ?? null) as PresenceStatus | null);
    setMessage((user as any).presenceMessage ?? "");
  }, [(user as any)?.presenceStatus, (user as any)?.presenceMessage]);

  // 선택된 수동 상태의 톤 — null 이면 회색 "자동" 으로 표시.
  const cur = status ? resolvePresence(status, null) : { color: "#8E959E", label: "자동" };

  async function save(nextStatus: PresenceStatus | null, nextMessage: string) {
    setSaving(true);
    setErrMsg(null);
    try {
      await api("/api/me/presence", {
        method: "PATCH",
        json: { status: nextStatus, message: nextMessage || null },
      });
      setStatus(nextStatus);
      setMessage(nextMessage);
      setSavedAt(Date.now());
      // /api/me 로 사용자 새로고침 → 다른 패널/페이지에도 반영
      await refresh?.();
    } catch (e: any) {
      setErrMsg(e?.message ?? "저장 실패");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="panel p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="h-sub">업무 상태</div>
          <div className="t-caption mt-0.5">
            조직도·사내톡·팀원 목록에서 다른 사람들에게 보여지는 상태입니다.
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-bold"
          style={{ background: cur.color + "18", color: cur.color }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: cur.color }} />
          {status ? cur.label : "자동"}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2">
        {PRESENCE_CHOICES.map((c) => {
          const active = (status ?? null) === c.value;
          return (
            <button
              key={c.label}
              type="button"
              disabled={saving}
              onClick={() => save(c.value, message)}
              className={`px-3 py-2.5 rounded-xl text-[13px] font-semibold border transition ${
                active
                  ? "bg-brand-500 text-white border-brand-500 shadow-sm"
                  : "bg-ink-25 text-ink-700 border-transparent hover:bg-ink-50"
              }`}
            >
              <span className="mr-1.5">{c.emoji}</span>
              {c.label}
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        <label className="field-label">상태 메시지 (선택)</label>
        <div className="flex gap-2">
          <input
            className="input flex-1"
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, 60))}
            placeholder="예) 14시까지 외근"
          />
          <button
            className="btn-ghost"
            disabled={saving}
            onClick={() => save(status, message)}
          >
            저장
          </button>
        </div>
        {errMsg && (
          <div className="text-[11px] text-red-600 mt-1.5 font-semibold">❌ {errMsg}</div>
        )}
        {savedAt && !errMsg && (
          <div className="text-[11px] text-green-600 mt-1.5">
            저장됨 · {new Date(savedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
          </div>
        )}
        <div className="text-[11px] text-ink-500 mt-2">
          "근무중" · "오프라인" 은 자동 판정이라 여기서 선택할 수 없어요. "자동" 을 선택하면 오늘 출퇴근 여부에 따라 자동으로 표시됩니다.
        </div>
      </div>
    </div>
  );
}
