import { it, expect } from 'vitest';
import { layoutContract, PAGE } from '../layout';
import { collectDrawableText } from '../doc-text';
import { buildAgreementDocument } from '../agreement';

it('완성한 회사 정보를 인쇄하고 추가 입력칸 없이 양측 서명칸만 만든다', () => {
  const party = {
    company: '아주 긴 회사명 '.repeat(5),
    bizNo: '1234567890',
    address: '서울시 강남구 테헤란로 '.repeat(8),
    representative: '김대표',
  };
  const input = {
    doc: buildAgreementDocument('구매사', 'PG사'),
    parties: { buyer: party, pg: party },
    feeRows: [
      {
        label: '아주 긴 커스텀 결제수단 이름'.repeat(3),
        standard: '2.00%',
        discount: '0.20%p',
        value: '1.80%',
      },
    ],
  };
  const result = layoutContract(input, {
    widthOf: (text, size) => text.length * size,
  });
  expect(result.fields.map((f) => f.type)).toEqual(['signature', 'signature']);
  const text = result.ops
    .filter((o) => o.op === 'text')
    .map((o) => o.text)
    .join('');
  expect(text).toContain('김대표');
  expect(text).toContain('2.00%');
  expect(text).toContain('0.20%p');
  expect(collectDrawableText(input)).toContain(party.address);
  expect(collectDrawableText(input)).toContain('2.00%');
  expect(
    result.ops
      .filter((o) => o.op === 'text')
      .every((o) => o.op === 'text' && o.x + o.text.length * o.size <= PAGE.width),
  ).toBe(true);
  expect(result.fields.every((f) => f.y + f.height < PAGE.height)).toBe(true);
});
