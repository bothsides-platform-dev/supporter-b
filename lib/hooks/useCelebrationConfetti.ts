'use client';

// 축하 모먼트(DESIGN.md §9) 공용 컨페티 — 종결 성공 1회성 버스트의 단일 출처.
// 캔버스 생성·브랜드 컬러 추출·reduced-motion 안전(`disableForReducedMotion`)·버스트
// 기하를 한곳에 모은다. DESIGN.md의 "발동 지점 등록"은 곧 이 훅 호출을 의미한다.
// 반환: `canvasRef`(투명 전체화면 캔버스에 부착) + `fire`(필요 시 재발사용, 예: 다시보기).
import { useCallback, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';

export function useCelebrationConfetti() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fireRef = useRef<ReturnType<typeof confetti.create> | null>(null);

  const fire = useCallback(() => {
    const run = fireRef.current;
    if (!run) return;
    const primary =
      getComputedStyle(document.documentElement)
        .getPropertyValue('--md-sys-color-primary')
        .trim() || '#0061A4';
    const shared = { colors: [primary], scalar: 1, ticks: 250 };
    // 좌측 끝 → 안쪽 위, 우측 끝 → 안쪽 위, 중앙 상단 → 180° 전방위 비.
    run({ ...shared, particleCount: 80, angle: 60, spread: 60, startVelocity: 65, origin: { x: 0, y: 0.65 } });
    run({ ...shared, particleCount: 80, angle: 120, spread: 60, startVelocity: 65, origin: { x: 1, y: 0.65 } });
    run({ ...shared, particleCount: 120, spread: 180, startVelocity: 40, gravity: 0.6, origin: { x: 0.5, y: 0 } });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    fireRef.current = confetti.create(canvas, {
      resize: true,
      useWorker: false,
      disableForReducedMotion: true,
    });
    fire();
    return () => {
      fireRef.current?.reset();
      fireRef.current = null;
    };
  }, [fire]);

  return { canvasRef, fire };
}
