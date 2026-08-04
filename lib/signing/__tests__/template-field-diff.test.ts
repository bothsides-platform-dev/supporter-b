import { describe, it, expect } from 'vitest';

import { diffSignatureFields, type SignatureFieldProbe } from '../template-field-diff';

const field = (o: Partial<SignatureFieldProbe> = {}): SignatureFieldProbe => ({
  role: '구매사',
  type: 'signature',
  pageNumber: 1,
  positionX: 100,
  positionY: 200,
  width: 120,
  height: 50,
  ...o,
});

/** `GET /v1/templates/{id}` 가 돌려주는 raw 항목 형태. */
const wire = (f: SignatureFieldProbe) => ({
  role: f.role,
  type: f.type,
  page_number: f.pageNumber,
  position_x: f.positionX,
  position_y: f.positionY,
  width: f.width,
  height: f.height,
});

describe('diffSignatureFields — 템플릿 서명칸 좌표 왕복 판정 (Q6)', () => {
  it('그대로 되돌아오면 drift 가 없다', () => {
    const sent = [field(), field({ role: 'PG사', pageNumber: 2, positionX: 410 })];
    const r = diffSignatureFields(sent, { signature_fields: sent.map(wire) });
    expect(r).toEqual({ matched: 2, missing: 0, drifts: [] });
  });

  // 에디터의 전제가 여기서 무너진다 — 우리가 찍은 좌표와 공급자가 기억하는 좌표가
  // 다르면 PG 가 배치한 서명칸이 실제 PDF 에서 다른 자리에 찍힌다.
  it('좌표가 바뀌어 돌아오면 필드 단위로 집어낸다', () => {
    const sent = [field()];
    const returned = { signature_fields: [{ ...wire(sent[0]!), position_y: 641 }] };
    const r = diffSignatureFields(sent, returned);
    expect(r.matched).toBe(1);
    expect(r.missing).toBe(0);
    expect(r.drifts).toEqual([{ index: 0, field: 'positionY', sent: 200, returned: 641 }]);
  });

  // 문서상 `type: "variable"` 은 GET 응답에서 제외된다 — 빠진 것을 조용히 넘기면
  // "왕복 정상"이라는 잘못된 판정이 나온다.
  it('되돌아오지 않은 필드는 missing 으로 센다', () => {
    const sent = [field(), field({ role: 'PG사', type: 'date' })];
    const r = diffSignatureFields(sent, { signature_fields: [wire(sent[0]!)] });
    expect(r.matched).toBe(1);
    expect(r.missing).toBe(1);
    expect(r.drifts).toEqual([]);
  });

  // 순서를 가정하지 않는다(문서에 명시 없음) — 인덱스로 맞추면 재정렬이 전부 drift 로 보인다.
  it('응답 순서가 뒤바뀌어도 role·type·page 로 짝지어 오탐하지 않는다', () => {
    const a = field();
    const b = field({ role: 'PG사', type: 'date', pageNumber: 2 });
    const r = diffSignatureFields([a, b], { signature_fields: [wire(b), wire(a)] });
    expect(r).toEqual({ matched: 2, missing: 0, drifts: [] });
  });

  // 실측(2026-08-03)에서 드러난 것 — `GET /v1/templates/{id}` 는 역할을 `role` 이
  // 아니라 **`role_name`** 으로 돌려준다(생성 요청은 `role` 로 보낸다). 이걸 모르면
  // 좌표가 완벽히 왕복했는데도 "유실 2건"으로 읽혀, 있지도 않은 결함을 쫓게 된다.
  it('에코가 role_name 으로 와도 짝지어진다 (실 응답 형태)', () => {
    const sent = [field(), field({ role: 'PG사', positionY: 160 })];
    const returned = {
      signature_fields: sent.map((f) => {
        const { role: _drop, ...rest } = wire(f);
        return { ...rest, role_name: f.role, uuid: 'x', is_required: true, text_align: null };
      }),
    };
    expect(diffSignatureFields(sent, returned)).toEqual({ matched: 2, missing: 0, drifts: [] });
  });

  it('signature_fields 가 없거나 깨져 있어도 throw 하지 않고 전부 missing', () => {
    const sent = [field()];
    expect(diffSignatureFields(sent, undefined)).toEqual({ matched: 0, missing: 1, drifts: [] });
    expect(diffSignatureFields(sent, { signature_fields: 'nope' })).toEqual({
      matched: 0,
      missing: 1,
      drifts: [],
    });
  });
});
