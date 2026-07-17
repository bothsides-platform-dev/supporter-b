import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isEContractVisible } from '../e-contract';

// 레포 루트 기준 상대 경로. 마스터 게이트를 판정하는 모든 RSC 진입점(nav 노출 +
// 각 페이지 게이트 + 딜룸 카드 게이트 스레딩 지점)은 isEContractVisible() 을 참조해야 한다.
const SURFACES = [
  'app/(app)/layout.tsx',
  'app/(app)/contracts/page.tsx',
  'app/(app)/contracts/[id]/page.tsx',
  'app/(app)/contracts/new/page.tsx',
  'app/(app)/contract-templates/page.tsx',
  'app/(app)/inbox/[rfpId]/page.tsx',
  'app/(app)/inbox/@modal/(.)[rfpId]/page.tsx',
  'app/(app)/rfp/[id]/page.tsx',
  'app/(app)/rfp/@modal/(.)[id]/page.tsx',
];

function readSurface(rel: string): string {
  // 이 테스트 파일은 lib/features/__tests__/ → 레포 루트는 세 단계 위.
  return readFileSync(resolve(__dirname, '../../..', rel), 'utf8');
}

describe('e-contract 마스터 게이트 — 드리프트 가드', () => {
  for (const rel of SURFACES) {
    it(`${rel} 가 isEContractVisible 을 참조한다`, () => {
      expect(readSurface(rel)).toContain('isEContractVisible');
    });
  }
});

describe('isEContractVisible', () => {
  const ORIGINAL = process.env.E_CONTRACT_ALL;

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.E_CONTRACT_ALL;
    else process.env.E_CONTRACT_ALL = ORIGINAL;
  });

  it('isMaster=true 면 env 설정과 무관하게 true', () => {
    delete process.env.E_CONTRACT_ALL;
    expect(isEContractVisible({ isMaster: true })).toBe(true);
  });

  it('isMaster=false 이고 E_CONTRACT_ALL 미설정이면 false', () => {
    delete process.env.E_CONTRACT_ALL;
    expect(isEContractVisible({ isMaster: false })).toBe(false);
  });

  it("E_CONTRACT_ALL='1' 이면 isMaster=false 여도 true", () => {
    process.env.E_CONTRACT_ALL = '1';
    expect(isEContractVisible({ isMaster: false })).toBe(true);
  });

  it("E_CONTRACT_ALL 이 '1' 이외 값이면 무시된다", () => {
    process.env.E_CONTRACT_ALL = 'true';
    expect(isEContractVisible({ isMaster: false })).toBe(false);
  });
});
