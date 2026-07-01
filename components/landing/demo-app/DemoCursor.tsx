'use client';

import { useEffect, useState, type RefObject } from 'react';
import { motion } from 'motion/react';
import { MousePointerClick } from 'lucide-react';

// 스크롤 가이드 커서 — 현재 단계에서 '무엇을 클릭하면 다음으로 넘어가는지'를 데모 윈도 안
// 대상 요소 위에 커서 아이콘 + 펄스 링으로 표시한다. 단계가 바뀌면(스크롤·클릭) 다음 대상으로
// 부드럽게 미끄러진다. pointer-events-none이라 실제 클릭을 막지 않는다. 대상이 없는 마지막
// 단계에서는 숨는다.
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
    if (!win || !selector) {
      setPos(null);
      return;
    }
    let raf1 = 0;
    let raf2 = 0;
    const measure = () => {
      const el = win.querySelector(selector) as HTMLElement | null;
      if (!el) {
        setPos(null);
        return;
      }
      const wr = win.getBoundingClientRect();
      const er = el.getBoundingClientRect();
      setPos({
        x: er.left - wr.left + er.width / 2,
        y: er.top - wr.top + er.height / 2,
      });
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
      <span className="relative flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center">
        <span className="absolute inline-flex size-9 animate-ping rounded-full bg-[var(--md-sys-color-primary)] opacity-30" />
        <span className="absolute inline-flex size-6 rounded-full bg-[var(--md-sys-color-primary)] opacity-20" />
        <MousePointerClick
          className="relative size-5 text-[var(--md-sys-color-primary)] drop-shadow"
          strokeWidth={2.25}
        />
      </span>
    </motion.div>
  );
}
