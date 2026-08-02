// 스노우싸인 임베드(iframe)가 parent 로 보내는 postMessage 페이로드 해석 (SSOT).
//
// 딜룸의 계약서 발송 임베드가 완료되면 스노우싸인이 `snowsign.embed.*` 이벤트를
// 보낸다. 그 안의 contract_id 가 우리 signing_contracts 행에 바인딩할 유일한 단서다.
//
// **이 모듈은 신뢰 경계가 아니다.** 오리진 검증은 호출부가(`e.origin` 정확 일치),
// 실제 소유·상태 검증은 서버가(`attachProviderContract` 가 getContract 로 재조회)
// 한다. 여기서는 "형태가 말이 되는가"만 본다 — 그래서 관대함보다 협소함을 택한다:
//   - 이벤트 네임스페이스(`snowsign.embed.`)를 강제해 번들러·확장프로그램·다른
//     라이브러리의 잡음(webpackHotUpdate 등)을 배제한다.
//   - id 는 경로 세그먼트 화이트리스트만 통과시킨다. 이 값은 서버에서 URL 경로로
//     들어가므로(encodeURIComponent 가 있더라도) 애초에 이상한 문자를 받지 않는다.
//   - 탐색 깊이·순환을 제한한다. 임베드가 보내는 payload 형태가 Phase 0 실측 전이라
//     중첩을 얼마간 허용하되, 무한 중첩으로 CPU 를 태울 수는 없게 한다.
//
// 순수 함수 — 클라(임베드 패널)와 스모크 스크립트가 함께 쓴다. server-only import 금지.

const EVENT_NAMESPACE = 'snowsign.embed.';
/**
 * 완료를 뜻하는 어미. 진행 잡음(`ready`, `get-iframe-pos`)과 구분한다.
 *
 * 실측(2026-08-01, docs/SNOWSIGN_SANDBOX.md): 실제 완료 이벤트는
 * `snowsign.embed.contract_sent` 였다 — `sent` 로 잡힌다. `completed`/`created` 는
 * 실측되지 않았지만 초안 저장(`pdf_draft`)이나 향후 이벤트가 그 어미를 쓸 수 있어
 * 남긴다. 완료 판정만으로 상태가 바뀌지는 않는다(서버가 재조회로 다시 검증).
 */
const COMPLETION_SUFFIXES = ['completed', 'created', 'sent'];

/**
 * 계약 ID 로 받아들일 문자 집합 — uuid 와 불투명 토큰 양쪽을 덮는다.
 *
 * 단일 출처다. 이 값은 서버에서 URL 경로 세그먼트가 되므로 서버 액션
 * (`attachSigningContractAction`)도 같은 패턴으로 입력을 검증한다 — 손으로 복제하면
 * 한쪽만 느슨해졌을 때 아무도 알아채지 못한다.
 */
export const CONTRACT_ID_RE = /^[A-Za-z0-9_-]{8,128}$/;

const ID_KEYS = ['contract_id', 'contractId'];
/**
 * id 가 들어있을 수 있는 컨테이너 키. 실측에서 확인된 것은 `payload` 하나지만
 * (`{type:'snowsign.embed.contract_sent', payload:{contract_id}}`), 나머지도 흔한
 * 형태라 남긴다 — 잘못 넓혀도 서버가 재조회로 막으므로 비용이 없다.
 */
const CONTAINER_KEYS = ['data', 'payload', 'detail', 'contract', 'result'];
const MAX_DEPTH = 4;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** 프로토타입 오염 키를 걸러 own property 만 읽는다. */
function ownProp(obj: Record<string, unknown>, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined;
}

function eventName(data: unknown): string | undefined {
  if (!isPlainObject(data)) return undefined;
  const t = ownProp(data, 'type') ?? ownProp(data, 'event');
  return typeof t === 'string' ? t : undefined;
}

/**
 * 임베드 완료 이벤트인가. 오리진 검증을 통과한 메시지에만 의미가 있다.
 */
export function isEmbedCompletionEvent(data: unknown): boolean {
  const name = eventName(data);
  if (!name || !name.startsWith(EVENT_NAMESPACE)) return false;
  const tail = name.slice(EVENT_NAMESPACE.length);
  return COMPLETION_SUFFIXES.some((s) => tail.endsWith(s));
}

/**
 * 페이로드에서 스노우싸인 계약 ID 를 뽑는다. 형태가 확실하지 않으면 undefined —
 * 호출부는 이를 "아직 모른다"로 다루고 복구 경로로 넘어가야 한다(잘못 추측한 id 로
 * 서버를 때리는 것보다 낫다).
 */
export function extractContractId(data: unknown): string | undefined {
  // 순환 방어를 따로 두지 않는다 — `MAX_DEPTH` 가 이미 탐색을 유한하게 만든다.
  // (한때 `seen` Set 을 뒀지만 어떤 변이로도 실패시킬 수 없는 중복 방어였다.)
  function walk(node: unknown, depth: number): string | undefined {
    if (depth > MAX_DEPTH || !isPlainObject(node)) return undefined;

    for (const key of ID_KEYS) {
      const v = ownProp(node, key);
      if (typeof v === 'string' && CONTRACT_ID_RE.test(v)) return v;
    }
    for (const key of CONTAINER_KEYS) {
      const found = walk(ownProp(node, key), depth + 1);
      if (found) return found;
    }
    return undefined;
  }

  return walk(data, 0);
}
