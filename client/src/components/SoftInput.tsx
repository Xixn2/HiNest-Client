import { useState } from "react";

/**
 * Toss 톤의 입력 컴포넌트 — 로그인 / 가입 / 비밀번호 재설정 등에서 재사용.
 *  - 보더 없음, 옅은 회색 fill (\`--c-surface-3\`).
 *  - 포커스 시 브랜드 컬러 링.
 *  - 16px 폰트 → iOS Safari 자동 줌 방지.
 */
export default function SoftInput({
  type = "text",
  placeholder,
  value,
  onChange,
  autoComplete,
  required,
  maxLength,
  minLength,
  mono,
}: {
  type?: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  required?: boolean;
  maxLength?: number;
  minLength?: number;
  /** 초대키처럼 고정폭 필요한 입력 */
  mono?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div
      style={{
        background: "var(--c-surface-3)",
        borderRadius: 14,
        boxShadow: focused
          ? "0 0 0 2px color-mix(in srgb, var(--c-brand) 32%, transparent)"
          : "0 0 0 1px transparent",
        transition: "box-shadow 0.15s",
      }}
    >
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoComplete={autoComplete}
        required={required}
        maxLength={maxLength}
        minLength={minLength}
        style={{
          width: "100%",
          height: 54,
          padding: "0 18px",
          background: "transparent",
          border: 0,
          outline: "none",
          fontSize: 16,
          fontWeight: 600,
          color: "var(--c-text-1)",
          letterSpacing: mono ? "0.05em" : "-0.01em",
          fontFamily: mono ? "ui-monospace, SFMono-Regular, Menlo, monospace" : undefined,
          borderRadius: 14,
        }}
      />
    </div>
  );
}
