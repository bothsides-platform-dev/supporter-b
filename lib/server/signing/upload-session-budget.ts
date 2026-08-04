// SnowSign 업로드 세션의 **조직 공유 한도**를 우리 쪽에서 회계한다.
//
// 왜 필요한가: 업로드 세션은 워크스페이스가 아니라 **API 키(=조직 전체)** 단위로
// 제한된다 — docs/SNOWSIGN_API.md "Rate Limiting": 동시 3개 / 선언 용량 합 150MB /
// TTL 10분, 그리고 **해제 엔드포인트가 없다**. 즉 한 PG 가 50MB 를 세 번 선언하면
// (스키마 상한이 정확히 50MB 다) 그 순간부터 10분간 **모든 PG** 의 계약서 템플릿
// 업로드가 429 로 막힌다. 악의가 없어도 실패한 업로드 3번이면 같은 일이 벌어진다.
// 우리 앱이 그 키의 유일한 소비자이므로, 같은 회계를 우리가 들고 있으면 남의
// 슬롯을 먹기 전에 우리가 먼저 거절할 수 있다.
//
// 왜 인메모리인가: 운영은 PM2 `instances: 1` · `exec_mode: 'fork'`(ecosystem.config.cjs)
// 단일 Node 프로세스라 이 맵이 배포 전체에 대해 권위 있다. 재시작하면 비지만 공급자
// TTL 이 10분이라 드리프트도 거기서 끝나고, 느슨한 쪽으로 틀렸을 때의 결과는 오늘과
// 같다(공급자 429 → SNOWSIGN_RATE_LIMIT). DDL 없이 끝나는 것이 이 릴리스에서 중요하다.
//
// 자기-잠김 금지: 같은 워크스페이스의 새 요청은 **자기 예약을 밀어내고** 다시 잡는다.
// 이게 없으면 업로드 한 번 실패한 담당자가 자기 예약에 막혀 10분간 재시도할 수 없다 —
// 발송 리스가 30분 고정이던 시절 겪은 자기-잠김(CLAUDE.md 전자서명 절)과 같은 실패다.

import { randomUUID } from 'node:crypto';

/** docs/SNOWSIGN_API.md — API Key당 동시 사용 중인 업로드 세션 */
export const MAX_CONCURRENT_SESSIONS = 3;
/** docs/SNOWSIGN_API.md — API Key당 사용 중인 업로드 세션 선언 용량 합 */
export const MAX_DECLARED_BYTES = 150 * 1024 * 1024;
/** docs/SNOWSIGN_API.md — 업로드 세션 유효 시간 */
export const SESSION_TTL_MS = 10 * 60 * 1000;

interface Reservation {
  workspaceId: string;
  sizeBytes: number;
  expiresAt: number;
  uploadId?: string;
}

const reservations = new Map<string, Reservation>();

export type ReserveResult =
  | { ok: true; slotId: string }
  | { ok: false; error: 'UPLOAD_SLOTS_BUSY' };

function prune(now: number): void {
  for (const [slotId, r] of reservations) {
    if (r.expiresAt <= now) reservations.delete(slotId);
  }
}

/**
 * 업로드 세션 슬롯을 잡는다. **공급자 호출 앞에서** 불러야 한다 — 왕복을 사이에 둔
 * check-then-act 는 동시 요청 둘이 같은 빈자리를 함께 통과시킨다.
 */
export function reserveUploadSlot(
  workspaceId: string,
  sizeBytes: number,
  now: number = Date.now(),
): ReserveResult {
  prune(now);

  // 같은 워크스페이스의 이전 예약은 밀어낸다(자기-잠김 방지). 공급자 쪽 옛 세션은
  // TTL 로만 사라지므로 이 구간에서는 우리 회계가 느슨해질 수 있는데, 그 대가는
  // 공급자 429 하나이고 대신 담당자가 자기 실패에 갇히지 않는다.
  for (const [slotId, r] of reservations) {
    if (r.workspaceId === workspaceId) reservations.delete(slotId);
  }

  if (reservations.size >= MAX_CONCURRENT_SESSIONS) {
    return { ok: false, error: 'UPLOAD_SLOTS_BUSY' };
  }
  let declared = sizeBytes;
  for (const r of reservations.values()) declared += r.sizeBytes;
  if (declared > MAX_DECLARED_BYTES) {
    return { ok: false, error: 'UPLOAD_SLOTS_BUSY' };
  }

  const slotId = randomUUID();
  reservations.set(slotId, { workspaceId, sizeBytes, expiresAt: now + SESSION_TTL_MS });
  return { ok: true, slotId };
}

/** 공급자가 실제로 발급한 uploadId 를 슬롯에 묶는다 — 소비 시 회수하기 위해서. */
export function bindUploadSlot(slotId: string, uploadId: string): void {
  const r = reservations.get(slotId);
  if (r) r.uploadId = uploadId;
}

/** 발급이 실패했을 때 되돌린다(세션이 만들어지지 않았으므로 자리를 잡아둘 이유가 없다). */
export function releaseUploadSlot(slotId: string): void {
  reservations.delete(slotId);
}

/** 템플릿 생성으로 업로드가 소비되면 자리를 즉시 돌려준다(TTL 을 기다리지 않는다). */
export function releaseUploadSlotByUploadId(uploadId: string): void {
  for (const [slotId, r] of reservations) {
    if (r.uploadId === uploadId) reservations.delete(slotId);
  }
}

export function __resetUploadBudgetForTest(): void {
  reservations.clear();
}
