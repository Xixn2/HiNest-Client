import { useEffect } from "react";

/**
 * 모달/오버레이 열려 있는 동안 Esc 로 닫기 + 배경 스크롤 잠금.
 * 여러 모달이 동시에 열려도 마지막에 등록된 것만 반응하도록 capture 단계에서 한 번만 처리.
 *
 * 사용:
 *   useModalDismiss(open, () => setOpen(false));
 *
 * @param open 모달이 열려있으면 true
 * @param onDismiss Esc 눌렸을 때 호출될 콜백. 저장중 등으로 막아야 하면 함수 안에서 return.
 * @param opts.lockScroll 기본 true — <body> overflow: hidden 을 켜서 배경 스크롤 방지.
 */
export function useModalDismiss(
  open: boolean,
  onDismiss: () => void,
  opts: { lockScroll?: boolean } = {},
) {
  const lockScroll = opts.lockScroll !== false;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // 컴포지션 중(한글 입력 변환) 에는 Esc 가 변환 취소 용도라 여기서 가로채지 않음.
      if ((e as any).isComposing) return;
      e.stopPropagation();
      onDismiss();
    };
    // capture 로 등록해서 전역 리스너(⌘K 검색 등) 보다 먼저 잡음.
    window.addEventListener("keydown", onKey, true);

    let prevOverflow = "";
    if (lockScroll) {
      prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }

    return () => {
      window.removeEventListener("keydown", onKey, true);
      if (lockScroll) document.body.style.overflow = prevOverflow;
    };
  }, [open, onDismiss, lockScroll]);
}
