import { useEditor, EditorContent, Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Highlight from "@tiptap/extension-highlight";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Extension } from "@tiptap/core";
import { useEffect } from "react";
import "./MeetingEditor.css";

/** 노션식 글씨 크기(픽셀) — textStyle 의 `data-font-size` 속성으로 직렬화. */
const FONT_SIZES = [
  { label: "기본", value: "" },
  { label: "작게", value: "12px" },
  { label: "보통", value: "14px" },
  { label: "크게", value: "18px" },
  { label: "제목", value: "24px" },
  { label: "대제목", value: "32px" },
];

const TEXT_COLORS = [
  { label: "기본", value: "" },
  { label: "회색", value: "#6B7280" },
  { label: "빨강", value: "#EF4444" },
  { label: "주황", value: "#F59E0B" },
  { label: "노랑", value: "#EAB308" },
  { label: "초록", value: "#16A34A" },
  { label: "파랑", value: "#2563EB" },
  { label: "보라", value: "#7C3AED" },
  { label: "분홍", value: "#DB2777" },
];

const HIGHLIGHT_COLORS = [
  { label: "형광없음", value: "" },
  { label: "노랑", value: "#FEF08A" },
  { label: "초록", value: "#BBF7D0" },
  { label: "파랑", value: "#BFDBFE" },
  { label: "분홍", value: "#FBCFE8" },
  { label: "회색", value: "#E5E7EB" },
];

/**
 * TextStyle 에 font-size 속성을 얹어주는 커스텀 확장.
 * @tiptap 공식 FontSize 확장은 아직 별도 패키지가 없어서 직접 구현.
 */
const FontSize = Extension.create({
  name: "fontSize",
  addGlobalAttributes() {
    return [
      {
        types: ["textStyle"],
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (el) => (el as HTMLElement).style.fontSize || null,
            renderHTML: (attrs) => {
              if (!attrs.fontSize) return {};
              return { style: `font-size: ${attrs.fontSize}` };
            },
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setFontSize:
        (size: string) =>
        ({ chain }: any) => {
          if (!size) return chain().setMark("textStyle", { fontSize: null }).removeEmptyTextStyle().run();
          return chain().setMark("textStyle", { fontSize: size }).run();
        },
    } as any;
  },
});

type Props = {
  value?: any; // TipTap JSON doc
  onChange?: (json: any) => void;
  editable?: boolean;
  placeholder?: string;
};

export default function MeetingEditor({ value, onChange, editable = true, placeholder }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      TextStyle,
      FontSize,
      Color,
      Underline,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Link.configure({ openOnClick: false, HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" } }),
      Placeholder.configure({ placeholder: placeholder ?? "여기에 회의록을 작성하세요..." }),
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content: value ?? "",
    editable,
    onUpdate: ({ editor }) => {
      onChange?.(editor.getJSON());
    },
  });

  // 외부에서 value 가 바뀌면 에디터 갱신 (다른 회의록으로 네비 시)
  useEffect(() => {
    if (!editor) return;
    const current = JSON.stringify(editor.getJSON());
    const incoming = JSON.stringify(value ?? "");
    if (current !== incoming) {
      editor.commands.setContent(value ?? "", { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editable, editor]);

  if (!editor) return null;

  return (
    <div className={`meeting-editor ${editable ? "" : "is-readonly"}`}>
      {editable && <Toolbar editor={editor} />}
      <EditorContent editor={editor} className="meeting-editor-content" />
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  return (
    <div className="meeting-toolbar">
      {/* 글씨 크기 */}
      <select
        className="meeting-toolbar-select"
        value={editor.getAttributes("textStyle").fontSize ?? ""}
        onChange={(e) => (editor.chain().focus() as any).setFontSize(e.target.value).run()}
        title="글씨 크기"
      >
        {FONT_SIZES.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>

      {/* 제목 레벨 */}
      <select
        className="meeting-toolbar-select"
        value={
          editor.isActive("heading", { level: 1 })
            ? "h1"
            : editor.isActive("heading", { level: 2 })
              ? "h2"
              : editor.isActive("heading", { level: 3 })
                ? "h3"
                : "p"
        }
        onChange={(e) => {
          const v = e.target.value;
          if (v === "p") editor.chain().focus().setParagraph().run();
          else editor.chain().focus().toggleHeading({ level: (parseInt(v.slice(1)) as 1 | 2 | 3) }).run();
        }}
        title="단락/제목"
      >
        <option value="p">본문</option>
        <option value="h1">제목 1</option>
        <option value="h2">제목 2</option>
        <option value="h3">제목 3</option>
      </select>

      <Divider />

      <ToolBtn active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} title="굵게 (⌘B)">
        <b>B</b>
      </ToolBtn>
      <ToolBtn active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} title="기울임 (⌘I)">
        <i>I</i>
      </ToolBtn>
      <ToolBtn active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()} title="밑줄 (⌘U)">
        <u>U</u>
      </ToolBtn>
      <ToolBtn active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()} title="취소선">
        <s>S</s>
      </ToolBtn>
      <ToolBtn active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()} title="인라인 코드">
        {"<>"}
      </ToolBtn>

      <Divider />

      {/* 글씨 색 */}
      <ColorPicker
        label="글씨색"
        colors={TEXT_COLORS}
        current={editor.getAttributes("textStyle").color ?? ""}
        onPick={(v) => {
          if (!v) editor.chain().focus().unsetColor().run();
          else editor.chain().focus().setColor(v).run();
        }}
        swatchSymbol="A"
      />

      {/* 형광펜 */}
      <ColorPicker
        label="형광펜"
        colors={HIGHLIGHT_COLORS}
        current={editor.getAttributes("highlight").color ?? ""}
        onPick={(v) => {
          if (!v) editor.chain().focus().unsetHighlight().run();
          else editor.chain().focus().toggleHighlight({ color: v }).run();
        }}
        swatchSymbol="🖍"
      />

      <Divider />

      <ToolBtn active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} title="글머리 기호">
        •
      </ToolBtn>
      <ToolBtn active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="번호 매기기">
        1.
      </ToolBtn>
      <ToolBtn active={editor.isActive("taskList")} onClick={() => editor.chain().focus().toggleTaskList().run()} title="체크박스">
        ☐
      </ToolBtn>
      <ToolBtn active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="인용">
        ❝
      </ToolBtn>
      <ToolBtn active={editor.isActive("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()} title="코드 블록">
        {"{}"}
      </ToolBtn>

      <Divider />

      {/* 정렬 */}
      <ToolBtn active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()} title="좌측 정렬">
        <AlignIcon d="M4 6h16M4 10h10M4 14h16M4 18h10" />
      </ToolBtn>
      <ToolBtn active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()} title="가운데 정렬">
        <AlignIcon d="M4 6h16M7 10h10M4 14h16M7 18h10" />
      </ToolBtn>
      <ToolBtn active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()} title="우측 정렬">
        <AlignIcon d="M4 6h16M10 10h10M4 14h16M10 18h10" />
      </ToolBtn>

      <Divider />

      <ToolBtn
        active={editor.isActive("link")}
        onClick={() => {
          const prev = editor.getAttributes("link").href ?? "";
          const url = prompt("링크 URL", prev);
          if (url === null) return;
          if (url === "") editor.chain().focus().unsetLink().run();
          else editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
        }}
        title="링크"
      >
        🔗
      </ToolBtn>

      <ToolBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="구분선">
        ―
      </ToolBtn>

      <Divider />

      <ToolBtn onClick={() => editor.chain().focus().undo().run()} title="되돌리기">
        ↶
      </ToolBtn>
      <ToolBtn onClick={() => editor.chain().focus().redo().run()} title="다시 실행">
        ↷
      </ToolBtn>
    </div>
  );
}

function ToolBtn({
  children,
  onClick,
  active,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`meeting-toolbar-btn ${active ? "is-active" : ""}`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="meeting-toolbar-divider" />;
}

function AlignIcon({ d }: { d: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d={d} />
    </svg>
  );
}

function ColorPicker({
  label,
  colors,
  current,
  onPick,
  swatchSymbol,
}: {
  label: string;
  colors: { label: string; value: string }[];
  current: string;
  onPick: (v: string) => void;
  swatchSymbol: string;
}) {
  return (
    <div className="meeting-toolbar-dropdown" tabIndex={0}>
      <button type="button" className="meeting-toolbar-btn" title={label}>
        <span style={{ color: current || undefined }}>{swatchSymbol}</span>
        <span className="meeting-toolbar-caret">▾</span>
      </button>
      <div className="meeting-toolbar-menu">
        {colors.map((c) => (
          <button
            key={c.label}
            type="button"
            className={`meeting-toolbar-menu-item ${current === c.value ? "is-active" : ""}`}
            onClick={() => onPick(c.value)}
          >
            <span
              className="meeting-toolbar-swatch"
              style={{ background: c.value || "transparent", border: c.value ? "none" : "1px dashed #CBD5E1" }}
            />
            {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}
