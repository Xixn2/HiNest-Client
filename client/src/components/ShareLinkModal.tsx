import { useEffect, useState } from "react";
import { api } from "../api";
import { alertAsync } from "./ConfirmHost";

/**
 * 외부 공유 링크 관리 모달. 문서 1건에 대해 N개의 토큰 링크를 만들고 / 해지.
 * 생성 시 만료일·다운로드 횟수·비밀번호 옵션을 걸 수 있다.
 */
type ShareLink = {
  id: string;
  token: string;
  documentId: string;
  createdAt: string;
  expiresAt: string | null;
  maxDownloads: number | null;
  downloads: number;
  hasPassword: boolean;
  revokedAt: string | null;
};

export default function ShareLinkModal({
  documentId,
  documentTitle,
  onClose,
}: {
  documentId: string;
  documentTitle: string;
  onClose: () => void;
}) {
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<{ expiresAt: string; maxDownloads: string; password: string }>({
    expiresAt: "",
    maxDownloads: "",
    password: "",
  });

  async function load() {
    setLoading(true);
    try {
      const r = await api<{ links: ShareLink[] }>(`/api/share-links?documentId=${encodeURIComponent(documentId)}`);
      setLinks(r.links);
    } catch {
      setLinks([]);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [documentId]);

  async function create() {
    if (creating) return;
    setCreating(true);
    try {
      const payload: any = { documentId };
      if (form.expiresAt) payload.expiresAt = new Date(form.expiresAt).toISOString();
      if (form.maxDownloads) payload.maxDownloads = Math.max(1, parseInt(form.maxDownloads, 10));
      if (form.password) payload.password = form.password;
      await api("/api/share-links", { method: "POST", json: payload });
      setForm({ expiresAt: "", maxDownloads: "", password: "" });
      await load();
    } catch (e: any) {
      alertAsync({ title: "생성 실패", description: e?.message ?? "다시 시도해주세요" });
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    try {
      await api(`/api/share-links/${id}`, { method: "DELETE" });
      await load();
    } catch (e: any) {
      alertAsync({ title: "해지 실패", description: e?.message ?? "다시 시도해주세요" });
    }
  }

  function linkUrl(token: string) {
    return `${window.location.origin}/share/${token}`;
  }

  async function copyLink(token: string) {
    try {
      await navigator.clipboard.writeText(linkUrl(token));
      alertAsync({ title: "복사됨", description: "링크가 클립보드에 복사됐어요." });
    } catch {
      window.prompt("링크를 복사하세요", linkUrl(token));
    }
  }

  return (
    <div className="fixed inset-0 bg-ink-900/40 grid place-items-center p-4 z-50" onClick={onClose}>
      <div className="panel w-full max-w-lg shadow-pop" onClick={(e) => e.stopPropagation()}>
        <div className="section-head">
          <div className="title">외부 공유 링크 · {documentTitle}</div>
          <button className="btn-icon" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[72vh] overflow-auto">
          <div className="panel p-3 bg-ink-25 space-y-2">
            <div className="text-[12px] font-bold text-ink-700">새 링크 만들기</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-bold text-ink-500">만료 (선택)</span>
                <input type="datetime-local" className="input" value={form.expiresAt}
                  onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-bold text-ink-500">다운로드 횟수 제한 (선택)</span>
                <input type="number" className="input tabular" value={form.maxDownloads} min={1}
                  onChange={(e) => setForm({ ...form, maxDownloads: e.target.value })} placeholder="무제한" />
              </label>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-bold text-ink-500">비밀번호 (선택)</span>
              <input type="password" className="input" value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="빈 칸이면 미사용" />
            </label>
            <div className="flex justify-end">
              <button className="btn-primary" disabled={creating} onClick={create}>
                {creating ? "만드는 중…" : "공유 링크 만들기"}
              </button>
            </div>
          </div>

          <div>
            <div className="text-[12px] font-bold text-ink-700 mb-2">발급된 링크</div>
            {loading ? (
              <div className="text-[12px] text-ink-400 py-6 text-center">불러오는 중…</div>
            ) : links.length === 0 ? (
              <div className="text-[12px] text-ink-400 py-6 text-center">아직 없어요.</div>
            ) : (
              <div className="space-y-2">
                {links.map((l) => {
                  const expired = l.expiresAt && new Date(l.expiresAt).getTime() < Date.now();
                  const capped = l.maxDownloads !== null && l.downloads >= l.maxDownloads;
                  const dead = !!l.revokedAt || expired || capped;
                  return (
                    <div key={l.id} className={`panel p-3 ${dead ? "opacity-60" : ""}`}>
                      <div className="flex items-start gap-2">
                        <input
                          className="input text-[11px] tabular flex-1"
                          readOnly
                          value={linkUrl(l.token)}
                          onClick={(e) => (e.target as HTMLInputElement).select()}
                        />
                        <button className="btn-ghost !px-2" onClick={() => copyLink(l.token)} title="복사">복사</button>
                        {!l.revokedAt && (
                          <button className="btn-ghost !px-2 text-danger" onClick={() => revoke(l.id)} title="해지">해지</button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2 mt-1.5 text-[11px] text-ink-500 tabular">
                        <span>다운로드 {l.downloads}{l.maxDownloads !== null ? `/${l.maxDownloads}` : ""}</span>
                        {l.expiresAt && <span>· 만료 {new Date(l.expiresAt).toLocaleString("ko-KR")}</span>}
                        {l.hasPassword && <span>· 비밀번호 보호</span>}
                        {l.revokedAt && <span className="text-danger">· 해지됨</span>}
                        {!l.revokedAt && expired && <span className="text-danger">· 만료</span>}
                        {!l.revokedAt && !expired && capped && <span className="text-danger">· 한도 초과</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
