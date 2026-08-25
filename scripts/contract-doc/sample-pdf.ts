// 조항형 계약서 샘플 PDF 생성기 — 눈으로 보는 확인용.
//
//   pnpm contract:sample [출력경로]
//
// 자동 테스트는 "글자가 살아있는가 · 좌표가 맞는가"를 지키지만 **조판이 계약서처럼
// 보이는가**는 재지 못한다. 여백·자간·표 정렬 같은 것은 사람이 봐야 하고, 기본 조항
// 세트를 고칠 때마다 결과를 다시 보는 것이 가장 싸다.
//
// 실 데이터를 쓰지 않는다 — 아래 값은 전부 예시다.

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildDefaultContractDoc } from '@/lib/contract-doc/default-clauses';
import { resolveContractDoc } from '@/lib/contract-doc/variables';
import { renderContractPdf } from '@/lib/contract-doc/render-pdf';
import { buildFeeTableRows } from '@/lib/contract-doc/fee-table';

async function main(): Promise<void> {
  const out = process.argv[2] ?? path.join(process.cwd(), 'sample-contract.pdf');

  const resolved = resolveContractDoc(buildDefaultContractDoc(), {
    buyerCompany: '주식회사 서포트비',
    pgCompany: '주식회사 페이지원',
    contractDate: new Date('2026-08-18T02:00:00Z'),
    settleCycle: 'D+3',
    settleLimit: 100_000_000,
    guaranteeInsurance: 50_000_000,
    signupFee: 220_000,
  });
  if (!resolved.ok) {
    throw new Error(`미등록 토큰: ${resolved.unknownTokens.join(', ')}`);
  }

  const feeRows = buildFeeTableRows({
    paymentFees: {
      card: { sole: 0.005, sme1: 0.011, sme2: 0.0125, sme3: 0.015, general: 0.025 },
      overseas_card: 0.035,
      bank_transfer: 0.013,
      virtual_account: 300,
      naver_pay: 0.023,
      kakao_pay: 0.023,
    },
    customFees: {},
    customMethods: [],
  });

  const rendered = await renderContractPdf({
    doc: resolved.doc,
    feeRows,
    parties: {
      buyer: { company: '주식회사 서포트비', bizNo: '123-45-67890' },
      pg: { company: '주식회사 페이지원' },
    },
  });

  await writeFile(out, rendered.bytes);
  console.log(
    `${out}\n  ${rendered.pageCount}쪽 · ${(rendered.bytes.byteLength / 1024).toFixed(0)}KB · 서명칸 ${rendered.fields.length}개`,
  );
  for (const f of rendered.fields) {
    console.log(
      `    ${f.party.padEnd(5)} ${f.type.padEnd(9)} p${f.pageNumber} ` +
        `x=${f.x.toFixed(1)} y=${f.y.toFixed(1)} ${f.width.toFixed(1)}×${f.height.toFixed(1)}`,
    );
  }
}

void main();
