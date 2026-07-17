// 계약 PDF 파이프라인 테스트 공용 픽스처.
// 파일명이 `*.test.ts` 가 아니므로 vitest include 패턴에 수집되지 않는다.
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb } from 'pdf-lib';
import type { ContractPartiesV1, ContractTermsSnapshotV1 } from '@/lib/types/contract-doc';
import { loadContractFontBytes } from '@/lib/server/contracts/fonts';

/**
 * 실제 PG가 올릴 법한 템플릿을 흉내낸다 — 한글 본문 + 자체 임베드 폰트.
 * compose 가 **이미 폰트를 품은 문서**에 자기 폰트를 덧임베드해도 충돌하지
 * 않는지가 이 픽스처의 요점(실 템플릿은 항상 폰트를 품고 있다).
 */
export async function makeKoreanTemplate(pages = 2): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const { regular } = await loadContractFontBytes();
  const font = await doc.embedFont(regular as unknown as Uint8Array, { subset: true });
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([595.28, 841.89]);
    page.drawText(`전자계약 표준 약관 제${i + 1}장`, {
      x: 48,
      y: 780,
      size: 14,
      font,
      color: rgb(0.1, 0.1, 0.1),
    });
    page.drawText('제1조 (목적) 본 계약은 결제대행 서비스 제공에 관한 사항을 정한다.', {
      x: 48,
      y: 750,
      size: 10,
      font,
      color: rgb(0.2, 0.2, 0.2),
    });
  }
  return Buffer.from(await doc.save());
}

export const PARTIES_FIXTURE: ContractPartiesV1 = {
  _v: 1,
  buyer: { name: '주식회사 서포트비', repName: '김구매', bizNo: '123-45-67890' },
  pg: { name: '나이스페이먼츠 주식회사', repName: '박대행', bizNo: '220-81-12345' },
};

/**
 * 렌더 경로를 전부 태우는 조건 스냅샷:
 *  · card         — 구간(tiered) 전 구간
 *  · kakao_pay    — 구간이되 일부만 채워진 부분 맵
 *  · overseas_card— 구간 미적용 단일 정률
 *  · virtual_account — 정액(건당 원)
 *  · custom-1     — 커스텀 수단
 */
export const TERMS_FIXTURE: ContractTermsSnapshotV1 = {
  _v: 1,
  rfpCode: 'P-2605-0042',
  rfpTitle: '온라인몰 결제대행 견적 요청',
  settleCycle: 'D+2',
  settleLimit: 500_000_000,
  guaranteeInsurance: 30_000_000,
  paymentFees: {
    card: { sole: 0.005, sme1: 0.011, sme2: 0.0125, sme3: 0.015, general: 0.022 },
    kakao_pay: { sole: 0.006, general: 0.023 },
    overseas_card: 0.035,
    virtual_account: 300,
  },
  customFees: { 'custom-1': 0.019 },
  customPaymentMethods: [{ id: 'custom-1', label: '포인트 결제' }],
  buyerTier: 'sme1',
};

/** 1×1 투명 PNG (서명 이미지 대역). base64 하드코딩 — 외부 파일 의존 없음. */
export const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
