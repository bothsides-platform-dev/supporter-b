import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CONTRACT_TEMPLATES_ENABLED } from '../contract-templates';

// 레포 루트 기준 상대 경로. 모든 계약서 템플릿 노출 surface 는 플래그를 참조해야 한다.
// 여기 없는 파일은 게이트가 아니라 게이트의 하류다 — 입력(prop)이 비면 스스로 사라진다.
const SURFACES = [
  'lib/nav/nav-config.ts',
  'app/(app)/contract-templates/page.tsx',
  'components/deal-room/pg/PgDealRoomBody.tsx',
];

function readSurface(rel: string): string {
  // 이 테스트 파일은 lib/features/__tests__/ → 레포 루트는 세 단계 위.
  return readFileSync(resolve(__dirname, '../../..', rel), 'utf8');
}

describe('contract-templates kill switch — drift guard', () => {
  it('플래그가 boolean 으로 export 된다', () => {
    expect(typeof CONTRACT_TEMPLATES_ENABLED).toBe('boolean');
  });

  for (const rel of SURFACES) {
    it(`${rel} 가 CONTRACT_TEMPLATES_ENABLED 를 참조한다`, () => {
      expect(readSurface(rel)).toContain('CONTRACT_TEMPLATES_ENABLED');
    });
  }
});
