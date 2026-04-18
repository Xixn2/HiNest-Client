import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import PageHeader from "../components/PageHeader";

type Folder = { id: string; name: string; parentId?: string | null; createdAt: string };
type Doc = {
  id: string;
  title: string;
  description?: string;
  folderId?: string | null;
  fileUrl?: string | null;
  fileName?: string | null;
  fileType?: string | null;
  fileSize?: number | null;
  tags?: string | null;
  createdAt: string;
  updatedAt: string;
  author: { name: string; avatarColor: string };
  folder?: { name: string } | null;
};

export default function DocumentsPage() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [currentFolder, setCurrentFolder] = useState<string | "root">("root");
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState<null | "folder" | "doc">(null);
  const [uploading, setUploading] = useState(false);
  const [docForm, setDocForm] = useState({ title: "", description: "", tags: "", fileUrl: "", fileName: "", fileType: "", fileSize: 0 });
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    const [f, d] = await Promise.all([
      api<{ folders: Folder[] }>("/api/document/folders"),
      api<{ documents: Doc[] }>(
        `/api/document?folderId=${encodeURIComponent(currentFolder)}${q ? `&q=${encodeURIComponent(q)}` : ""}`
      ),
    ]);
    setFolders(f.folders);
    setDocs(d.documents);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, [currentFolder, q]);

  async function addFolder() {
    const name = prompt("새 폴더 이름");
    if (!name?.trim()) return;
    await api("/api/document/folders", {
      method: "POST",
      json: { name: name.trim(), parentId: currentFolder === "root" ? null : currentFolder },
    });
    load();
  }

  async function renameFolder(f: Folder) {
    const name = prompt("새 이름", f.name);
    if (!name?.trim() || name === f.name) return;
    await api(`/api/document/folders/${f.id}`, { method: "PATCH", json: { name: name.trim() } });
    load();
  }

  async function deleteFolder(f: Folder) {
    if (!confirm(`'${f.name}' 폴더를 삭제할까요? 하위 폴더·문서가 모두 삭제됩니다.`)) return;
    await api(`/api/document/folders/${f.id}`, { method: "DELETE" });
    if (currentFolder === f.id) setCurrentFolder("root");
    else load();
  }

  async function uploadFile(file: File) {
    if (file.size > 100 * 1024 * 1024) return alert("파일은 100MB 이하만 업로드 가능합니다");
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form, credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).error);
      const json = await res.json();
      setDocForm((p) => ({
        ...p,
        title: p.title || file.name.replace(/\.[^.]+$/, ""),
        fileUrl: json.url,
        fileName: json.name,
        fileType: json.type,
        fileSize: json.size,
      }));
    } catch (e: any) { alert(e.message); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  async function createDoc(e: React.FormEvent) {
    e.preventDefault();
    if (!docForm.title.trim()) return alert("제목을 입력해주세요");
    await api("/api/document", {
      method: "POST",
      json: {
        ...docForm,
        folderId: currentFolder === "root" ? null : currentFolder,
      },
    });
    setCreating(null);
    setDocForm({ title: "", description: "", tags: "", fileUrl: "", fileName: "", fileType: "", fileSize: 0 });
    load();
  }

  async function deleteDoc(d: Doc) {
    if (!confirm(`'${d.title}' 을(를) 삭제할까요?`)) return;
    await api(`/api/document/${d.id}`, { method: "DELETE" });
    load();
  }

  // 현재 폴더의 하위 폴더
  const currentChildren = useMemo(() => {
    if (currentFolder === "root") return folders.filter((f) => !f.parentId);
    return folders.filter((f) => f.parentId === currentFolder);
  }, [folders, currentFolder]);

  // 브레드크럼 경로
  const crumbs = useMemo(() => {
    const arr: Folder[] = [];
    let id: string | null = currentFolder === "root" ? null : currentFolder;
    while (id) {
      const f = folders.find((x) => x.id === id);
      if (!f) break;
      arr.unshift(f);
      id = f.parentId ?? null;
    }
    return arr;
  }, [folders, currentFolder]);

  return (
    <div>
      <PageHeader
        eyebrow="자료"
        title="문서함"
        description="회사 규정·양식·매뉴얼 등을 보관하고 공유합니다."
        right={
          <>
            <button className="btn-ghost" onClick={addFolder}>+ 새 폴더</button>
            <button className="btn-primary" onClick={() => setCreating("doc")}>+ 문서 업로드</button>
          </>
        }
      />

      {/* 툴바 */}
      <div className="flex items-center gap-2 mb-4">
        <div className="flex items-center gap-1 text-[13px] flex-1 min-w-0">
          <button
            className={`px-2 py-1 rounded hover:bg-ink-100 ${currentFolder === "root" ? "font-bold text-ink-900" : "text-ink-600"}`}
            onClick={() => setCurrentFolder("root")}
          >
            📁 루트
          </button>
          {crumbs.map((f) => (
            <span key={f.id} className="flex items-center gap-1">
              <span className="text-ink-300">/</span>
              <button
                className={`px-2 py-1 rounded hover:bg-ink-100 ${f.id === currentFolder ? "font-bold text-ink-900" : "text-ink-600"}`}
                onClick={() => setCurrentFolder(f.id)}
              >
                {f.name}
              </button>
            </span>
          ))}
        </div>
        <div className="relative w-[220px]">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#8E959E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input className="input pl-9" placeholder="문서 검색" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {/* 폴더 그리드 */}
      {currentChildren.length > 0 && (
        <div className="mb-5">
          <div className="text-[11px] font-extrabold text-ink-500 uppercase tracking-[0.08em] mb-2">폴더</div>
          <div className="grid grid-cols-4 gap-3">
            {currentChildren.map((f) => (
              <div
                key={f.id}
                onDoubleClick={() => setCurrentFolder(f.id)}
                className="panel p-4 flex items-center gap-3 hover:border-ink-300 cursor-pointer group"
                onClick={() => setCurrentFolder(f.id)}
              >
                <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 grid place-items-center flex-shrink-0">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-bold text-ink-900 truncate">{f.name}</div>
                  <div className="text-[11px] text-ink-500 tabular">{new Date(f.createdAt).toLocaleDateString("ko-KR")}</div>
                </div>
                <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1">
                  <button className="btn-icon" onClick={(e) => { e.stopPropagation(); renameFolder(f); }} title="이름 변경">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
                  </button>
                  <button className="btn-icon" onClick={(e) => { e.stopPropagation(); deleteFolder(f); }} title="삭제">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 문서 리스트 */}
      <div className="mb-2 text-[11px] font-extrabold text-ink-500 uppercase tracking-[0.08em]">문서</div>
      {docs.length === 0 ? (
        <div className="panel py-14 text-center">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-ink-100 grid place-items-center mb-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8E959E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" />
            </svg>
          </div>
          <div className="text-[13px] font-bold text-ink-800">문서가 없어요</div>
          <div className="text-[12px] text-ink-500 mt-1">우측 상단 "문서 업로드" 버튼으로 첫 문서를 추가해보세요.</div>
        </div>
      ) : (
        <div className="panel p-0 overflow-hidden">
          <table className="pro">
            <thead>
              <tr>
                <th>제목</th>
                <th>태그</th>
                <th>파일</th>
                <th>작성자</th>
                <th>수정</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id}>
                  <td>
                    <div className="flex items-start gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-700 grid place-items-center flex-shrink-0">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13px] font-bold text-ink-900">{d.title}</div>
                        {d.description && <div className="text-[11px] text-ink-500 line-clamp-1">{d.description}</div>}
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {(d.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean).map((t) => (
                        <span key={t} className="chip-gray">#{t}</span>
                      ))}
                    </div>
                  </td>
                  <td>
                    {d.fileUrl ? (
                      <a href={d.fileUrl} target="_blank" rel="noreferrer" className="text-[12px] font-bold text-brand-600 hover:underline tabular">
                        {d.fileName} <span className="text-ink-400">({humanSize(d.fileSize ?? 0)})</span>
                      </a>
                    ) : <span className="text-ink-400 text-[12px]">—</span>}
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded grid place-items-center text-white text-[10px] font-bold" style={{ background: d.author.avatarColor }}>{d.author.name[0]}</div>
                      <div className="text-[12px]">{d.author.name}</div>
                    </div>
                  </td>
                  <td className="tabular text-[11px] text-ink-500">{new Date(d.updatedAt).toLocaleDateString("ko-KR")}</td>
                  <td style={{ textAlign: "right" }}>
                    <button className="btn-icon" onClick={() => deleteDoc(d)} title="삭제">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating === "doc" && (
        <div className="fixed inset-0 bg-ink-900/40 grid place-items-center p-4 z-50" onClick={() => setCreating(null)}>
          <div className="panel w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <div className="section-head">
              <div className="title">문서 업로드</div>
              <button className="btn-icon" onClick={() => setCreating(null)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={createDoc} className="p-5 space-y-3">
              <input ref={fileRef} type="file" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); }} className="hidden" />
              <button type="button" className="w-full h-[100px] rounded-xl border-2 border-dashed border-ink-200 hover:border-brand-400 hover:bg-brand-50/30 transition flex flex-col items-center justify-center gap-1" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? (
                  <span className="text-[13px] text-ink-500">업로드 중…</span>
                ) : docForm.fileUrl ? (
                  <>
                    <div className="text-[13px] font-bold text-brand-600">✓ {docForm.fileName}</div>
                    <div className="text-[11px] text-ink-500 tabular">{humanSize(docForm.fileSize)} · 클릭해서 변경</div>
                  </>
                ) : (
                  <>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="m7 8 5-5 5 5" /><path d="M20 21H4" /></svg>
                    <div className="text-[13px] font-bold text-ink-800">파일 선택 (최대 100MB)</div>
                    <div className="text-[11px] text-ink-500">선택 사항 · 링크만 있는 문서도 가능</div>
                  </>
                )}
              </button>
              <div>
                <label className="field-label">제목</label>
                <input className="input" value={docForm.title} onChange={(e) => setDocForm({ ...docForm, title: e.target.value })} required />
              </div>
              <div>
                <label className="field-label">설명</label>
                <textarea className="input" rows={2} value={docForm.description} onChange={(e) => setDocForm({ ...docForm, description: e.target.value })} />
              </div>
              <div>
                <label className="field-label">태그 (쉼표로 구분)</label>
                <input className="input" value={docForm.tags} onChange={(e) => setDocForm({ ...docForm, tags: e.target.value })} placeholder="예: 규정, 인사, 양식" />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" className="btn-ghost" onClick={() => setCreating(null)}>취소</button>
                <button className="btn-primary">등록</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function humanSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
