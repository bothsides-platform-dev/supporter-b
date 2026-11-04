// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { sendReadinessIssues, type SendReadinessInput } from '@/lib/rfp/send-readiness';

const GROUP_ID = '11111111-1111-4111-8111-111111111111';

const empty: SendReadinessInput = {
  title: '',
  websiteUrl: '',
  contractType: null,
  mainProducts: '',
  monthlyAvgPgVolume: '',
  requiredPaymentMethods: [],
  customPaymentMethods: [],
  productInfo: {},
  currentPgs: [],
  allowedPgWorkspaceIds: [],
  deadline: '',
};

const ready: SendReadinessInput = {
  title: '견적 요청',
  websiteUrl: 'example.com',
  contractType: 'new',
  mainProducts: '의류',
  industryMode: 'registered',
  industryGroupId: GROUP_ID,
  monthlyAvgPgVolume: '',
  deliveryServicePeriod: 'D+3',
  requiredPaymentMethods: ['card'],
  customPaymentMethods: [],
  productInfo: { cashConvertible: false, maximumPrice: 'under_100k', salesMethods: ['none'] },
  currentPgs: [],
  allowedPgWorkspaceIds: [{ id: 'pg-1' }],
  deadline: '2099-01-01T23:59:59+09:00',
};

const groups = [{ id: GROUP_ID }];
const rules = (input: SendReadinessInput, g?: readonly { id: string }[]) => sendReadinessIssues(input, g).map((i) => i.rule);

describe('sendReadinessIssues', () => {
  it('빈 초안은 규칙표 순서대로 모든 필수 입력을 미충족으로 돌려준다', () => {
    expect(rules(empty, groups)).toEqual([
      'title',
      'website-required',
      'contract',
      'main-products',
      'delivery',
      'product-cash',
      'product-price',
      'product-sales',
      'industry',
      'monthly-avg-volume',
      'payment',
      'deadline',
      'pg',
    ]);
  });

  it('발송 가능한 신규 계약 입력은 빈 배열이다', () => {
    expect(sendReadinessIssues(ready, groups)).toEqual([]);
  });

  it('각 이슈는 단계·질문 id·스키마 경로·문구를 함께 가진다', () => {
    const [website] = sendReadinessIssues({ ...ready, websiteUrl: '' }, groups);
    expect(website).toEqual({
      rule: 'website-required',
      step: 2,
      questionId: 'website',
      path: 'websiteUrl',
      message: '홈페이지 주소를 입력해주세요',
      questionFlowOnly: false,
    });
    const [deadline] = sendReadinessIssues({ ...ready, deadline: 'nope' }, groups);
    expect(deadline).toMatchObject({ rule: 'deadline', step: 3, questionId: null, path: 'deadline' });
  });

  it('홈페이지는 빈값과 형식 오류를 구분하고 둘을 동시에 내지 않는다', () => {
    expect(rules({ ...ready, websiteUrl: '   ' }, groups)).toEqual(['website-required']);
    expect(rules({ ...ready, websiteUrl: 'not a url' }, groups)).toEqual(['website-format']);
    expect(rules({ ...ready, websiteUrl: undefined }, groups)).toEqual(['website-required']);
  });

  it('갱신 계약은 현재 PG 와 월 평균 거래액을 요구하고 신규 계약은 요구하지 않는다', () => {
    const renewal = { ...ready, contractType: 'renewal' as const };
    expect(rules(renewal, groups)).toEqual(['current-pgs', 'monthly-avg-volume']);
    expect(rules({ ...renewal, currentPgs: [{ pgWorkspaceId: null, name: '기존 PG' }], monthlyAvgPgVolume: '1000000' }, groups)).toEqual([]);
    expect(rules({ ...ready, contractType: 'new', monthlyAvgPgVolume: '' }, groups)).toEqual([]);
  });

  it('판매 정보는 질문 단위로 미충족을 내고, 아예 없으면 세 질문 모두 미충족이다', () => {
    expect(rules({ ...ready, productInfo: { cashConvertible: true } }, groups)).toEqual(['product-price', 'product-sales']);
    expect(rules({ ...ready, productInfo: undefined }, groups)).toEqual(['product-cash', 'product-price', 'product-sales']);
    expect(rules({ ...ready, productInfo: { cashConvertible: false, maximumPrice: 'under_100k', salesMethods: ['none', 'used'] } }, groups)).toEqual(['product-sales']);
  });

  it('질문 흐름 전용 규칙은 판매 정보와 현재 PG 뿐이다', () => {
    const only = sendReadinessIssues({ ...empty, contractType: 'renewal' }, groups)
      .filter((i) => i.questionFlowOnly)
      .map((i) => i.rule);
    expect(only).toEqual(['product-cash', 'product-price', 'product-sales', 'current-pgs']);
  });

  it('업종 목록을 넘기면 등록 ID 가 목록에 있어야 하고 직접 입력은 이름만 있으면 된다', () => {
    expect(rules({ ...ready, industryGroupId: 'other' }, groups)).toEqual(['industry']);
    expect(rules({ ...ready, industryGroupId: GROUP_ID }, [])).toEqual(['industry']);
    expect(rules({ ...ready, industryMode: 'custom', industryGroupId: undefined, customIndustryName: '방문 돌봄' }, [])).toEqual([]);
    expect(rules({ ...ready, industryMode: 'custom', customIndustryName: '   ' }, [])).toEqual(['industry']);
  });

  it('업종 목록이 없으면(서버 스키마) 등록 ID 와 직접 입력의 배타성만 보고 ID 형식은 묻지 않는다', () => {
    expect(rules({ ...ready, industryMode: undefined })).toEqual([]);
    expect(rules({ ...ready, industryMode: undefined, industryGroupId: 'tutorial-shopping' })).toEqual([]);
    expect(rules({ ...ready, industryMode: undefined, industryGroupId: undefined, customIndustryName: '방문 돌봄' })).toEqual([]);
    expect(rules({ ...ready, industryMode: undefined, industryGroupId: undefined, customIndustryName: undefined })).toEqual(['industry']);
    expect(rules({ ...ready, industryMode: undefined, customIndustryName: '방문 돌봄' })).toEqual(['industry']);
    expect(rules({ ...ready, industryMode: undefined, industryGroupId: '  ' })).toEqual(['industry']);
  });

  it('업종 목록이 없어도 초안 모드가 있으면 그 모드의 값만 본다', () => {
    expect(rules({ ...ready, industryMode: 'registered', customIndustryName: '남은 직접 입력' })).toEqual([]);
    expect(rules({ ...ready, industryMode: 'registered', industryGroupId: '' })).toEqual(['industry']);
    expect(rules({ ...ready, industryMode: 'custom', customIndustryName: '방문 돌봄' })).toEqual([]);
    expect(rules({ ...ready, industryMode: 'custom', customIndustryName: '' })).toEqual(['industry']);
  });

  it('마지막 단계는 마감일과 PG 선택을 본다', () => {
    expect(rules({ ...ready, deadline: '', allowedPgWorkspaceIds: [] }, groups)).toEqual(['deadline', 'pg']);
  });

  it('검증된 서버 입력의 마감일(Date)도 같은 규칙으로 본다', () => {
    expect(rules({ ...ready, deadline: new Date('2099-01-01T23:59:59+09:00') }, groups)).toEqual([]);
    expect(rules({ ...ready, deadline: new Date('nope') }, groups)).toEqual(['deadline']);
  });
});
