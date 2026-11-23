'use client';

import { useEffect, useRef } from 'react';

// 랜딩 스크롤 레일 — Railway 식 세로 진행선(2026-11-24 사용자 지정: Neon·Railway 참고, 스크롤 반응).
// 히어로 아래 첫 섹션부터 페이지 끝 섹션까지 왼쪽 여백에 1px 선을 긋고, 화면 가운데까지 읽은
// 만큼 primary 로 차오른다. 섹션(`data-rail-node`)마다 노드를 두고 채움이 지나면 켠다.
// 섹션을 감싸지 않고 main 안의 절대 레이어로만 그린다 — 섹션 id·앵커·현재 위치 감지에 손대지 않는다.
// 노드는 섹션 위 여백(--s-11, 120px) 바로 아래, 제목 높이에 맞춘다. 고정(sticky) 제목은 스크롤에
// 따라 위치가 바뀌므로 제목을 재지 않고 섹션 위끝 기준으로 놓는다.
// 콘텐츠 열(1080px) 왼쪽 여백에 들어갈 자리가 있는 1280px 이상에서만 보인다.

const NODE_OFFSET_PX = 132;
/** 채움 기준선 — 화면 높이의 이 비율 지점까지 읽었다고 본다. */
const READ_LINE = 0.5;

type Node = { top: number; el: HTMLSpanElement };

export function LandingScrollRail() {
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const nodesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const host = root?.parentElement;
    const track = trackRef.current;
    const fill = fillRef.current;
    const tip = tipRef.current;
    const nodeLayer = nodesRef.current;
    if (!root || !host || !track || !fill || !tip || !nodeLayer) return;

    let disposed = false;
    let start = 0;
    let length = 0;
    let nodes: Node[] = [];
    let raf = 0;

    const measure = () => {
      const sections = Array.from(host.querySelectorAll<HTMLElement>('[data-rail-node]'));
      nodeLayer.replaceChildren();
      nodes = [];
      if (sections.length === 0) {
        length = 0;
        track.style.height = '0px';
        return;
      }
      const hostTop = host.getBoundingClientRect().top;
      const tops = sections.map((s) => s.getBoundingClientRect().top - hostTop);
      const last = sections[sections.length - 1];
      const end = last.getBoundingClientRect().bottom - hostTop;
      start = tops[0] + NODE_OFFSET_PX;
      length = Math.max(0, end - start);
      track.style.transform = `translateY(${start}px)`;
      track.style.height = `${length}px`;
      for (const top of tops) {
        const el = document.createElement('span');
        el.dataset.railDot = '';
        // transform 이 아니라 top 으로 놓는다 — 활성 노드의 scale 이 translate 와 합성돼 점이 밀리지 않게.
        el.style.top = `${top + NODE_OFFSET_PX - 4}px`;
        nodeLayer.append(el);
        nodes.push({ top: top + NODE_OFFSET_PX, el });
      }
    };

    const update = () => {
      raf = 0;
      if (disposed || length === 0) return;
      const hostTop = host.getBoundingClientRect().top;
      const readY = window.innerHeight * READ_LINE - hostTop;
      const filled = Math.min(length, Math.max(0, readY - start));
      fill.style.transform = `scaleY(${length ? filled / length : 0})`;
      tip.style.transform = `translateY(${start + filled}px)`;
      tip.dataset.visible = filled > 0 && filled < length ? 'true' : 'false';
      for (const n of nodes) {
        const on = readY >= n.top;
        if ((n.el.dataset.active === 'true') !== on) n.el.dataset.active = on ? 'true' : 'false';
      }
    };

    // 1280px 미만에서는 레일이 display:none 이다 — 재지도 그리지도 않는다.
    const hidden = () => root.getClientRects().length === 0;

    const schedule = () => {
      if (!raf && !hidden()) raf = requestAnimationFrame(update);
    };

    const remeasure = () => {
      if (hidden()) return;
      measure();
      schedule();
    };

    remeasure();
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver === 'function') {
      ro = new ResizeObserver(remeasure);
      ro.observe(host);
    }
    window.addEventListener('resize', remeasure);
    window.addEventListener('scroll', schedule, { passive: true });
    // 웹폰트·지연 이미지로 섹션 높이가 늦게 바뀌는 경우를 한 번 더 잡는다.
    document.fonts?.ready?.then(() => { if (!disposed) remeasure(); }).catch(() => {});

    return () => {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener('resize', remeasure);
      window.removeEventListener('scroll', schedule);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      aria-hidden
      data-landing-scroll-rail
      className={[
        'pointer-events-none absolute inset-y-0 z-[2] hidden w-px min-[1280px]:block',
        'left-[calc(max(32px,(100%_-_1080px)/2)_-_48px)]',
        // 휴지 선 농도 — 다크 띠(surface-container-high) 위에서도 보이도록 다크는 한 단계 진하게.
        '[--rail-line:color-mix(in_srgb,var(--md-sys-color-on-surface)_16%,transparent)]',
        'dark:[--rail-line:color-mix(in_srgb,var(--md-sys-color-on-surface)_26%,transparent)]',
        '[--rail-dot:color-mix(in_srgb,var(--md-sys-color-on-surface)_32%,var(--md-sys-color-surface))]',
        'dark:[--rail-dot:color-mix(in_srgb,var(--md-sys-color-on-surface)_42%,var(--md-sys-color-surface))]',
      ].join(' ')}
    >
      <div ref={trackRef} className="absolute left-0 top-0 w-px bg-[var(--rail-line)]">
        {/* 채움 배율은 인라인 transform 으로만 준다 — Tailwind v4 의 scale-* 는 별도 `scale` 속성이라
            transform 과 곱해진다. */}
        <div ref={fillRef} style={{ transform: 'scaleY(0)' }} className="h-full w-px origin-top bg-[var(--md-sys-color-primary)]" />
      </div>
      <span
        ref={tipRef}
        data-visible="false"
        className="absolute left-[-3px] top-[-3px] size-[7px] bg-[var(--md-sys-color-primary)] opacity-0 transition-opacity duration-150 data-[visible=true]:opacity-100"
      />
      <div
        ref={nodesRef}
        className={[
          'absolute left-0 top-0',
          '[&>[data-rail-dot]]:absolute [&>[data-rail-dot]]:left-[-4px]',
          // 노드는 불투명 점이다 — 띠·surface 어느 면 위에서도 같은 모양이고 선이 비쳐 보이지 않는다.
          '[&>[data-rail-dot]]:size-[9px] [&>[data-rail-dot]]:rounded-full',
          '[&>[data-rail-dot]]:bg-[var(--rail-dot)]',
          '[&>[data-rail-dot]]:transition-[background-color,scale] [&>[data-rail-dot]]:duration-200',
          '[&>[data-rail-dot][data-active=true]]:bg-[var(--md-sys-color-primary)]',
          '[&>[data-rail-dot][data-active=true]]:scale-125',
        ].join(' ')}
      />
    </div>
  );
}
