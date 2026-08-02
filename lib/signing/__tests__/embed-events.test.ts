import { describe, expect, it } from 'vitest';

import { extractContractId, isEmbedCompletionEvent } from '../embed-events';

describe('isEmbedCompletionEvent', () => {
  it('accepts snowsign.embed.* completion event names', () => {
    expect(isEmbedCompletionEvent({ type: 'snowsign.embed.contract.created' })).toBe(true);
    expect(isEmbedCompletionEvent({ type: 'snowsign.embed.contract.sent' })).toBe(true);
    expect(isEmbedCompletionEvent({ event: 'snowsign.embed.pdf_send.completed' })).toBe(true);
  });

  it('rejects non-completion snowsign events (progress/resize chatter)', () => {
    expect(isEmbedCompletionEvent({ type: 'snowsign.embed.resize' })).toBe(false);
    expect(isEmbedCompletionEvent({ type: 'snowsign.embed.ready' })).toBe(false);
  });

  it('rejects events from anything not namespaced snowsign.embed', () => {
    // 오리진 가드를 통과한 프레임이라도 이벤트 네임스페이스를 강제한다.
    expect(isEmbedCompletionEvent({ type: 'contract.created' })).toBe(false);
    expect(isEmbedCompletionEvent({ type: 'webpackHotUpdate.completed' })).toBe(false);
  });

  it('rejects non-object / empty payloads', () => {
    expect(isEmbedCompletionEvent(undefined)).toBe(false);
    expect(isEmbedCompletionEvent(null)).toBe(false);
    expect(isEmbedCompletionEvent('snowsign.embed.contract.created')).toBe(false);
    expect(isEmbedCompletionEvent({})).toBe(false);
  });
});

describe('extractContractId', () => {
  it('reads a top-level contract_id or contractId', () => {
    expect(extractContractId({ contract_id: 'abc12345' })).toBe('abc12345');
    expect(extractContractId({ contractId: 'abc12345' })).toBe('abc12345');
  });

  it('reads a nested id under data/payload', () => {
    expect(extractContractId({ type: 'x', data: { contract_id: 'abc12345' } })).toBe('abc12345');
    expect(extractContractId({ payload: { contract: { contractId: 'abc12345' } } })).toBe('abc12345');
  });

  it('accepts a uuid — the documented contract_id shape', () => {
    const uuid = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
    expect(extractContractId({ contract_id: uuid })).toBe(uuid);
  });

  it('rejects ids with characters that do not belong in a path segment', () => {
    // 이 값은 서버에서 URL 경로로 들어간다 — 화이트리스트 밖은 애초에 받지 않는다.
    expect(extractContractId({ contract_id: '../../v1/templates' })).toBeUndefined();
    expect(extractContractId({ contract_id: 'abc 12345' })).toBeUndefined();
    expect(extractContractId({ contract_id: 'abc/12345' })).toBeUndefined();
  });

  it('rejects ids that are too short or too long', () => {
    expect(extractContractId({ contract_id: 'short' })).toBeUndefined();
    expect(extractContractId({ contract_id: 'a'.repeat(129) })).toBeUndefined();
  });

  it('rejects non-string ids', () => {
    expect(extractContractId({ contract_id: 12345678 })).toBeUndefined();
    expect(extractContractId({ contract_id: { id: 'abc12345' } })).toBeUndefined();
  });

  it('returns undefined when no contract id is present', () => {
    expect(extractContractId({ type: 'snowsign.embed.ready' })).toBeUndefined();
    expect(extractContractId(undefined)).toBeUndefined();
    expect(extractContractId(null)).toBeUndefined();
  });

  // 깊이·순환 가드는 **탐색되는 키**로 중첩해야 실제로 걸린다. CONTAINER_KEYS 밖의
  // 키(`nested`·`self` 등)로 쌓으면 워커가 애초에 내려가지 않아 가드를 건드리지도
  // 못하고 통과한다 — 그런 테스트는 가드를 지워도 초록이라 아무것도 지키지 못한다.
  it('finds an id nested up to the depth limit', () => {
    // data(1) → payload(2) → detail(3) → contract(4) = MAX_DEPTH 경계 안.
    const atLimit = { data: { payload: { detail: { contract: { contract_id: 'abc12345' } } } } };
    expect(extractContractId(atLimit)).toBe('abc12345');
  });

  it('does not walk unbounded depth', () => {
    // 악의적 프레임이 깊은 중첩으로 CPU 를 태우지 못하게 탐색 깊이를 제한한다.
    // 한 단계 더 깊으면(5) 못 찾아야 한다.
    let deep: Record<string, unknown> = { contract_id: 'abc12345' };
    for (let i = 0; i < 12; i += 1) deep = { data: deep };
    expect(extractContractId(deep)).toBeUndefined();
  });

  // `JSON.parse('{"__proto__":…}')` 는 **own** 프로퍼티를 만들 뿐 프로토타입을 바꾸지
  // 않는다 — 그걸로는 ownProp 가드를 검증하지 못한다(한때 그렇게 써서 가드를 지워도
  // 초록이었다). 실제로 상속시켜야 가드가 일한다.
  it('ignores prototype-inherited id keys', () => {
    const inherited = Object.create({ contract_id: 'abc12345' }) as unknown;
    expect(extractContractId(inherited)).toBeUndefined();
    const nested = { data: Object.create({ contract_id: 'abc12345' }) as unknown };
    expect(extractContractId(nested)).toBeUndefined();
  });

  // 순환 입력이 끝난다는 보장은 MAX_DEPTH 가 준다(전용 순환 가드는 없앴다).
  it('terminates on a cyclic payload', () => {
    const cyclic: Record<string, unknown> = { type: 'snowsign.embed.contract.created' };
    cyclic.data = cyclic;
    expect(() => extractContractId(cyclic)).not.toThrow();
    expect(extractContractId(cyclic)).toBeUndefined();
  });

  it('rejects a non-string or prototype-inherited event name', () => {
    expect(isEmbedCompletionEvent({ type: 12345 })).toBe(false);
    const inherited = Object.create({ type: 'snowsign.embed.contract.sent' }) as unknown;
    expect(isEmbedCompletionEvent(inherited)).toBe(false);
  });
});
