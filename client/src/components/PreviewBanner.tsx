import { Link } from "react-router-dom";
import { isPreviewMode, disablePreview } from "../lib/previewMock";

/** 미리보기 모드 알림 배너 — 화면 최상단 고정. 클릭하면 가입 페이지로. */
export default function PreviewBanner() {
  if (!isPreviewMode()) return null;
  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 9999,
        background: "linear-gradient(90deg, var(--c-brand) 0%, #7C3AED 100%)",
        color: "#fff",
        padding: "8px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        fontSize: 12.5,
        fontWeight: 700,
        flexWrap: "wrap",
      }}
    >
      <span style={{ opacity: 0.9 }}>👀 미리보기 모드 — 데이터는 모두 데모입니다 · 변경 사항은 저장되지 않아요</span>
      <Link
        to="/login"
        onClick={() => {
          disablePreview();
        }}
        style={{
          background: "rgba(255,255,255,0.2)",
          color: "#fff",
          padding: "3px 10px",
          borderRadius: 8,
          fontSize: 11.5,
          fontWeight: 800,
          border: "1px solid rgba(255,255,255,0.32)",
        }}
      >
        실제 계정으로 로그인 →
      </Link>
    </div>
  );
}
