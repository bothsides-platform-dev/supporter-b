'use client';

import { useEffect, useState, type RefObject } from 'react';
import { motion } from 'motion/react';
import { MousePointerClick, ChevronDown, ChevronUp } from 'lucide-react';

type CursorState = {
  x: number;
  y: number;
  /** 대상이 데모 윈도 밖(스크롤 필요)일 때의 방향. 화면 안이면 null. */
  off: 'up' | 'down' | null;
  /** 힌트 라벨을 커서의 어느 쪽에 붙일지(우측 가장자리 근처면 왼쪽). */
  side: 'left' | 'right';
  /** 데모 창 실제 크기 — 스크롤 안내 pill을 래퍼가 아니라 데모 창 우하단 안쪽에 앵커한다. */
  winW: number;
  winH: number;
};

// 스크롤 가이드 커서 — 현재 단계에서 '무엇을 클릭하면 되는지'를 데모 윈도 안 대상 요소 위에
// 커서 아이콘으로 표시하고, 옆에 그 단계 안내 메시지를 힌트처럼 붙인다. 대상이 스크롤로 화면
// 밖에 있으면 커서 대신 우하단에 방향 화살표 + 메시지를 띄워 그쪽으로 스크롤하도록 유도한다.
// 대상은 매 프레임 다시 재서 따라간다(위저드처럼 한 화면 안에서 버튼이 움직여도 붙게).
// pointer-events-none이라 실제 클릭을 막지 않는다.
export function DemoCursor({
  windowRef,
  selector,
  page,
  hint,
}: {
  windowRef: RefObject<HTMLDivElement | null>;
  selector: string | null;
  page: number;
  hint?: string;
}) {
  const [state, setState] = useState<CursorState | null>(null);

  useEffect(() => {
    let raf = 0;
    const measure = () => {
      const w = windowRef.current;
      if (w) {
        const wr = w.getBoundingClientRect();
        const el = selector ? (w.querySelector(selector) as HTMLElement | null) : null;
        let next: CursorState | null = null;
        if (el) {
          const er = el.getBoundingClientRect();
          const x = er.left - wr.left + er.width / 2;
          const y = er.top - wr.top + er.height / 2;
          const off = y < 12 ? 'up' : y > wr.height - 12 ? 'down' : null;
          const side = x > wr.width * 0.62 ? 'left' : 'right';
          next = { x, y, off, side, winW: wr.width, winH: wr.height };
        } else if (!selector) {
          // 클릭 대상이 없는 단계 — 우하단(주요 액션 자리)에 머문다.
          next = {
            x: wr.width * 0.74,
            y: wr.height * 0.84,
            off: null,
            side: 'left',
            winW: wr.width,
            winH: wr.height,
          };
        }
        // selector가 있는데 아직 못 찾음(전환 중)이면 next=null → 이전 상태 유지.
        if (next) {
          const n = next;
          setState((p) =>
            p &&
            Math.abs(p.x - n.x) < 0.5 &&
            Math.abs(p.y - n.y) < 0.5 &&
            p.off === n.off &&
            p.side === n.side &&
            Math.abs(p.winW - n.winW) < 0.5
              ? p
              : n,
          );
        }
      }
      raf = requestAnimationFrame(measure);
    };
    raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
  }, [windowRef, selector, page]);

  if (!state) return null;

  // 대상이 스크롤로 화면 밖 — 우하단에 스크롤 유도(방향 화살표 + 안내 메시지).
  if (state.off) {
    const down = state.off === 'down';
    return (
      <motion.div
        aria-hidden
        // 래퍼가 아니라 실제 데모 창 기준으로 우하단 안쪽(16px)에 앵커한다.
        // w-max로 폭을 콘텐츠에 고정(글자 줄바꿈 없음), translate은 motion x/y(퍼센트)로.
        className="pointer-events-none absolute z-40 flex w-max items-center gap-2 whitespace-nowrap rounded-full border border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-surface-container-high)] py-1.5 pl-3 pr-1.5 shadow-lg"
        style={{ left: state.winW - 16, top: state.winH - 16 }}
        initial={{ opacity: 0, x: '-100%', y: '-100%' }}
        animate={{ opacity: 1, x: '-100%', y: '-100%' }}
      >
        {hint && (
          <span className="text-[12px] font-medium text-[var(--md-sys-color-on-surface)]">
            {hint}
          </span>
        )}
        <motion.span
          className="grid size-6 shrink-0 place-items-center rounded-full bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)]"
          animate={{ y: down ? [0, 3, 0] : [0, -3, 0] }}
          transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
        >
          {down ? (
            <ChevronDown className="size-4" strokeWidth={2.5} />
          ) : (
            <ChevronUp className="size-4" strokeWidth={2.5} />
          )}
        </motion.span>
      </motion.div>
    );
  }

  // 대상이 화면 안 — 커서 + 옆 힌트 라벨.
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute left-0 top-0 z-30"
      initial={false}
      animate={{ x: state.x, y: state.y }}
      transition={{ type: 'spring', stiffness: 240, damping: 24 }}
    >
      {/* 대상 위에 얹힌 뒤에도 멈추지 않고 미세하게 떠다닌다. */}
      <motion.span
        className="block"
        animate={{ x: [0, 6, -4, 2, 0], y: [0, -5, 3, -2, 0] }}
        transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
      >
        <span className="block -translate-x-1/2 -translate-y-1/2">
          {/* 배경 원·물결 없이 아이콘만 — 아주 조금 커졌다 작아지며 시선을 끈다. */}
          <motion.span
            className="block"
            animate={{ scale: [1, 1.12, 1] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          >
            <MousePointerClick
              className="size-5 text-[var(--md-sys-color-primary)] drop-shadow"
              strokeWidth={2.25}
            />
          </motion.span>
        </span>
      </motion.span>

      {/* 단계 안내 메시지 — 커서 옆 힌트(우측 가장자리 근처면 왼쪽으로 뒤집는다). */}
      {hint && (
        <span
          className="pointer-events-none absolute whitespace-nowrap rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-surface-container-high)] px-2 py-1 text-[11px] font-medium text-[var(--md-sys-color-on-surface)] shadow-md"
          style={
            state.side === 'left'
              ? { left: -14, top: 0, transform: 'translate(-100%, -50%)' }
              : { left: 14, top: 0, transform: 'translateY(-50%)' }
          }
        >
          {hint}
        </span>
      )}
    </motion.div>
  );
}
