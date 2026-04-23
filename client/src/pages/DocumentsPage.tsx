import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import PageHeader from "../components/PageHeader";
import { confirmAsync, alertAsync, promptAsync } from "../components/ConfirmHost";

type Folder = {
  id: string;
  name: string;
  parentId?: string | null;
  createdAt: string;
  scope?: DocScope;
  scopeTeam?: string | null;
  scopeUserIds?: string | null;
};
type DocScope = "ALL" | "TEAM" | "PRIVATE" | "CUSTOM";
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
  scope?: DocScope;
  scopeTeam?: string | null;
  scopeUserIds?: string | null;
  createdAt: string;
  updatedAt: string;
  author: { name: string; avatarColor: string; avatarUrl?: string | null };
  folder?: { name: string } | null;
};

type ScopeTab = "all" | "public" | "team" | "private" | "custom";
const SCOPE_TABS: { key: ScopeTab; label: string }[] = [
  { key: "all",     label: "전체" },
  { key: "team",    label: "팀" },
  { key: "private", label: "개인" },
  { key: "custom",  label: "사용자지정" },
];
const SCOPE_LABEL: Record<DocScope, string> = {
  ALL: "전체 공개",
  TEAM: "팀 공개",
  PRIVATE: "개인",
  CUSTOM: "사용자지정",
};
type DirUser = { id: string; name: string; team?: string | null; avatarColor?: string; avatarUrl?: string | null };
type ProjectChip = { id: string; name: string; color: string };

type Props = {
  /** 프로젝트 상세 페이지에서 embed 하는 경우 */
  projectId?: string;
  /** embed 모드 — 페이지 헤더/카테고리 칩을 숨기고 상위 컨테이너가 래핑하는 전제 */
  embedded?: boolean;
};

export default function DocumentsPage({ projectId: fixedProjectId, embedded = false }: Props = {}) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [currentFolder, setCurrentFolder] = useState<string | "root">("root");
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState<null | "folder" | "doc">(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [modalErr, setModalErr] = useState<string | null>(null);
  const [busyFolderId, setBusyFolderId] = useState<string | null>(null);
  const [busyDocId, setBusyDocId] = useState<string | null>(null);
  const [scopeTab, setScopeTab] = useState<ScopeTab>("all");
  const [allUsers, setAllUsers] = useState<DirUser[]>([]);
  // 내가 접근 가능한 프로젝트 칩 목록. fixedProjectId 로 고정된 모드에선 안 쓴다.
  const [projects, setProjects] = useState<ProjectChip[]>([]);
  // "전체"(null) 또는 선택된 프로젝트 id. embed 모드에선 fixedProjectId 를 우선 적용.
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(fixedProjectId ?? null);
  const activeProjectId = fixedProjectId ?? selectedProjectId;
  const inProject = !!activeProjectId;
  const [folderForm, setFolderForm] = useState<{
    name: string;
    scope: DocScope;
    scopeUserIds: string[];
  }>({ name: "", scope: "ALL", scopeUserIds: [] });
  const [docForm, setDocForm] = useState<{
    title: string; description: string; tags: string;
    fileUrl: string; fileName: string; fileType: string; fileSize: number;
    scope: DocScope; scopeTeam: string; scopeUserIds: string[];
  }>({ title: "", description: "", tags: "", fileUrl: "", fileName: "", fileType: "", fileSize: 0, scope: "ALL", scopeTeam: "", scopeUserIds: [] });
  const fileRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  // "폴더 업로드" 진행 상황 — 현재 파일 n/total 이랑 현재 경로를 표시한다.
  const [folderUpload, setFolderUpload] = useState<{ done: number; total: number; label: string } | null>(null);

  async function load(aliveRef?: { current: boolean }) {
    // 프로젝트 선택 시엔 projectId 필터. scope 필터는 프로젝트 내에선 의미 없음(멤버십이 권한).
    const pid = activeProjectId;
    const qs = (extra: string) =>
      pid
        ? `projectId=${encodeURIComponent(pid)}&${extra}`
        : `scope=${scopeTab}&${extra}`;
    const [f, d] = await Promise.all([
      api<{ folders: Folder[] }>(
        pid
          ? `/api/document/folders?projectId=${encodeURIComponent(pid)}`
          : `/api/document/folders?scope=${scopeTab}`,
      ),
      api<{ documents: Doc[] }>(
        `/api/document?${qs(`folderId=${encodeURIComponent(currentFolder)}${q ? `&q=${encodeURIComponent(q)}` : ""}`)}`,
      ),
    ]);
    if (aliveRef && !aliveRef.current) return;
    setFolders(f.folders);
    setDocs(d.documents);
  }

  // 프로젝트 칩 목록 로드 — 임베드 모드 아니고 고정 프로젝트가 없을 때만 필요.
  useEffect(() => {
    if (embedded || fixedProjectId) return;
    let alive = true;
    api<{ projects: ProjectChip[] }>("/api/document/projects")
      .then((r) => { if (alive) setProjects(r.projects); })
      .catch(() => {});
    return () => { alive = false; };
  }, [embedded, fixedProjectId]);

  useEffect(() => {
    const aliveRef = { current: true };
    load(aliveRef);
    return () => { aliveRef.current = false; };
    // eslint-disable-next-line
  }, [currentFolder, q, scopeTab, activeProjectId]);

  // 프로젝트/탭 전환 시 폴더 루트로 되돌림 (다른 네임스페이스의 폴더 id 가 stale 한 채 남지 않게).
  useEffect(() => {
    setCurrentFolder("root");
  }, [activeProjectId]);

  // 사용자지정 범위 선택 시 유저 목록 로드 (문서 / 폴더 모달 공용)
  useEffect(() => {
    if ((creating !== "doc" && creating !== "folder") || allUsers.length > 0) return;
    let alive = true;
    api<{ users: DirUser[] }>("/api/users")
      .then((r) => { if (alive) setAllUsers(r.users); })
      .catch(() => {});
    return () => { alive = false; };
  }, [creating, allUsers.length]);

  function openFolderModal() {
    // 현재 보고 있는 scope 탭을 기본값으로 제안 — UX 상 "팀" 탭에서 + 누르면 대개 팀 폴더를 만듦.
    const preset: DocScope =
      scopeTab === "team" ? "TEAM"
      : scopeTab === "private" ? "PRIVATE"
      : scopeTab === "custom" ? "CUSTOM"
      : "ALL";
    setFolderForm({ name: "", scope: preset, scopeUserIds: [] });
    setModalErr(null);
    setCreating("folder");
  }

  async function createFolder(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (!folderForm.name.trim()) return;
    if (folderForm.scope === "CUSTOM" && folderForm.scopeUserIds.length === 0) {
      setModalErr("사용자지정 범위에선 최소 한 명 이상을 선택해주세요");
      return;
    }
    setSubmitting(true);
    setModalErr(null);
    try {
      await api("/api/document/folders", {
        method: "POST",
        json: {
          name: folderForm.name.trim(),
          parentId: currentFolder === "root" ? null : currentFolder,
          // 프로젝트 문서함에선 scope/scopeUserIds 무시 — 서버가 ALL 로 고정.
          scope: inProject ? undefined : folderForm.scope,
          scopeUserIds: !inProject && folderForm.scope === "CUSTOM" ? folderForm.scopeUserIds : undefined,
          projectId: activeProjectId ?? undefined,
        },
      });
      setCreating(null);
      setFolderForm({ name: "", scope: "ALL", scopeUserIds: [] });
      await load();
    } catch (e: any) {
      setModalErr(e?.message ?? "폴더 생성에 실패했어요");
    } finally {
      setSubmitting(false);
    }
  }

  async function renameFolder(f: Folder) {
    if (busyFolderId) return;
    const name = await promptAsync({
      title: "폴더 이름 변경",
      placeholder: "새 폴더 이름",
      defaultValue: f.name,
      confirmLabel: "변경",
    });
    if (!name?.trim() || name === f.name) return;
    setBusyFolderId(f.id);
    try {
      await api(`/api/document/folders/${f.id}`, { method: "PATCH", json: { name: name.trim() } });
      await load();
    } catch (e: any) {
      alertAsync({ title: "변경 실패", description: e?.message ?? "이름 변경에 실패했어요" });
    } finally {
      setBusyFolderId(null);
    }
  }

  async function deleteFolder(f: Folder) {
    if (busyFolderId) return;
    const ok = await confirmAsync({
      title: "폴더 삭제",
      description: `'${f.name}' 폴더를 삭제할까요? 하위 폴더·문서가 모두 삭제돼요.`,
      tone: "danger",
      confirmLabel: "삭제",
    });
    if (!ok) return;
    setBusyFolderId(f.id);
    try {
      await api(`/api/document/folders/${f.id}`, { method: "DELETE" });
      if (currentFolder === f.id) setCurrentFolder("root");
      else await load();
    } catch (e: any) {
      alertAsync({ title: "삭제 실패", description: e?.message ?? "폴더 삭제에 실패했어요" });
    } finally {
      setBusyFolderId(null);
    }
  }

  async function uploadFile(file: File) {
    if (file.size > 500 * 1024 * 1024) {
      await alertAsync({ title: "파일 크기 초과", description: "파일은 500MB 이하만 업로드 가능해요" });
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      // 문서함 전용 엔드포인트 — 서버에서 500MB 까지 허용.
      const res = await fetch("/api/upload/document", { method: "POST", body: form, credentials: "include" });
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
    } catch (e: any) {
      alertAsync({ title: "업로드 실패", description: e.message });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  /**
   * 드래그 앤 드롭으로 떨어진 파일을 곧장 업로드하고 문서로 등록한다.
   * 모달을 여는 업로드 버튼 흐름과 달리 제목·설명·태그 없이 파일명 그대로 생성.
   * scope 는 현재 보고 있는 공개범위 탭을 따르고(ALL/TEAM/PRIVATE), CUSTOM 은
   * 사용자 선택이 필요하므로 드롭 업로드에선 ALL 로 내린다.
   */
  async function uploadAndCreate(file: File) {
    if (file.size > 500 * 1024 * 1024) {
      await alertAsync({ title: "파일 크기 초과", description: "파일은 500MB 이하만 업로드 가능해요" });
      return;
    }
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/upload/document", { method: "POST", body: form, credentials: "include" });
    if (!res.ok) throw new Error((await res.json()).error);
    const up = await res.json();
    const fallbackScope: DocScope =
      scopeTab === "team" ? "TEAM" : scopeTab === "private" ? "PRIVATE" : "ALL";
    await api("/api/document", {
      method: "POST",
      json: {
        title: file.name.replace(/\.[^.]+$/, ""),
        description: "",
        tags: "",
        fileUrl: up.url,
        fileName: up.name,
        fileType: up.type,
        fileSize: up.size,
        folderId: currentFolder === "root" ? null : currentFolder,
        scope: inProject ? undefined : fallbackScope,
        projectId: activeProjectId ?? undefined,
      },
    });
  }

  /**
   * 폴더(디렉터리) 통째 업로드.
   * <input webkitdirectory> 로 들어온 파일들은 각 File 에 `webkitRelativePath` 가 채워진다.
   *   예: 기획문서/2025Q2/기획안.docx
   * 이 경로를 분해해서 필요한 폴더들을 서버에 먼저 생성(중복은 스킵)하고,
   * 각 파일을 해당 folderId 밑에 업로드한다. 빈 폴더도 보존.
   */
  async function handleFolderUpload(files: FileList) {
    if (!files.length) return;
    const list = Array.from(files);
    // 상대경로 누락된 파일(크롬/사파리 외) 은 webkitdirectory 가 없을 때 — 그냥 루트로 업로드.
    const anyHasPath = list.some((f) => (f as any).webkitRelativePath);
    if (!anyHasPath) {
      await handleFilesDropped(files);
      return;
    }

    setFolderUpload({ done: 0, total: list.length, label: "폴더 분석 중…" });
    try {
      // 1) 모든 파일 경로에서 필요한 폴더 경로를 추출 (중복 제거).
      //    "a/b/c/file.png" → ["a", "a/b", "a/b/c"]
      const needed = new Set<string>();
      for (const f of list) {
        const rel: string = (f as any).webkitRelativePath || f.name;
        const parts = rel.split("/").slice(0, -1);
        for (let i = 1; i <= parts.length; i++) {
          needed.add(parts.slice(0, i).join("/"));
        }
      }
      // 얕은 폴더부터 정렬(부모 먼저 생성되도록).
      const orderedPaths = Array.from(needed).sort((a, b) => a.split("/").length - b.split("/").length);

      // 2) 경로 → folderId 맵. 루트는 현재 폴더.
      const pathToId = new Map<string, string | null>();
      pathToId.set("", currentFolder === "root" ? null : currentFolder);

      const fallbackScope: DocScope =
        scopeTab === "team" ? "TEAM" : scopeTab === "private" ? "PRIVATE" : "ALL";

      for (const path of orderedPaths) {
        const parts = path.split("/");
        const name = parts[parts.length - 1];
        const parentPath = parts.slice(0, -1).join("/");
        const parentId = pathToId.get(parentPath) ?? null;
        setFolderUpload((s) => s ? { ...s, label: `폴더 생성: ${path}` } : s);
        const res = await api<{ folder: { id: string } }>("/api/document/folders", {
          method: "POST",
          json: {
            name,
            parentId,
            scope: inProject ? undefined : fallbackScope,
            projectId: activeProjectId ?? undefined,
          },
        });
        pathToId.set(path, res.folder.id);
      }

      // 3) 파일 업로드 — 각자 제 자리 folderId 로.
      let done = 0;
      for (const f of list) {
        const rel: string = (f as any).webkitRelativePath || f.name;
        const parts = rel.split("/");
        const folderPath = parts.slice(0, -1).join("/");
        const targetFolderId = pathToId.get(folderPath) ?? null;
        setFolderUpload({ done, total: list.length, label: rel });
        try {
          if (f.size > 500 * 1024 * 1024) {
            await alertAsync({ title: `${f.name} 건너뜀`, description: "500MB 초과" });
          } else {
            const form = new FormData();
            form.append("file", f);
            const res = await fetch("/api/upload/document", { method: "POST", body: form, credentials: "include" });
            if (!res.ok) throw new Error((await res.json()).error);
            const up = await res.json();
            await api("/api/document", {
              method: "POST",
              json: {
                title: f.name.replace(/\.[^.]+$/, ""),
                description: "",
                tags: "",
                fileUrl: up.url,
                fileName: up.name,
                fileType: up.type,
                fileSize: up.size,
                folderId: targetFolderId,
                scope: inProject ? undefined : fallbackScope,
                projectId: activeProjectId ?? undefined,
              },
            });
          }
        } catch (e: any) {
          await alertAsync({ title: `${rel} 업로드 실패`, description: e?.message ?? "" });
        }
        done += 1;
        setFolderUpload({ done, total: list.length, label: rel });
      }
      await load();
    } finally {
      setFolderUpload(null);
      if (folderInputRef.current) folderInputRef.current.value = "";
    }
  }

  const [dropActive, setDropActive] = useState(false);
  async function handleFilesDropped(files: FileList) {
    if (!files.length) return;
    setUploading(true);
    try {
      const list = Array.from(files);
      for (const f of list) {
        try { await uploadAndCreate(f); }
        catch (e: any) { await alertAsync({ title: `${f.name} 업로드 실패`, description: e?.message ?? "" }); }
      }
      await load();
    } finally {
      setUploading(false);
    }
  }

  async function createDoc(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (!docForm.title.trim()) {
      setModalErr("제목을 입력해주세요");
      return;
    }
    if (docForm.scope === "CUSTOM" && docForm.scopeUserIds.length === 0) {
      setModalErr("사용자지정 범위에선 최소 한 명 이상을 선택해주세요");
      return;
    }
    setSubmitting(true);
    setModalErr(null);
    try {
      await api("/api/document", {
        method: "POST",
        json: {
          title: docForm.title,
          description: docForm.description,
          tags: docForm.tags,
          fileUrl: docForm.fileUrl,
          fileName: docForm.fileName,
          fileType: docForm.fileType,
          fileSize: docForm.fileSize,
          folderId: currentFolder === "root" ? null : currentFolder,
          // 프로젝트 문서함에선 scope 필드가 무의미 — 서버가 ALL 로 고정.
          scope: inProject ? undefined : docForm.scope,
          scopeTeam: null,
          scopeUserIds: !inProject && docForm.scope === "CUSTOM" ? docForm.scopeUserIds : undefined,
          projectId: activeProjectId ?? undefined,
        },
      });
      setCreating(null);
      setDocForm({ title: "", description: "", tags: "", fileUrl: "", fileName: "", fileType: "", fileSize: 0, scope: "ALL", scopeTeam: "", scopeUserIds: [] });
      await load();
    } catch (e: any) {
      setModalErr(e?.message ?? "문서 등록에 실패했어요");
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteDoc(d: Doc) {
    if (busyDocId) return;
    const ok = await confirmAsync({
      title: "문서 삭제",
      description: `'${d.title}' 을(를) 삭제할까요? 되돌릴 수 없어요.`,
      tone: "danger",
      confirmLabel: "삭제",
    });
    if (!ok) return;
    setBusyDocId(d.id);
    // 낙관적 제거.
    const prev = docs;
    setDocs((xs) => xs.filter((x) => x.id !== d.id));
    try {
      await api(`/api/document/${d.id}`, { method: "DELETE" });
    } catch (e: any) {
      setDocs(prev);
      alertAsync({ title: "삭제 실패", description: e?.message ?? "삭제에 실패했어요" });
    } finally {
      setBusyDocId(null);
    }
  }

  // ===== 다운로드 =====
  // 개별 문서 — /uploads/<key>?download=1&name=<원본이름> 으로 강제 첨부 헤더 받기.
  // 이미지·영상처럼 기본이 인라인인 타입도 확실히 "저장" 대화상자를 띄우게 함.
  function downloadDoc(d: Doc) {
    if (!d.fileUrl) return;
    const url = new URL(d.fileUrl, window.location.origin);
    url.searchParams.set("download", "1");
    if (d.fileName) url.searchParams.set("name", d.fileName);
    triggerDownload(url.toString());
  }

  // 폴더 전체 — 서버에서 ZIP 스트림으로 내려옴. 큰 폴더는 시간이 꽤 걸릴 수 있음.
  // 기존엔 <a target="_blank"> 로 새 탭 열어 attachment 헤더로 다운로드 유도했는데
  // 서버가 404/500 을 내면 새 탭에 JSON/빈페이지가 뜨고 사용자는 왜 안되는지 알 수 없었음.
  // fetch 로 받아 Blob 으로 내려받으면: 에러 시 JSON 본문을 파싱해 alertAsync 로 안내 가능.
  async function downloadFolder(f: Folder) {
    try {
      const res = await fetch(`/api/document/folders/${f.id}/download`, { credentials: "include" });
      if (!res.ok) {
        let msg = `다운로드 실패 (HTTP ${res.status})`;
        try {
          const j = await res.json();
          if (j?.error) msg = j.error;
        } catch {}
        await alertAsync({ title: "폴더 다운로드 실패", description: msg });
        return;
      }
      const blob = await res.blob();
      if (blob.size === 0) {
        await alertAsync({ title: "폴더 다운로드 실패", description: "서버가 빈 파일을 반환했어요." });
        return;
      }
      const cd = res.headers.get("Content-Disposition") || "";
      const mName = /filename\*=UTF-8''([^;]+)/i.exec(cd) || /filename="?([^";]+)"?/i.exec(cd);
      const fname = mName ? decodeURIComponent(mName[1]) : `${f.name}.zip`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fname;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err: any) {
      await alertAsync({ title: "폴더 다운로드 실패", description: err?.message ?? String(err) });
    }
  }

  // 새 탭에서 열되 Content-Disposition: attachment 헤더 때문에 바로 다운로드로 떨어진다.
  // target=_blank 로 열어야 현재 페이지가 navigate 되지 않음.
  function triggerDownload(href: string) {
    const a = document.createElement("a");
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // ===== 문서 드래그앤드롭 이동 =====
  // 행을 폴더 카드(또는 브레드크럼) 위에 떨어뜨려 folderId 만 PATCH.
  // 서버는 작성자 본인 or ADMIN 에게만 PATCH 를 허용하므로 권한 없는 이동은 403.
  const [draggingDocId, setDraggingDocId] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null); // "folder:<id>" | "root" | "crumb:<id>"

  async function moveDocToFolder(docId: string, folderId: string | null) {
    const doc = docs.find((x) => x.id === docId);
    if (!doc) return;
    // 같은 폴더로 드롭하면 no-op
    const same =
      (folderId === null && (doc.folderId === null || doc.folderId === undefined)) ||
      (folderId !== null && doc.folderId === folderId);
    if (same) return;
    // 낙관적 업데이트 — 현재 폴더 뷰에서는 즉시 사라짐
    setDocs((prev) => prev.filter((x) => x.id !== docId));
    try {
      await api(`/api/document/${docId}`, { method: "PATCH", json: { folderId } });
    } catch (e: any) {
      alertAsync({ title: "이동 실패", description: e?.message ?? "이동에 실패했어요" });
      load(); // 실패 시 상태 복구
    }
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
      {/* 폴더 통째 업로드 입력 — 헤더 버튼이 항상 트리거할 수 있어야 하므로 페이지 루트에 고정. */}
      {/* @ts-expect-error webkitdirectory 는 React 타입에 없지만 크롬/사파리에서 동작 */}
      <input ref={folderInputRef} type="file" webkitdirectory="" directory="" multiple onChange={(e) => { if (e.target.files) handleFolderUpload(e.target.files); }} className="hidden" />
      {!embedded && (
        <PageHeader
          eyebrow="자료"
          title="문서함"
          description="회사 규정·양식·매뉴얼 등을 보관하고 공유합니다."
          right={
            <>
              <button className="btn-ghost" onClick={openFolderModal}>+ 새 폴더</button>
              <button
                className="btn-ghost"
                onClick={() => folderInputRef.current?.click()}
                disabled={!!folderUpload}
                title="폴더를 통째로 업로드 (하위 폴더 구조 유지)"
              >
                {folderUpload ? `업로드 중… ${folderUpload.done}/${folderUpload.total}` : "+ 폴더 업로드"}
              </button>
              <button className="btn-primary" onClick={() => { setModalErr(null); setCreating("doc"); }}>+ 문서 업로드</button>
            </>
          }
        />
      )}

      {/* 카테고리 칩 — 전체 문서함 + 내가 속한 프로젝트들. fixed/embedded 모드에선 숨김. */}
      {!embedded && !fixedProjectId && (projects.length > 0 || selectedProjectId) && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setSelectedProjectId(null)}
            className={`px-3 h-8 rounded-full text-[12px] font-bold border transition ${
              selectedProjectId === null
                ? "bg-brand-500 text-white border-brand-500"
                : "bg-[color:var(--c-surface)] text-ink-600 border-ink-200 hover:border-ink-300"
            }`}
          >
            전체 문서함
          </button>
          {projects.map((p) => {
            const on = selectedProjectId === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setSelectedProjectId(p.id)}
                className={`px-3 h-8 rounded-full text-[12px] font-bold border transition flex items-center gap-1.5 ${
                  on
                    ? "text-white border-transparent"
                    : "bg-[color:var(--c-surface)] text-ink-700 border-ink-200 hover:border-ink-300"
                }`}
                style={on ? { background: p.color } : undefined}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: on ? "#fff" : p.color }} />
                {p.name}
              </button>
            );
          })}
        </div>
      )}

      {/* 임베드 모드용 미니 툴바 — 헤더가 없는 대신 우측 업로드 버튼을 여기 넣는다 */}
      {embedded && (
        <div className="flex items-center justify-end gap-2 mb-3">
          <button className="btn-ghost btn-xs" onClick={openFolderModal}>+ 새 폴더</button>
          <button
            className="btn-ghost btn-xs"
            onClick={() => folderInputRef.current?.click()}
            disabled={!!folderUpload}
          >
            {folderUpload ? `업로드 중… ${folderUpload.done}/${folderUpload.total}` : "+ 폴더 업로드"}
          </button>
          <button className="btn-primary btn-xs" onClick={() => { setModalErr(null); setCreating("doc"); }}>+ 문서 업로드</button>
        </div>
      )}

      {/* 공개 범위 탭 — 프로젝트 문서함에선 의미 없으므로 숨김. */}
      {!inProject && (
        <div className="flex items-center gap-1 mb-3 border-b border-ink-150">
          {SCOPE_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setScopeTab(t.key)}
              className={`px-3 h-9 text-[13px] font-bold border-b-2 transition ${
                scopeTab === t.key
                  ? "border-brand-500 text-ink-900"
                  : "border-transparent text-ink-500 hover:text-ink-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* 툴바 — 좁은 화면에서는 breadcrumb / 검색 을 세로로 쌓아 겹침 방지 */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-4">
        <div className="flex flex-wrap items-center gap-1 text-[13px] flex-1 min-w-0">
          <button
            className={`px-2 py-1 rounded transition ${
              dragOverKey === "root" ? "bg-brand-100 ring-2 ring-brand-400" : "hover:bg-ink-100"
            } ${currentFolder === "root" ? "font-bold text-ink-900" : "text-ink-600"}`}
            onClick={() => setCurrentFolder("root")}
            onDragOver={(e) => {
              if (!draggingDocId) return;
              e.preventDefault();
              setDragOverKey("root");
            }}
            onDragLeave={() => setDragOverKey((k) => (k === "root" ? null : k))}
            onDrop={(e) => {
              if (!draggingDocId) return;
              e.preventDefault();
              moveDocToFolder(draggingDocId, null);
              setDragOverKey(null);
              setDraggingDocId(null);
            }}
          >
            📁 루트
          </button>
          {crumbs.map((f) => {
            const key = `crumb:${f.id}`;
            return (
              <span key={f.id} className="flex items-center gap-1">
                <span className="text-ink-300">/</span>
                <button
                  className={`px-2 py-1 rounded transition ${
                    dragOverKey === key ? "bg-brand-100 ring-2 ring-brand-400" : "hover:bg-ink-100"
                  } ${f.id === currentFolder ? "font-bold text-ink-900" : "text-ink-600"}`}
                  onClick={() => setCurrentFolder(f.id)}
                  onDragOver={(e) => {
                    if (!draggingDocId) return;
                    e.preventDefault();
                    setDragOverKey(key);
                  }}
                  onDragLeave={() => setDragOverKey((k) => (k === key ? null : k))}
                  onDrop={(e) => {
                    if (!draggingDocId) return;
                    e.preventDefault();
                    moveDocToFolder(draggingDocId, f.id);
                    setDragOverKey(null);
                    setDraggingDocId(null);
                  }}
                >
                  {f.name}
                </button>
              </span>
            );
          })}
        </div>
        <div className="relative w-full sm:w-[220px]">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#8E959E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            className="input pl-9"
            placeholder="문서 검색"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            maxLength={80}
          />
        </div>
      </div>

      {/* 폴더 그리드 */}
      {currentChildren.length > 0 && (
        <div className="mb-5">
          <div className="text-[11px] font-extrabold text-ink-500 uppercase tracking-[0.08em] mb-2">폴더</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {currentChildren.map((f) => {
              const dropKey = `folder:${f.id}`;
              const isDropTarget = dragOverKey === dropKey;
              return (
              <div
                key={f.id}
                onDoubleClick={() => setCurrentFolder(f.id)}
                className={`panel p-4 flex items-center gap-3 cursor-pointer group transition ${
                  isDropTarget
                    ? "border-brand-500 bg-brand-50 ring-2 ring-brand-400"
                    : "hover:border-ink-300"
                }`}
                onClick={() => setCurrentFolder(f.id)}
                onDragOver={(e) => {
                  if (!draggingDocId) return;
                  e.preventDefault();
                  setDragOverKey(dropKey);
                }}
                onDragLeave={() => setDragOverKey((k) => (k === dropKey ? null : k))}
                onDrop={(e) => {
                  if (!draggingDocId) return;
                  e.preventDefault();
                  moveDocToFolder(draggingDocId, f.id);
                  setDragOverKey(null);
                  setDraggingDocId(null);
                }}
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
                  <button className="btn-icon" onClick={(e) => { e.stopPropagation(); downloadFolder(f); }} title="폴더 전체 다운로드 (ZIP)">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></svg>
                  </button>
                  <button className="btn-icon" onClick={(e) => { e.stopPropagation(); renameFolder(f); }} title="이름 변경">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
                  </button>
                  <button className="btn-icon" onClick={(e) => { e.stopPropagation(); deleteFolder(f); }} title="삭제">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                  </button>
                </div>
              </div>
            );
            })}
          </div>
        </div>
      )}

      {/* 문서 리스트 — 파일을 이 영역에 드래그 앤 드롭하면 바로 현재 폴더/범위로 업로드. */}
      <div className="mb-2 text-[11px] font-extrabold text-ink-500 uppercase tracking-[0.08em]">문서</div>
      <div
        onDragOver={(e) => {
          // 파일 드래그일 때만 반응 — 문서 row 재정렬 드래그는 제외.
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          if (!dropActive) setDropActive(true);
        }}
        onDragLeave={(e) => {
          // 자식 요소로 넘어가는 이벤트 무시 — relatedTarget 이 컨테이너 내부면 유지.
          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
          setDropActive(false);
        }}
        onDrop={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          setDropActive(false);
          if (e.dataTransfer.files?.length) void handleFilesDropped(e.dataTransfer.files);
        }}
        className={`relative rounded-2xl transition ${dropActive ? "ring-2 ring-brand-400 ring-offset-2 ring-offset-[color:var(--c-bg)]" : ""}`}
      >
        {dropActive && (
          <div className="pointer-events-none absolute inset-0 z-10 rounded-2xl bg-brand-500/10 border-2 border-dashed border-brand-400 grid place-items-center">
            <div className="text-[13px] font-bold text-brand-700">여기에 놓으면 업로드돼요</div>
          </div>
        )}
      {docs.length === 0 ? (
        <div className="panel py-14 text-center">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-ink-100 grid place-items-center mb-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8E959E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" />
            </svg>
          </div>
          <div className="text-[13px] font-bold text-ink-800">문서가 없어요</div>
          <div className="text-[12px] text-ink-500 mt-1">우측 상단 "문서 업로드" 버튼을 누르거나 파일을 이 영역으로 끌어다 놓아보세요.</div>
        </div>
      ) : (
        <div className="panel p-0 overflow-hidden overflow-x-auto">
          <table className="pro min-w-[760px]">
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
                <tr
                  key={d.id}
                  draggable
                  onDragStart={(e) => {
                    setDraggingDocId(d.id);
                    // 일부 브라우저는 dataTransfer 에 무언가 실려있지 않으면 드래그를 취소함
                    e.dataTransfer.setData("text/plain", d.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => {
                    setDraggingDocId(null);
                    setDragOverKey(null);
                  }}
                  style={{
                    cursor: "grab",
                    opacity: draggingDocId === d.id ? 0.5 : 1,
                  }}
                >
                  <td>
                    <div className="flex items-start gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-700 grid place-items-center flex-shrink-0">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <div className="text-[13px] font-bold text-ink-900">{d.title}</div>
                          {d.scope && d.scope !== "ALL" && (
                            <span className={`text-[10px] font-bold px-1.5 py-[1px] rounded ${
                              d.scope === "PRIVATE" ? "bg-rose-50 text-rose-700"
                              : d.scope === "TEAM" ? "bg-sky-50 text-sky-700"
                              : "bg-violet-50 text-violet-700"
                            }`}>
                              {SCOPE_LABEL[d.scope]}
                              {d.scope === "TEAM" && d.scopeTeam ? ` · ${d.scopeTeam}` : ""}
                            </span>
                          )}
                        </div>
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
                      <div className="w-6 h-6 rounded grid place-items-center text-white text-[10px] font-bold overflow-hidden" style={{ background: d.author.avatarUrl ? "transparent" : d.author.avatarColor }}>
                        {d.author.avatarUrl ? (
                          <img src={d.author.avatarUrl} alt={d.author.name} className="w-full h-full object-cover" />
                        ) : (
                          d.author.name[0]
                        )}
                      </div>
                      <div className="text-[12px]">{d.author.name}</div>
                    </div>
                  </td>
                  <td className="tabular text-[11px] text-ink-500">{new Date(d.updatedAt).toLocaleDateString("ko-KR")}</td>
                  <td style={{ textAlign: "right" }}>
                    <div className="flex items-center justify-end gap-1">
                      {d.fileUrl && (
                        <button className="btn-icon" onClick={() => downloadDoc(d)} title="다운로드">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></svg>
                        </button>
                      )}
                      <button className="btn-icon" onClick={() => deleteDoc(d)} title="삭제">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </div>

      {creating === "folder" && (
        <div className="fixed inset-0 bg-ink-900/40 grid place-items-center p-4 z-50" onClick={() => setCreating(null)}>
          <div className="panel w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="section-head">
              <div className="title">새 폴더</div>
              <button className="btn-icon" onClick={() => setCreating(null)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={createFolder} className="p-5 space-y-3">
              <div>
                <label className="field-label">폴더 이름</label>
                <input
                  className="input"
                  autoFocus
                  value={folderForm.name}
                  onChange={(e) => setFolderForm({ ...folderForm, name: e.target.value })}
                  placeholder="예: 회사규정, 양식모음"
                  required
                />
              </div>
              <div>
                <label className="field-label">공개 범위</label>
                {inProject ? (
                  (() => {
                    const proj = projects.find((p) => p.id === activeProjectId);
                    return (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-ink-200 bg-[color:var(--c-surface-2)]">
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ background: proj?.color ?? "#6B7280" }}
                        />
                        <div className="text-[12px] text-ink-700">
                          <span className="font-bold">{proj?.name ?? "프로젝트"}</span>
                          <span className="text-ink-500"> 프로젝트 폴더 · 멤버만 열람 가능</span>
                        </div>
                      </div>
                    );
                  })()
                ) : (
                <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(["ALL", "TEAM", "PRIVATE", "CUSTOM"] as DocScope[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setFolderForm((p) => ({ ...p, scope: s }))}
                      className={`h-9 rounded-lg border text-[12px] font-bold transition ${
                        folderForm.scope === s
                          ? "border-brand-500 bg-brand-50 text-brand-700"
                          : "border-ink-200 bg-[color:var(--c-surface)] text-ink-600 hover:border-ink-300"
                      }`}
                    >
                      {SCOPE_LABEL[s]}
                    </button>
                  ))}
                </div>
                {folderForm.scope === "TEAM" && (
                  <div className="mt-2 text-[11px] text-ink-500">내가 속한 팀으로 자동 지정돼요.</div>
                )}
                {folderForm.scope === "CUSTOM" && (
                  <div className="mt-2 border border-ink-200 rounded-lg max-h-[180px] overflow-y-auto p-2 space-y-1">
                    {allUsers.length === 0 ? (
                      <div className="text-[12px] text-ink-500 p-2">사용자를 불러오는 중…</div>
                    ) : (
                      allUsers.map((u) => {
                        const checked = folderForm.scopeUserIds.includes(u.id);
                        return (
                          <label key={u.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-ink-50 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => setFolderForm((p) => ({
                                ...p,
                                scopeUserIds: checked
                                  ? p.scopeUserIds.filter((x) => x !== u.id)
                                  : [...p.scopeUserIds, u.id],
                              }))}
                            />
                            <div className="w-6 h-6 rounded grid place-items-center text-white text-[10px] font-bold overflow-hidden" style={{ background: u.avatarUrl ? "transparent" : (u.avatarColor ?? "#6B7280") }}>
                              {u.avatarUrl ? (
                                <img src={u.avatarUrl} alt={u.name} className="w-full h-full object-cover" />
                              ) : (
                                u.name[0]
                              )}
                            </div>
                            <div className="text-[12px] flex-1">{u.name}{u.team ? <span className="text-ink-400 ml-1">· {u.team}</span> : null}</div>
                          </label>
                        );
                      })
                    )}
                  </div>
                )}
                </>
                )}
              </div>
              {modalErr && (
                <div className="text-[12px] text-danger bg-rose-50 border border-rose-200 rounded px-3 py-2">
                  {modalErr}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" className="btn-ghost" onClick={() => setCreating(null)} disabled={submitting}>취소</button>
                <button className="btn-primary" disabled={submitting}>{submitting ? "생성 중…" : "생성"}</button>
              </div>
            </form>
          </div>
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
                    <div className="text-[13px] font-bold text-ink-800">파일 선택 (최대 500MB)</div>
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
              <div>
                <label className="field-label">공개 범위</label>
                {inProject ? (
                  // 프로젝트가 선택된 상태에서 업로드하면 scope 는 의미가 없다.
                  // 프로젝트 멤버십이 권한을 결정하므로 선택 UI 대신 어디로 올라가는지만 알림.
                  (() => {
                    const proj = projects.find((p) => p.id === activeProjectId);
                    return (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-ink-200 bg-[color:var(--c-surface-2)]">
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ background: proj?.color ?? "#6B7280" }}
                        />
                        <div className="text-[12px] text-ink-700">
                          <span className="font-bold">{proj?.name ?? "프로젝트"}</span>
                          <span className="text-ink-500"> 프로젝트에 업로드 · 멤버만 열람 가능</span>
                        </div>
                      </div>
                    );
                  })()
                ) : (
                <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(["ALL", "TEAM", "PRIVATE", "CUSTOM"] as DocScope[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setDocForm((p) => ({ ...p, scope: s }))}
                      className={`h-9 rounded-lg border text-[12px] font-bold transition ${
                        docForm.scope === s
                          ? "border-brand-500 bg-brand-50 text-brand-700"
                          : "border-ink-200 bg-white text-ink-600 hover:border-ink-300"
                      }`}
                    >
                      {SCOPE_LABEL[s]}
                    </button>
                  ))}
                </div>
                {docForm.scope === "TEAM" && (
                  <div className="mt-2 text-[11px] text-ink-500">
                    내가 속한 팀으로 자동 지정돼요.
                  </div>
                )}
                {docForm.scope === "CUSTOM" && (
                  <div className="mt-2 border border-ink-200 rounded-lg max-h-[180px] overflow-y-auto p-2 space-y-1">
                    {allUsers.length === 0 ? (
                      <div className="text-[12px] text-ink-500 p-2">사용자를 불러오는 중…</div>
                    ) : (
                      allUsers.map((u) => {
                        const checked = docForm.scopeUserIds.includes(u.id);
                        return (
                          <label key={u.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-ink-50 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => setDocForm((p) => ({
                                ...p,
                                scopeUserIds: checked
                                  ? p.scopeUserIds.filter((x) => x !== u.id)
                                  : [...p.scopeUserIds, u.id],
                              }))}
                            />
                            <div className="w-6 h-6 rounded grid place-items-center text-white text-[10px] font-bold overflow-hidden" style={{ background: u.avatarUrl ? "transparent" : (u.avatarColor ?? "#6B7280") }}>
                              {u.avatarUrl ? (
                                <img src={u.avatarUrl} alt={u.name} className="w-full h-full object-cover" />
                              ) : (
                                u.name[0]
                              )}
                            </div>
                            <div className="text-[12px] flex-1">{u.name}{u.team ? <span className="text-ink-400 ml-1">· {u.team}</span> : null}</div>
                          </label>
                        );
                      })
                    )}
                  </div>
                )}
                </>
                )}
              </div>
              {modalErr && (
                <div className="text-[12px] text-danger bg-rose-50 border border-rose-200 rounded px-3 py-2">
                  {modalErr}
                </div>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" className="btn-ghost" onClick={() => setCreating(null)} disabled={submitting}>취소</button>
                <button className="btn-primary" disabled={submitting || uploading}>{submitting ? "등록 중…" : "등록"}</button>
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
