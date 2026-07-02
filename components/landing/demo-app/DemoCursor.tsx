'use client';

import { useEffect, useState, type RefObject } from 'react';
import { motion } from 'motion/react';
import { MousePointerClick } from 'lucide-react';

// 스크롤 가이드 커서 — 현재 단계에서 '무엇을 클릭하면 다음으로 넘어가는지'를 데모 윈도 안
// 대상 요소 위에 커서 아이콘으로 표시한다(배경 원·물결 없이 아이콘만, 아주 조금 커졌다
// 작아지는 펄스). 단계가 바뀌면(스크롤·클릭) 다음 대상으로
// 부드럽게 미끄러진다. pointer-events-none이라 실제 클릭을 막지 않는다. 클릭 대상이 없는
// 마지막 단계에서도 사라지지 않고 콘텐츠 우하단(주요 액션 자리)에 머물며, 어느 단계에서든
// 대상 위에 얹힌 뒤에도 미세하게 계속 떠다닌다 — 항상 '살아있는' 가이드 커서.
export function DemoCursor({
  windowRef,
  selector,
  page,
}: {
  windowRef: RefObject<HTMLDivElement | null>;
  selector: string | null;
  page: number;
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const win = windowRef.current;
    if (!win) return;
    let raf1 = 0;
    let raf2 = 0;
    const measure = () => {
      const w = windowRef.current;
      if (!w) return;
      const wr = w.getBoundingClientRect();
      const el = selector ? (w.querySelector(selector) as HTMLElement | null) : null;
      if (el) {
        const er = el.getBoundingClientRect();
        setPos({
          x: er.left - wr.left + er.width / 2,
          y: er.top - wr.top + er.height / 2,
        });
      } else {
        // 클릭 대상이 없는 단계 — 숨기지 않고 콘텐츠 우하단(주요 액션이 놓이는 자리)에 머문다.
        setPos({ x: wr.width * 0.74, y: wr.height * 0.84 });
      }
    };
    // 페이지 전환 후 새 대상이 렌더된 다음(두 프레임 뒤) 측정한다.
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(measure);
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [windowRef, selector, page]);

  if (!pos) return null;

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute left-0 top-0 z-30"
      initial={false}
      animate={{ x: pos.x, y: pos.y }}
      transition={{ type: 'spring', stiffness: 240, damping: 24 }}
    >
      {/* 대상 위에 얹힌 뒤에도 멈추지 않고 미세하게 떠다닌다. */}
      <motion.span
        className="block"
        animate={{ x: [0, 6, -4, 2, 0], y: [0, -5, 3, -2, 0] }}
        transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
      >
        {/* 점을 중심으로 아이콘을 정렬(-50%). scale은 별도 요소에서 걸어 transform 충돌을 피한다. */}
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
    </motion.div>
  );
}
