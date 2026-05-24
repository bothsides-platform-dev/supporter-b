/**
 * In-process notification bus — per-user EventEmitter.
 *
 * v0 단일 인스턴스 가정. Map<userId, EventEmitter>로 글로벌 단일 EventEmitter
 * 대신 사용자별로 listener를 분리해 listener 누수를 자연 한정한다(NOTIFICATION.md
 * §4 Note: "단일 Next.js 프로세스 기준 설계").
 *
 * **prod 다중 인스턴스 swap**: 여러 Node 프로세스/컨테이너로 배포될 때는
 * 이 모듈을 Postgres `LISTEN/NOTIFY` 또는 Redis pub/sub 기반으로 교체해야
 * 한다. 현재 emit는 같은 프로세스의 SSE 핸들러에만 도달한다 — 다른 인스턴스
 * 에서 만든 알림은 SSE로 push 되지 않는다. swap 시:
 *   - subscribe → `LISTEN bidit_notif_<userId>` 또는 Redis SUBSCRIBE
 *   - emit      → `NOTIFY bidit_notif_<userId>, payload` 또는 Redis PUBLISH
 * 호출 사이트(actions, SSE route)는 그대로 두고 이 파일만 갈아끼운다.
 *
 * `globalThis.__bidit_notif_buses__` 캐시: Next dev HMR이 이 모듈을 다시
 * 로드해도 같은 Map을 재사용 — 기존 SSE 핸들러가 잡고 있던 listener가
 * 이중화되지 않는다.
 */
import { EventEmitter } from 'node:events';

import type { Notification } from '@/lib/types/notification';

declare global {
  // eslint-disable-next-line no-var -- global augmentation requires var
  var __bidit_notif_buses__: Map<string, EventEmitter> | undefined;
}

const EVENT = 'notification';

function getMap(): Map<string, EventEmitter> {
  if (!globalThis.__bidit_notif_buses__) {
    globalThis.__bidit_notif_buses__ = new Map<string, EventEmitter>();
  }
  return globalThis.__bidit_notif_buses__;
}

function getOrCreate(userId: string): EventEmitter {
  const map = getMap();
  let ee = map.get(userId);
  if (!ee) {
    ee = new EventEmitter();
    // 한 사용자가 여러 탭을 띄우거나 mark-read 폴링 등 다중 구독 시
    // 기본 max=10에 막혀 경고가 뜨지 않도록 0으로 풀어둔다. cleanup이
    // 동작하므로 누수 위험은 없다 — listenerCount 어서션 테스트가 보강.
    ee.setMaxListeners(0);
    map.set(userId, ee);
  }
  return ee;
}

/** 한 사용자에게 알림 푸시. handler가 없으면 no-op. */
export function emit(userId: string, notification: Notification): void {
  const map = getMap();
  const ee = map.get(userId);
  if (!ee) return;
  ee.emit(EVENT, notification);
}

/**
 * 사용자별 알림 구독.
 *
 * 반환된 `unsubscribe()`를 SSE abort 시 반드시 호출해야 한다(advisor pin 2).
 * 마지막 listener 해제 시 `Map`에서 EventEmitter를 제거 — listenerCount === 0
 * 보장 + 사용자별 메모리 footprint 0으로 회복.
 */
export function subscribe(
  userId: string,
  handler: (n: Notification) => void,
): () => void {
  const ee = getOrCreate(userId);
  ee.on(EVENT, handler);
  return () => {
    ee.off(EVENT, handler);
    if (ee.listenerCount(EVENT) === 0) {
      getMap().delete(userId);
    }
  };
}

/** 테스트용 — 사용자별 listenerCount 직접 조회. */
export function listenerCount(userId: string): number {
  const ee = getMap().get(userId);
  return ee ? ee.listenerCount(EVENT) : 0;
}

/** 테스트용 — bus 전체 리셋. */
export function __resetBusForTest(): void {
  globalThis.__bidit_notif_buses__ = new Map<string, EventEmitter>();
}
