import { describe, expect, it } from 'vitest';
import {
  SIGNING_ROLE_LABELS,
  buildSignatureFieldsPayload,
  partyFromRoleLabel,
  validateTemplateFields,
} from '../template-fields';
import type { SigningTemplateFieldInput } from '@/lib/types/signing';

function field(overrides: Partial<SigningTemplateFieldInput>): SigningTemplateFieldInput {
  return {
    id: 'f1',
    type: 'signature',
    party: 'buyer',
    pageNumber: 1,
    x: 10,
    y: 20,
    width: 120,
    height: 50,
    ...overrides,
  };
}

describe('buildSignatureFieldsPayload', () => {
  it('maps party to the Korean role label and passes coordinates through', () => {
    const payload = buildSignatureFieldsPayload([
      field({ party: 'buyer', type: 'signature', pageNumber: 2, x: 10, y: 20, width: 120, height: 50 }),
      field({ id: 'f2', party: 'pg', type: 'date', pageNumber: 1, x: 5, y: 6, width: 100, height: 24 }),
    ]);
    expect(payload).toEqual([
      { role: '구매사', type: 'signature', pageNumber: 2, positionX: 10, positionY: 20, width: 120, height: 50 },
      { role: 'PG사', type: 'date', pageNumber: 1, positionX: 5, positionY: 6, width: 100, height: 24 },
    ]);
  });

  it('returns an empty array for no fields', () => {
    expect(buildSignatureFieldsPayload([])).toEqual([]);
  });
});

// GET /v1/templates/{id} 는 쓰기의 `role` 이 아니라 `role_name` 으로 돌려준다(실측 —
// docs/SNOWSIGN_SANDBOX.md). 역매핑은 정매핑(PARTY_ROLE_LABEL)에서 파생해야 라벨이
// 바뀌어도 두 방향이 함께 움직인다.
describe('partyFromRoleLabel', () => {
  it('inverts the Korean role labels back to parties', () => {
    expect(partyFromRoleLabel('구매사')).toBe('buyer');
    expect(partyFromRoleLabel('PG사')).toBe('pg');
  });

  it('returns undefined for unknown labels (caller decides fail-closed)', () => {
    expect(partyFromRoleLabel('판매사')).toBeUndefined();
    expect(partyFromRoleLabel('')).toBeUndefined();
  });
});

// signers 로 provider 에 저장되는 라벨 목록과 필드 role 라벨은 같은 출처여야 한다 —
// 한쪽만 바뀌면 그 뒤 만들어진 모든 템플릿이 수정 진입에서 영구히
// TEMPLATE_UNSUPPORTED 로 거부된다(적대 리뷰). 순서도 계약이다(구매사 먼저).
describe('SIGNING_ROLE_LABELS', () => {
  it('is the ordered [buyer, pg] label tuple and round-trips through partyFromRoleLabel', () => {
    expect(SIGNING_ROLE_LABELS).toEqual(['구매사', 'PG사']);
    expect(SIGNING_ROLE_LABELS.map((l) => partyFromRoleLabel(l))).toEqual(['buyer', 'pg']);
  });
});

describe('validateTemplateFields', () => {
  it('fails when there is no buyer signable field', () => {
    const result = validateTemplateFields([field({ party: 'pg', type: 'signature' })]);
    expect(result).toEqual({ ok: false, error: 'MISSING_SIGNABLE_FIELD' });
  });

  it('fails when there is no pg signable field', () => {
    const result = validateTemplateFields([field({ party: 'buyer', type: 'signature' })]);
    expect(result).toEqual({ ok: false, error: 'MISSING_SIGNABLE_FIELD' });
  });

  it('fails when both sides only have non-signable fields (date/text)', () => {
    const result = validateTemplateFields([
      field({ party: 'buyer', type: 'date' }),
      field({ party: 'pg', type: 'text' }),
    ]);
    expect(result).toEqual({ ok: false, error: 'MISSING_SIGNABLE_FIELD' });
  });

  it('succeeds when both sides have a signature or name field', () => {
    const result = validateTemplateFields([
      field({ party: 'buyer', type: 'signature' }),
      field({ id: 'f2', party: 'pg', type: 'name' }),
    ]);
    expect(result).toEqual({ ok: true });
  });
});
