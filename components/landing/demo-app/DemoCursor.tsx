'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { motion, useInView } from 'motion/react';
import { MousePointerClick, ChevronDown, ChevronUp } from 'lucide-react';

type CursorState = {
  x: number;
  y: number;
  /** 대상이 데모 윈도 밖(스크롤 필요)일 때의 방향. 화면 안이면 null. */
  off: 'up' | 'down' | null;
  /** 힌트 라벨을 커서의 어느 쪽에 붙일지(우측 가장자리 근처면 왼쪽). */
  side: 'left' | 'right';
  /** 데모 창 시각적 박스(커서 원점=컨테이너 래퍼 기준) — 스크롤 안내 pill·spring 진입
   * 원점을 데모 창 우하단에 앵커한다. winLeft/winTop은 컨테이너 대비 창의 시각적 좌상단
   * (scale center-origin이면 음수). winW/winH는 창의 시각적 크기. */
  winLeft: number;
  winTop: number;
  winW: number;
  winH: number;
  /** 커서 아래 실제 배경 밝기 기준 아이콘 색. true=밝은 배경(검정 아이콘), false=어두운 배경(흰 아이콘). */
  iconDark: boolean;
};

/** rgb()/rgba() 문자열을 파싱한다. 파싱 실패·투명은 null. */
function parseRgb(color: string): { r: number; g: number; b: number; a: number } | null {
  const m = color.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
  if (!m) return null;
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: m[4] === undefined ? 1 : Number(m[4]) };
}

/** 뷰포트 좌표 아래에서 처음 만나는 불투명 배경색을 찾아 상대 휘도(0~255)를 반환한다.
 * 못 찾으면 흰 배경으로 간주(255) — 데모 앱은 라이트 톤이 기본이라 안전한 폴백. */
function sampleBackgroundLuminance(vpX: number, vpY: number): number {
  let el = document.elementFromPoint(vpX, vpY) as HTMLElement | null;
  while (el) {
    const parsed = parseRgb(getComputedStyle(el).backgroundColor);
    if (parsed && parsed.a > 0.5) {
      return 0.2126 * parsed.r + 0.7152 * parsed.g + 0.0722 * parsed.b;
    }
    el = el.parentElement;
  }
  return 255;
}

// 스크롤 가이드 커서 — 현재 단계에서 '무엇을 클릭하면 되는지'를 데모 윈도 안 대상 요소 위에
// 커서 아이콘으로 표시하고, 옆에 그 단계 안내 메시지를 힌트처럼 붙인다. 대상이 스크롤로 화면
// 밖에 있으면 커서 대신 우하단에 방향 화살표 + 메시지를 띄워 그쪽으로 스크롤하도록 유도한다.
// 대상은 매 프레임 다시 재서 따라간다(위저드처럼 한 화면 안에서 버튼이 움직여도 붙게).
// pointer-events-none이라 실제 클릭을 막지 않는다.
export function DemoCursor({
  windowRef,
  containerRef,
  selector,
  page,
  hint,
}: {
  windowRef: RefObject<HTMLDivElement | null>;
  /** 커서의 offset parent(= scale 없는 .relative 래퍼). 커서 좌표를 이 래퍼 기준으로
   * 계산해야 데모 창의 scale(진입 줌)·transform-origin과 무관하게 대상에 정확히 얹힌다.
   * (창의 시각적 rect 기준으로 계산하면 center-origin scale 만큼 어긋난다.) */
  containerRef: RefObject<HTMLDivElement | null>;
  selector: string | null;
  page: number;
  hint?: string;
}) {
  const [state, setState] = useState<CursorState | null>(null);
  // 데모 앱은 라이트 톤이 기본이라 검정 아이콘으로 시작 — 히스테리시스 기준값(직전 상태 유지).
  const iconDarkRef = useRef(true);
  // 데모 창이 뷰포트에서 완전히 벗어나면 rAF 측정 루프를 멈춘다(P3: 스크롤 아웃 후에도 영구
  // 루프가 돌던 문제). once 없이 써서 양방향(들어옴/나감) 모두 토글 — amount:0은 1px이라도
  // 걸치면 true라 경계에서 자주 튀지 않는다(작은 값으로 edge flicker 방지).
  const visible = useInView(windowRef, { amount: 0 });

  useEffect(() => {
    if (!visible) return;
    let raf = 0;
    const measure = () => {
      const w = windowRef.current;
      const c = containerRef.current;
      if (w && c) {
        const wr = w.getBoundingClientRect();
        const cr = c.getBoundingClientRect();
        // 창의 시각적 박스를 커서 원점(컨테이너 래퍼) 기준 좌표로 환산.
        const winLeft = wr.left - cr.left;
        const winTop = wr.top - cr.top;
        const el = selector ? (w.querySelector(selector) as HTMLElement | null) : null;
        let next: CursorState | null = null;
        if (el) {
          const er = el.getBoundingClientRect();
          // 대상 중심을 커서 원점(컨테이너) 기준으로 — scale 유무와 무관하게 정확.
          const x = er.left - cr.left + er.width / 2;
          const y = er.top - cr.top + er.height / 2;
          const cy = er.top + er.height / 2; // 뷰포트 기준 중심 y(창 시각 경계와 대조)
          const off = cy < wr.top + 12 ? 'up' : cy > wr.bottom - 12 ? 'down' : null;
          const side = x - winLeft > wr.width * 0.62 ? 'left' : 'right';
          // 커서 원점(컨테이너)엔 scale이 없으므로 x/y를 그대로 더하면 실제 뷰포트 좌표.
          const luminance = sampleBackgroundLuminance(cr.left + x, cr.top + y);
          // 히스테리시스: 중간 밝기(100~170)에서는 직전 색을 유지해 경계에서 깜빡이지 않는다.
          const iconDark = iconDarkRef.current ? luminance >= 100 : luminance > 170;
          iconDarkRef.current = iconDark;
          next = { x, y, off, side, winLeft, winTop, winW: wr.width, winH: wr.height, iconDark };
        } else if (!selector) {
          // 클릭 대상이 없는 단계 — 창 시각 박스 우하단(주요 액션 자리)에 머문다.
          next = {
            x: winLeft + wr.width * 0.74,
            y: winTop + wr.height * 0.84,
            off: null,
            side: 'left',
            winLeft,
            winTop,
            winW: wr.width,
            winH: wr.height,
            iconDark: iconDarkRef.current,
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
            p.iconDark === n.iconDark &&
            Math.abs(p.winLeft - n.winLeft) < 0.5 &&
            Math.abs(p.winTop - n.winTop) < 0.5 &&
            Math.abs(p.winW - n.winW) < 0.5 &&
            Math.abs(p.winH - n.winH) < 0.5
              ? p
              : n,
          );
        }
      }
      raf = requestAnimationFrame(measure);
    };
    raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
  }, [windowRef, containerRef, selector, page, visible]);

  if (!state) return null;

  // 대상이 스크롤로 화면 밖 — 우하단에 스크롤 유도(방향 화살표 + 안내 메시지).
  if (state.off) {
    const down = state.off === 'down';
    return (
      <motion.div
        // 스크롤 안내 pill과 커서는 서로 다른 key라 off↔on 전환 시 React가 확실히
        // 언마운트/재마운트한다 → 커서가 다시 생길 때마다 아래 initial 진입이 재실행된다.
        key="scroll-guide"
        aria-hidden
        // 래퍼가 아니라 실제 데모 창 기준으로 우하단 안쪽(16px)에 앵커한다.
        // w-max로 폭을 콘텐츠에 고정(글자 줄바꿈 없음), translate은 motion x/y(퍼센트)로.
        className="pointer-events-none absolute z-40 flex w-max items-center gap-2 whitespace-nowrap rounded-full border border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-surface-container-high)] py-1.5 pl-3 pr-1.5 shadow-lg"
        style={{ left: state.winLeft + state.winW - 16, top: state.winTop + state.winH - 16 }}
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
  // 커서가 생길 때(첫 등장 + pill에서 되돌아올 때)는 데모 창 우하단(winW,winH)에서 대상으로
  // 스르륵 들어온다. key="cursor"로 pill과 분리해 재마운트되므로 매 등장마다 initial이 재실행되고,
  // 같은 화면 안 단계 전환은 (key 동일하므로) 재진입 없이 spring 추적만 한다.
  return (
    <motion.div
      key="cursor"
      aria-hidden
      className="pointer-events-none absolute left-0 top-0 z-30"
      initial={{ x: state.winLeft + state.winW, y: state.winTop + state.winH, opacity: 0 }}
      animate={{ x: state.x, y: state.y, opacity: 1 }}
      transition={{
        type: 'spring',
        stiffness: 240,
        damping: 24,
        opacity: { duration: 0.35, ease: 'easeOut' },
      }}
    >
      {/* 대상 위에 얹힌 뒤에도 멈추지 않고 점멸(깜빡임)해 시선을 끈다 — 흔들림(위치 이동) 없음. */}
      <motion.span
        className="block"
        animate={{ opacity: [1, 0.25, 1] }}
        transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
      >
        <span className="block -translate-x-1/2 -translate-y-1/2">
          {/* 커서 아래 실제 배경 휘도(iconDark)로 흑/백을 고르고, 반대색 halo를 둘러 중간톤
              배경(파란 버튼·칩 등)에서도 확실히 도드라지게 한다 — mix-blend-difference는
              중간 밝기 배경에서 결과색도 중간톤이 돼 거의 안 보이는 문제가 있었다. */}
          <MousePointerClick
            className={state.iconDark ? 'size-5 text-black' : 'size-5 text-white'}
            strokeWidth={2.25}
            style={{
              filter: state.iconDark
                ? 'drop-shadow(0 0 1.5px white) drop-shadow(0 0 1.5px white)'
                : 'drop-shadow(0 0 1.5px black) drop-shadow(0 0 1.5px black)',
            }}
          />
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
