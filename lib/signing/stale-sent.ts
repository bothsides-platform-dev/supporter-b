/**
 * 마감 없는 계약의 **방치 감지** — 조항형(compose) 경로의 보상 통제.
 *
 * 왜 필요한가: `deadline_days` 는 `POST /v1/contracts`(조항형이 쓰는 건별 생성)에서
 * **201 로 수락된 뒤 조용히 무시된다**(실측 `docs/SNOWSIGN_SANDBOX.md` S6). 그래서 그
 * 경로의 계약은 `expires_at` 이 없고 `expired` 에 도달할 수 없다 — 템플릿 경로 계약은
 * 30일에 만료되는데 같은 딜룸의 조항형 계약은 **무기한**이라 두 경로의 수명이 다르다.
 * 공급자에 마감을 심을 수단이 없으므로 마감을 흉내내지 않는다(거짓 약속 금지). 대신
 * ① 화면이 경과를 말하고 ② 그만큼 지나면 운영자가 안다.
 *
 * 자동 취소는 **하지 않는다**(사용자 결정) — 되돌릴 수 없고, 상대가 막 서명하려는
 * 순간과 경합한다. 사람이 딜룸에서 취소한다.
 */
import { SIGNING_DEADLINE_DAYS } from './deadline';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 이만큼 지나도 서명이 안 끝나 있으면 "방치"로 본다.
 *
 * 템플릿 경로의 마감과 **같은 값에서 파생한다** — 이 알림의 의미가 정확히 "템플릿
 * 경로였다면 지금쯤 만료됐다"이기 때문이다. 숫자를 복제하면 한쪽만 바뀐다.
 */
export const STALE_SENT_AFTER_DAYS = SIGNING_DEADLINE_DAYS;
export const STALE_SENT_AFTER_MS = STALE_SENT_AFTER_DAYS * DAY_MS;

/**
 * 재알림 간격 — 한 번 알리고 끝내면 운영자가 놓쳤을 때 복구가 없고, 매 틱 알리면
 * 폴러가 1분마다 도배한다. `nudgeStaleAwaiting` 의 7일과 같은 감각.
 */
export const STALE_SENT_REALERT_DAYS = 7;
export const STALE_SENT_REALERT_MS = STALE_SENT_REALERT_DAYS * DAY_MS;
