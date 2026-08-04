// SnowSign 업로드 세션 조직 공유 한도 회계.
//
// 지키는 것: ① 한 테넌트가 조직 전체 슬롯(3개/150MB)을 독점하지 못한다,
// ② 실패한 업로드가 **본인을** 10분간 가두지 않는다(자기-잠김 금지),
// ③ 소비·실패한 슬롯은 TTL 을 기다리지 않고 돌아온다.
import { beforeEach, describe, expect, it } from 'vitest';

import {
  MAX_CONCURRENT_SESSIONS,
  MAX_DECLARED_BYTES,
  SESSION_TTL_MS,
  __resetUploadBudgetForTest,
  bindUploadSlot,
  releaseUploadSlot,
  releaseUploadSlotByUploadId,
  reserveUploadSlot,
} from '../upload-session-budget';

const MB = 1024 * 1024;
const T0 = 1_700_000_000_000;

beforeEach(() => {
  __resetUploadBudgetForTest();
});

describe('reserveUploadSlot', () => {
  it('grants a slot when the org has room', () => {
    const r = reserveUploadSlot('ws-a', 5 * MB, T0);
    expect(r.ok).toBe(true);
  });

  it('refuses the 4th concurrent session across different workspaces', () => {
    // 한도는 워크스페이스가 아니라 API 키(조직) 단위다 — 서로 다른 테넌트여도 합산된다.
    for (let i = 0; i < MAX_CONCURRENT_SESSIONS; i += 1) {
      expect(reserveUploadSlot(`ws-${i}`, 1 * MB, T0).ok).toBe(true);
    }
    const overflow = reserveUploadSlot('ws-late', 1 * MB, T0);
    expect(overflow).toEqual({ ok: false, error: 'UPLOAD_SLOTS_BUSY' });
  });

  it('refuses a reservation that would exceed the declared-bytes budget', () => {
    // 선언 용량 합 150MB. 스키마 상한이 정확히 50MB 라 3번이면 딱 소진된다.
    expect(reserveUploadSlot('ws-a', 100 * MB, T0).ok).toBe(true);
    const tooBig = reserveUploadSlot('ws-b', 51 * MB, T0);
    expect(tooBig).toEqual({ ok: false, error: 'UPLOAD_SLOTS_BUSY' });
    // 남는 만큼은 여전히 들어간다 — 용량 판정이지 무조건 거절이 아니다.
    expect(reserveUploadSlot('ws-b', 50 * MB, T0).ok).toBe(true);
  });

  it('counts the incoming size, not just what is already held', () => {
    const r = reserveUploadSlot('ws-a', MAX_DECLARED_BYTES + 1, T0);
    expect(r).toEqual({ ok: false, error: 'UPLOAD_SLOTS_BUSY' });
  });

  it('lets a workspace supersede its own reservation instead of self-locking', () => {
    // 업로드가 실패해도 담당자는 즉시 재시도할 수 있어야 한다. 자기 예약에 자기가
    // 막히면 발송 리스 30분 고정 시절과 같은 자기-잠김이다.
    expect(reserveUploadSlot('ws-a', 50 * MB, T0).ok).toBe(true);
    expect(reserveUploadSlot('ws-a', 50 * MB, T0).ok).toBe(true);
    expect(reserveUploadSlot('ws-a', 50 * MB, T0).ok).toBe(true);
    // 자기 것만 밀어냈으므로 조직 자리는 하나만 쓰고 있다 — 남들 자리는 그대로다.
    expect(reserveUploadSlot('ws-b', 50 * MB, T0).ok).toBe(true);
    expect(reserveUploadSlot('ws-c', 50 * MB, T0).ok).toBe(true);
  });

  it('reclaims slots once the provider TTL has passed', () => {
    for (let i = 0; i < MAX_CONCURRENT_SESSIONS; i += 1) {
      reserveUploadSlot(`ws-${i}`, 50 * MB, T0);
    }
    expect(reserveUploadSlot('ws-late', 1 * MB, T0).ok).toBe(false);
    // TTL 경과 후에는 공급자 쪽에서도 세션이 사라져 있다.
    expect(reserveUploadSlot('ws-late', 1 * MB, T0 + SESSION_TTL_MS + 1).ok).toBe(true);
  });
});

describe('releasing slots', () => {
  it('releaseUploadSlot frees the slot when session issuance failed', () => {
    const held: string[] = [];
    for (let i = 0; i < MAX_CONCURRENT_SESSIONS; i += 1) {
      const r = reserveUploadSlot(`ws-${i}`, 50 * MB, T0);
      if (r.ok) held.push(r.slotId);
    }
    expect(reserveUploadSlot('ws-late', 1 * MB, T0).ok).toBe(false);

    releaseUploadSlot(held[0]);

    expect(reserveUploadSlot('ws-late', 1 * MB, T0).ok).toBe(true);
  });

  it('releaseUploadSlotByUploadId frees the slot once the upload is consumed', () => {
    const first = reserveUploadSlot('ws-a', 50 * MB, T0);
    if (!first.ok) throw new Error('setup');
    bindUploadSlot(first.slotId, 'up_123');
    reserveUploadSlot('ws-b', 50 * MB, T0);
    reserveUploadSlot('ws-c', 50 * MB, T0);
    expect(reserveUploadSlot('ws-late', 1 * MB, T0).ok).toBe(false);

    // 템플릿이 만들어지면 그 업로드는 소비됐다 — TTL 을 기다릴 이유가 없다.
    releaseUploadSlotByUploadId('up_123');

    expect(reserveUploadSlot('ws-late', 1 * MB, T0).ok).toBe(true);
  });

  it('releaseUploadSlotByUploadId ignores an unknown upload id', () => {
    reserveUploadSlot('ws-a', 50 * MB, T0);
    expect(() => releaseUploadSlotByUploadId('up_nope')).not.toThrow();
    // 남의 자리를 지우지 않았다.
    expect(reserveUploadSlot('ws-b', 100 * MB, T0).ok).toBe(true);
    expect(reserveUploadSlot('ws-c', 1 * MB, T0).ok).toBe(false);
  });
});
