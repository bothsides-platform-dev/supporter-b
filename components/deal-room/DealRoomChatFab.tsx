'use client';

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { animate, motion, useMotionValue, useReducedMotion } from 'motion/react';
import { MessageSquare } from 'lucide-react';

import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';

/**
 * DealRoomChatFab — lg 미만에서 채팅을 띄우는 플로팅 버튼 + 하단 시트.
 *
 * 딜룸 셸이 lg 이상에선 우측 채팅 aside 를, lg 미만에선 이 FAB 를 렌더한다(둘 중
 * 하나만 → 채팅 인스턴스 단일 보장). 시트는 열릴 때만 children(=채팅)을 마운트한다.
 * Linear: pill 금지 — 8px(shape-medium) 라운드 사각, 라인 아이콘, 플로팅 elevation.
 */
export function DealRoomChatFab({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const y = useMotionValue(0);
  const reduce = useReducedMotion();
  const popup = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const animation = useRef<ReturnType<typeof animate> | null>(null);
  const gesture = useRef<{ id: number; start: number; origin: number; last: number; time: number; velocity: number; moved: boolean } | null>(null);
  useEffect(() => () => { animation.current?.stop(); }, []);

  function changeOpen(next: boolean) {
    animation.current?.stop();
    gesture.current = null;
    if (next) y.set(0);
    setOpen(next);
  }

  function settle(close: boolean, velocity = 0) {
    animation.current?.stop();
    if (reduce) {
      if (close) changeOpen(false);
      else y.set(0);
      return;
    }
    animation.current = animate(y, close ? (popup.current?.offsetHeight ?? 0) : 0, {
      type: 'spring', stiffness: 400, damping: 40, velocity,
      onComplete: () => { if (close) changeOpen(false); },
    });
  }

  function start(event: PointerEvent<HTMLDivElement>) {
    if (!event.isPrimary || event.button !== 0 || gesture.current) return;
    animation.current?.stop();
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { id: event.pointerId, start: event.clientY, origin: y.get(), last: event.clientY, time: event.timeStamp, velocity: 0, moved: false };
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || g.id !== event.pointerId) return;
    const delta = event.clientY - g.start;
    g.moved ||= Math.abs(delta) >= 10;
    const elapsed = event.timeStamp - g.time;
    if (elapsed > 0) g.velocity = (event.clientY - g.last) / elapsed * 1000;
    g.last = event.clientY;
    g.time = event.timeStamp;
    if (g.moved && !reduce) {
      const position = g.origin + delta;
      // Upward motion meets a soft boundary; downward motion tracks the pointer.
      y.set(position < 0 ? position * 0.15 : position);
    }
  }

  function finish(event: PointerEvent<HTMLDivElement>, cancelled = false) {
    const g = gesture.current;
    if (!g || g.id !== event.pointerId) return;
    gesture.current = null;
    const velocity = event.timeStamp - g.time > 100 ? 0 : g.velocity;
    const position = reduce ? event.clientY - g.start : y.get();
    const deceleration = 0.995;
    const projected = position + (velocity / 1000) * deceleration / (1 - deceleration);
    const threshold = (popup.current?.offsetHeight || 600) * 0.3;
    settle(!cancelled && g.moved && velocity >= 0 && projected > threshold, velocity);
  }

  return (
    <>
      <button
        type="button"
        ref={trigger}
        aria-label="채팅 열기"
        onClick={() => changeOpen(true)}
        className="fixed right-4 bottom-4 z-40 flex h-12 w-12 items-center justify-center rounded-[var(--md-sys-shape-medium)] bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] shadow-[var(--md-sys-elevation-2)] transition-opacity hover:opacity-90 lg:hidden [&_svg]:size-5"
      >
        <MessageSquare strokeWidth={1.5} />
      </button>
      <Sheet open={open} onOpenChange={changeOpen}>
        <SheetContent
          ref={popup}
          side="bottom"
          finalFocus={trigger}
          render={<motion.div style={{ y, translate: 'none' }} />}
          className="data-[side=bottom]:h-[80dvh] gap-0 p-0 transition-opacity motion-reduce:transition-none"
        >
          <SheetTitle className="sr-only">채팅</SheetTitle>
          <div
            aria-hidden="true"
            className="flex h-12 shrink-0 touch-none select-none items-center justify-center mr-12 cursor-grab active:cursor-grabbing"
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={(event) => finish(event)}
            onPointerCancel={(event) => finish(event, true)}
            onLostPointerCapture={(event) => finish(event, true)}
          >
            <span className="ml-12 h-1 w-8 rounded-sm bg-[var(--md-sys-color-outline)]" />
          </div>
          <div className="flex flex-1 min-h-0 flex-col">{children}</div>
        </SheetContent>
      </Sheet>
    </>
  );
}
