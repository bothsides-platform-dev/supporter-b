'use client';

import { type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { bubbleSurfaceClass } from './MessageBubble';
import { clipInset, type Flight } from './message-morph';

// 레포 기존 진입 ease(FadeInView/ProcessSection) — 부드러운 감속(cubic-bezier).
const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];
// morph 이동 시간(초) — 큰 전환(medium-4 ~350ms)에 해당하는 튜닝값.
const MORPH_DURATION_S = 0.34;

// 전송 morph 오버레이 — 진행 중인 flight 마다 입력창에서 떠올라 말풍선으로 변신하는 클론을 그린다.
// 스크롤 컨테이너 클리핑·딜룸 블러 모달 스택 컨텍스트를 피하려고 body 로 portal(fixed, 최상위 z,
// pointer-events 차단). 클론은 `to`(말풍선 최종 위치) 에 두고 transform 으로 `from`(입력창)에서
// 출발해 identity 로 이동 → 실제 말풍선(이동 중 opacity:0)로 seamless 핸드오프.
//
// 최상위 z 는 딜룸 모달(z-50) 도 넘으므로, 클론마다 채팅 패널 경계(`clip`)로 잘라낸 박스
// 안에서만 그린다 — 0.34s 비행이 모달 헤더 위를 덮는 것을 막는다. 클리핑 박스는 레이어와
// 같은 viewport 좌표계(absolute inset-0)라 클론 좌표 계산은 그대로다.
export function MorphFlightLayer({
  flights,
  onDone,
  renderText,
}: {
  flights: Flight[];
  onDone: (key: string) => void;
  renderText: (body: string) => ReactNode;
}) {
  if (typeof document === 'undefined' || flights.length === 0) return null;

  // clip 계산의 분모 — inset()이 적용되는 `data-morph-clip` 박스(`fixed inset-0`)와 같은
  // 좌표계여야 한다. 그 박스는 ICB(레이아웃 뷰포트, 스크롤바 제외)에 맞춰지므로 분모도
  // documentElement.clientWidth/Height(스크롤바 제외·레이아웃 뷰포트)를 쓴다 — window.inner*
  // 는 스크롤바 폭을 포함하고 모바일에선 비주얼 뷰포트(키보드로 줄어듦)를 따라 ICB 와
  // 어긋난다. jsdom 은 레이아웃이 없어 clientWidth 가 0 이므로 window.inner* 로 폴백한다.
  // 남는 근사는 렌더 스냅샷이라는 점뿐 — 340ms 비행 중 리사이즈는 반영 안 되지만 clip rect
  // 자체도 같은 시점 스냅샷이라 함께 스테일하고, 짧은 창이라 무해하다.
  const doc = document.documentElement;
  const viewport = {
    width: doc.clientWidth || window.innerWidth,
    height: doc.clientHeight || window.innerHeight,
  };

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[100]">
      {flights.map((f) => (
        <div
          key={f.key}
          data-morph-clip
          className="absolute inset-0"
          style={{ clipPath: clipInset(f.clip, viewport) }}
        >
          <motion.div
            className="absolute"
            style={{ left: f.to.left, top: f.to.top, width: f.to.width, transformOrigin: 'top left' }}
            initial={{ x: f.dx, y: f.dy, scale: f.scale }}
            animate={{ x: 0, y: 0, scale: 1 }}
            transition={{ duration: MORPH_DURATION_S, ease: EASE_OUT }}
            onAnimationComplete={() => onDone(f.key)}
          >
            {/* 클론은 측정된 말풍선 폭(to.width)에 꽉 차게 — 행 기준 max-w-[78%] 는 해제. */}
            <div className={cn(bubbleSurfaceClass(true), 'w-full max-w-none')}>{renderText(f.text)}</div>
          </motion.div>
        </div>
      ))}
    </div>,
    document.body,
  );
}
