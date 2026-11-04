import { describe, expect, it } from 'vitest';
import {
  evaluateRecommendation,
  policyCandidateIds,
  resolveCurrentPgs,
  resolveIndustrySelection,
  type RecommendationFacts,
} from '../pg-recommendation-rules';

const group = '10000000-0000-4000-8000-000000000001';
const primary = '20000000-0000-4000-8000-000000000001';
const fallback = '20000000-0000-4000-8000-000000000002';
const legacy = (pgWorkspaceId: string) => ({ pgWorkspaceId, reason: '사업 조건 상담', feeMin: null, feeMax: null, feeNote: '' });
const tiered = (pgWorkspaceId: string) => ({
  pgWorkspaceId, reason: '사업 조건 상담', feeNote: '부가세 별도',
  feesByTier: { sole: 1.1, sme1: 1.3, sme2: 1.5, sme3: 1.7, general: 2.0 },
});
const policy = (risk: string, ids: string[]) => ({ risk, candidates: ids.map(legacy) });
const activePgs = [{ id: primary, name: '업종 PG' }, { id: fallback, name: '기본 PG' }];
const facts = (overrides: Partial<RecommendationFacts> = {}): RecommendationFacts => ({
  groupId: group,
  group: { name: '의류', policy: null },
  customName: undefined,
  defaultPolicy: policy('gray', [fallback]),
  activePgs,
  merchantTier: null,
  currentPgs: [],
  previousPgIds: [],
  includeTestPg: false,
  ...overrides,
});
const ids = (facts: RecommendationFacts) => evaluateRecommendation(facts).candidates.map((c) => c.pgWorkspaceId);

describe('evaluateRecommendation', () => {
  it('업종 정책이 없으면 기본 PG를 추가 검토 후보로 추천한다', () => {
    expect(evaluateRecommendation(facts())).toEqual({
      risk: 'gray', industryName: '의류', source: 'default',
      candidates: [{ pgWorkspaceId: fallback, reason: '사업 조건 상담', feeNote: '', merchantTier: null, feeRate: null, name: '기본 PG' }],
    });
  });

  it('업종 후보가 있으면 기본 후보를 섞지 않는다', () => {
    expect(ids(facts({ group: { name: '의류', policy: policy('white', [primary]) } }))).toEqual([primary]);
  });

  it.each(['unconfigured', 'gray', 'white'])('%s 업종에 유효한 후보가 없으면 기본 후보로 이어진다', (risk) => {
    // 비활성 PG 는 활성 목록에 없다 — 업종 후보가 비면 기본 PG 로 이어진다.
    expect(ids(facts({ group: { name: '의류', policy: policy(risk, [primary]) }, activePgs: [activePgs[1]] }))).toEqual([fallback]);
  });

  it('접수 불가 업종과 존재하지 않는 업종은 기본 PG로 우회하지 않는다', () => {
    expect(evaluateRecommendation(facts({ group: { name: '의류', policy: policy('black', [primary]) } })))
      .toEqual({ risk: 'black', industryName: '의류', candidates: [] });
    expect(evaluateRecommendation(facts({ groupId: '10000000-0000-4000-8000-000000000099', group: undefined })))
      .toEqual({ risk: 'unconfigured', industryName: '', candidates: [] });
  });

  it('손상된 Black 정책도 원문의 risk 로 먼저 차단한다', () => {
    expect(evaluateRecommendation(facts({ group: { name: '의류', policy: { risk: 'black', candidates: 'broken' } } })))
      .toEqual({ risk: 'black', industryName: '의류', candidates: [] });
  });

  it('삭제된 등록 업종(그룹 없음, 직접 입력 아님)은 unconfigured 다', () => {
    expect(evaluateRecommendation(facts({ groupId: null, group: undefined, customName: undefined })))
      .toEqual({ risk: 'unconfigured', industryName: '', candidates: [] });
  });

  it('직접 입력 업종은 입력 이름으로 기본 PG(Gray) 를 추천한다', () => {
    expect(evaluateRecommendation(facts({ groupId: null, group: undefined, customName: '직접 업종' })))
      .toMatchObject({ risk: 'gray', industryName: '직접 업종', source: 'default', candidates: [{ pgWorkspaceId: fallback }] });
  });

  it('다음 추천도 기본 후보를 쓰되 이전 상담 PG는 다시 추천하지 않는다', () => {
    const white = facts({ group: { name: '의류', policy: policy('white', [primary]) } });
    expect(ids({ ...white, previousPgIds: [primary] })).toEqual([fallback]);
    expect(ids({ ...white, previousPgIds: [primary, fallback] })).toEqual([]);
  });

  it('기본 후보도 활성 상태와 테스트 PG 숨김을 지킨다', () => {
    const testNamed = facts({ activePgs: [activePgs[0], { id: fallback, name: '테스트 PG' }] });
    expect(ids(testNamed)).toEqual([]);
    expect(ids({ ...testNamed, includeTestPg: true })).toHaveLength(1);
    expect(ids({ ...testNamed, includeTestPg: true, activePgs: [activePgs[0]] })).toEqual([]);
  });

  it('기본 설정이 없거나 손상되었으면 임의의 PG를 선택하지 않는다', () => {
    expect(ids(facts({ defaultPolicy: {} }))).toEqual([]);
    expect(ids(facts({ defaultPolicy: undefined }))).toEqual([]);
    expect(ids(facts({ defaultPolicy: policy('white', [fallback]) }))).toEqual([]);
  });

  it('기존 PG는 업종 후보와 기본 후보에서 ID와 정규화된 이름으로 모두 제외한다', () => {
    const currentPgs = [{ pgWorkspaceId: primary, name: '옛 이름' }, { pgWorkspaceId: null, name: ' 기본   PG ' }];
    expect(ids(facts({ group: { name: '의류', policy: policy('white', [primary]) }, currentPgs }))).toEqual([]);
    expect(ids(facts({ groupId: null, group: undefined, customName: '직접 업종', currentPgs }))).toEqual([]);
  });

  it('등급이 있으면 후보의 등급별 요율을 고르고, 없거나 구형 후보면 null 이다', () => {
    const tieredPolicy = { risk: 'white', candidates: [tiered(primary)] };
    const [withTier] = evaluateRecommendation(facts({ group: { name: '의류', policy: tieredPolicy }, merchantTier: 'sme2' })).candidates;
    expect(withTier).toMatchObject({ pgWorkspaceId: primary, merchantTier: 'sme2', feeRate: 1.5, feeNote: '부가세 별도' });
    const [noTier] = evaluateRecommendation(facts({ group: { name: '의류', policy: tieredPolicy } })).candidates;
    expect(noTier).toMatchObject({ merchantTier: null, feeRate: null });
    const [legacyCandidate] = evaluateRecommendation(facts({ group: { name: '의류', policy: policy('white', [primary]) }, merchantTier: 'sole' })).candidates;
    expect(legacyCandidate).toMatchObject({ merchantTier: 'sole', feeRate: null });
  });
});

describe('resolveIndustrySelection', () => {
  const groups = [
    { id: group, name: '의류', policy: policy('white', [primary]) },
    { id: '10000000-0000-4000-8000-000000000002', name: ' 의류 ', policy: policy('black', []) },
    { id: '10000000-0000-4000-8000-000000000003', name: '식품', policy: null },
  ];

  it('등록 업종 ID 는 존재 여부를 따지지 않고 그대로 둔다', () => {
    expect(resolveIndustrySelection({ industryGroupId: 'any-id' }, groups))
      .toEqual({ groupId: 'any-id', isCustomIndustry: false, customName: undefined });
  });

  it('직접 입력 이름은 정규화해 기존 업종에 대응시키고, 중복 이름이면 Black 을 우선한다', () => {
    expect(resolveIndustrySelection({ customIndustryName: '  의류' }, groups))
      .toEqual({ groupId: '10000000-0000-4000-8000-000000000002', isCustomIndustry: false, customName: undefined });
    expect(resolveIndustrySelection({ customIndustryName: '식품' }, groups))
      .toEqual({ groupId: '10000000-0000-4000-8000-000000000003', isCustomIndustry: false, customName: undefined });
  });

  it('대응하는 업종이 없으면 직접 입력 업종으로 남긴다', () => {
    expect(resolveIndustrySelection({ customIndustryName: '수제 가구' }, groups))
      .toEqual({ groupId: null, isCustomIndustry: true, customName: '수제 가구' });
  });
});

describe('resolveCurrentPgs', () => {
  const directory = [{ id: primary, name: '업종 PG' }, { id: fallback, name: '기본 PG' }];

  it('ID 는 검증하고 표시명은 서버 이름으로 교체하며, 이름만 있으면 정규화 일치로 ID 를 찾는다', () => {
    expect(resolveCurrentPgs([{ pgWorkspaceId: primary, name: '위조' }, { pgWorkspaceId: null, name: ' 기본  PG ' }], directory))
      .toEqual({ ok: true, currentPgs: [{ pgWorkspaceId: primary, name: '업종 PG' }, { pgWorkspaceId: fallback, name: '기본 PG' }] });
    expect(resolveCurrentPgs([{ pgWorkspaceId: group, name: '위조' }], directory)).toEqual({ ok: false, error: 'INVALID_CURRENT_PGS' });
  });

  it('목록에 없는 이름은 공백만 정리해 보존하고 중복은 한 번만 남긴다', () => {
    expect(resolveCurrentPgs([{ pgWorkspaceId: null, name: ' 미등록   PG ' }, { pgWorkspaceId: null, name: '미등록 PG' }], directory))
      .toEqual({ ok: true, currentPgs: [{ pgWorkspaceId: null, name: '미등록 PG' }] });
    expect(resolveCurrentPgs([], directory)).toEqual({ ok: true, currentPgs: [] });
  });

  it('재시도는 목록이 바뀌었어도 저장분의 신원을 유지한다', () => {
    const retained = [{ pgWorkspaceId: primary, name: '옛 업종 PG' }, { pgWorkspaceId: null, name: '사라진 PG' }];
    expect(resolveCurrentPgs([{ pgWorkspaceId: primary, name: '위조' }, { pgWorkspaceId: null, name: '사라진  PG' }], [], retained))
      .toEqual({ ok: true, currentPgs: retained });
  });
});

describe('policyCandidateIds', () => {
  it('정책 원문들의 후보 id 를 합치고 손상된 원문은 건너뛴다', () => {
    expect(policyCandidateIds(policy('white', [primary]), policy('gray', [fallback, primary]), {}, undefined).sort())
      .toEqual([primary, fallback].sort());
  });
});
