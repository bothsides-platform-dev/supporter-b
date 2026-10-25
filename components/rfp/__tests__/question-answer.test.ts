import { expect, it } from 'vitest';
import * as questions from '../content-questions';
import { createRfpDraftStore } from '@/lib/stores/rfp-draft';
it('formats question snapshots with labels, units, explicit empty values and attachment counts', () => {
 const draft = createRfpDraftStore({ websiteUrl: 'https://example.com', currentSolution: 'cafe24',
 industryMode: 'custom', customIndustryName: '수제 가구', mainProducts: '책상',
 productInfo: { hasMarketplaceSellers: false, cashConvertible: true, maximumPrice: 'under_100k', salesMethods: ['subscription'] },
 deliveryServicePeriod: 'D+3', contractType: 'renewal', currentPgs: [{pgWorkspaceId: null, name: '기존 PG'}],
 requiredPaymentMethods: ['card'], customPaymentMethods: [{label: '별도 결제'}], annualPgVolume: '1000000',
 currentFeeRate: '2.5', currentSettlementLimit: '500000', currentGuaranteeInsurance: '0', currentSettlementCycle: 'D+7',
 title: '견적 요청', memo: '문의', rfpFiles: [{id: 'private-id', name: 'secret.pdf', size: 10}]
 }).getState();
 const expected: Record<string,string> = { website: 'https://example.com', solution: '카페24', industry: '수제 가구', products: '책상',
 sellers: '아니요', cash: '네', price: '10만원 미만', sales: '구독형 판매', delivery: 'D+3', contract: '갱신 계약',
 'current-pgs': '기존 PG', payment: '카드, 별도 결제', annual: '1,000,000원', fee: '2.5%', limit: '500,000원', insurance: '0원', cycle: 'D+7', title: '견적 요청', memo: '문의', attachments: '1개' };
 for (const [id, value] of Object.entries(expected)) expect(questions.questionAnswer(id, draft, [])).toBe(value);
 expect(questions.questionAnswer('memo', createRfpDraftStore().getState(), [])).toBe('미입력');
 expect(questions.questionAnswer('industry', {...draft, industryMode:'registered', industryGroupId: 'industry-id'}, [{id:'industry-id',name:'등록 업종',mccCode:undefined}])).toBe('등록 업종');
});
