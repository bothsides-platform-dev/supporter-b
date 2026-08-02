import { describe, expect, it } from 'vitest';

import { EMBED_HEARTBEAT_MS, EMBED_SEND_LEASE_MS } from '../embed-lease';

describe('embed lease timing contract', () => {
  // 하트비트 하나만 놓쳐도 리스가 끊기면, 백그라운드 탭 스로틀링(크롬 ~1회/분,
  // iOS 는 정지) 한 번에 작업 중이던 계약서가 날아간다. 여유를 상수로 못박는다.
  it('leaves room for several missed heartbeats', () => {
    expect(EMBED_HEARTBEAT_MS).toBeGreaterThan(0);
    expect(EMBED_HEARTBEAT_MS * 4).toBeLessThanOrEqual(EMBED_SEND_LEASE_MS);
  });

  // 반대쪽: 하트비트가 너무 잦으면 단일 프로세스 서버를 의미 없이 때린다.
  it('does not ping more often than every 15s', () => {
    expect(EMBED_HEARTBEAT_MS).toBeGreaterThanOrEqual(15_000);
  });
});
