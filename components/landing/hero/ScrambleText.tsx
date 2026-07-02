'use client';

import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from '@/lib/landing/prefers-reduced-motion';
import {
  buildTransition,
  randomGlyph,
  slotState,
  type SlotSchedule,
  type SlotVisual,
} from '@/lib/landing/scramble';

interface ScrambleTextProps {
  /** 순환해서 보여줄 문구 목록. 첫 문구가 초기(정착) 렌더 — SSR과 동일해 하이드레이션 안전. */
  phrases: string[];
  className?: string;
  /** 한 문구를 정착 상태로 보여주는 시간(ms). */
  holdMs?: number;
  /** 스크램블(흩어짐→재조립) 전환에 걸리는 시간(ms). */
  scrambleMs?: number;
}

const GLYPH_REFRESH_MS = 60;
const JITTER_PX = 3;
// rAF는 탭이 hidden이 되면 즉시 서스펜드된다(브라우저별로 드물게 저throttle로 계속 불릴 수도
// 있어 dt를 방어적으로 클램프) — 복귀 시 큰 dt로 전환이 한 번에 스킵되지 않게 한다.
const DT_CLAMP_MS = 100;

type RenderState =
  | { kind: 'settled'; text: string }
  | { kind: 'scrambling'; slots: (SlotVisual & { dx: number; dy: number })[] };

// 슬롯 인덱스로 위상을 갈라 전 글자가 같은 박자로 흔들리지 않게 한다. 이 지터는 순수 표시용
// 랜덤/시간 함수라 결정성 요구가 없다(마운트 후 rAF 안에서만 계산 — 하이드레이션과 무관).
function jitterX(slotIndex: number, tMs: number): number {
  return Math.sin(tMs / 45 + slotIndex * 1.7) * JITTER_PX;
}

function jitterY(slotIndex: number, tMs: number): number {
  return Math.sin(tMs / 70 + slotIndex * 2.3) * (JITTER_PX * 0.4);
}

/**
 * 순환 문구를 홀드 → (작은 ASCII 글리프로 흩어짐) → 다음 문구로 재조립 순서로 보여준다.
 * **정착 상태는 항상 단일 텍스트 노드로 렌더**한다(Testing Library getByText·SEO 안전) —
 * 글자별 span은 전환(스크램블) 진행 중에만 만들고 정착하면 다시 접는다. 초기 렌더는
 * `phrases[0]` 정착 상태이므로 서버=클라 동일(하이드레이션 안전) — 무작위성은 마운트 후
 * rAF 안에서만 쓴다.
 */
export function ScrambleText({
  phrases,
  className,
  holdMs = 2000,
  scrambleMs = 800,
}: ScrambleTextProps) {
  const [state, setState] = useState<RenderState>({ kind: 'settled', text: phrases[0] ?? '' });
  const glyphCacheRef = useRef<string[]>([]);

  useEffect(() => {
    if (phrases.length === 0) return;
    const reduced = prefersReducedMotion();

    let disposed = false;
    let running = false;
    let rafId = 0;
    let lastTime = 0;
    let phaseElapsed = 0;
    let phase: 'hold' | 'scramble' = 'hold';
    let index = 0;
    let schedules: SlotSchedule[] = [];
    let lastGlyphRefresh = 0;

    const enterHold = () => {
      phase = 'hold';
      phaseElapsed = 0;
    };

    const enterScramble = () => {
      const nextIndex = (index + 1) % phrases.length;
      schedules = buildTransition(phrases[index], phrases[nextIndex]);
      glyphCacheRef.current = schedules.map(() => randomGlyph());
      lastGlyphRefresh = 0;
      index = nextIndex;
      phase = 'scramble';
      phaseElapsed = 0;
    };

    const frame = (now: number) => {
      if (disposed) return;
      rafId = requestAnimationFrame(frame);
      const dt = lastTime === 0 ? 0 : Math.min(now - lastTime, DT_CLAMP_MS);
      lastTime = now;
      phaseElapsed += dt;

      if (phase === 'hold') {
        if (phaseElapsed < holdMs) return;
        if (reduced) {
          index = (index + 1) % phrases.length;
          setState({ kind: 'settled', text: phrases[index] });
          enterHold();
        } else {
          enterScramble();
        }
        return;
      }

      // phase === 'scramble'
      const progress = phaseElapsed / scrambleMs;
      if (progress >= 1) {
        setState({ kind: 'settled', text: phrases[index] });
        enterHold();
        return;
      }

      lastGlyphRefresh += dt;
      if (lastGlyphRefresh >= GLYPH_REFRESH_MS) {
        lastGlyphRefresh = 0;
        glyphCacheRef.current = glyphCacheRef.current.map((g, i) =>
          slotState(schedules[i], progress, g).active ? randomGlyph() : g,
        );
      }

      const slots = schedules.map((sch, i) => {
        const visual = slotState(sch, progress, glyphCacheRef.current[i]);
        return {
          ...visual,
          dx: visual.active ? jitterX(i, now) : 0,
          dy: visual.active ? jitterY(i, now) : 0,
        };
      });
      setState({ kind: 'scrambling', slots });
    };

    const start = () => {
      if (disposed || running || document.hidden) return;
      running = true;
      lastTime = 0;
      rafId = requestAnimationFrame(frame);
    };

    const stop = () => {
      if (!running) return;
      running = false;
      cancelAnimationFrame(rafId);
    };

    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };

    enterHold();
    start();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      disposed = true;
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [phrases, holdMs, scrambleMs]);

  if (state.kind === 'settled') {
    return <span className={className}>{state.text}</span>;
  }

  return (
    <span className={className}>
      {state.slots.map((slot, i) => (
        <span
          key={i}
          aria-hidden={slot.active || undefined}
          style={{
            display: 'inline-block',
            opacity: slot.opacity,
            transform: slot.active
              ? `translate(${slot.dx}px, ${slot.dy}px) scale(${slot.scale})`
              : undefined,
          }}
        >
          {/* 일반 공백은 inline-block 박스 경계에서 collapsible whitespace로 취급돼 폭이
              사라질 수 있다 — nbsp로 폭을 보존한다(정착 렌더의 일반 텍스트는 영향 없음). */}
          {slot.char === ' ' ? ' ' : slot.char}
        </span>
      ))}
    </span>
  );
}
