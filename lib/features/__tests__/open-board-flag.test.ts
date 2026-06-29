import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { OPEN_BOARD_ENABLED } from '../open-board';

// 레포 루트 기준 상대 경로. 모든 오픈게시판 노출 surface 는 플래그를 참조해야 한다.
const SURFACES = [
  'lib/nav/nav-config.ts',
  'components/home/HomeDashboard.tsx',
  'app/(app)/opportunities/page.tsx',
  'components/shell/CommandPalette.tsx',
  'components/rfp/RfpStep4Review.tsx',
  'components/rfp/RfpBoardVisibilityStatus.tsx',
];

function readSurface(rel: string): string {
  // 이 테스트 파일은 lib/features/__tests__/ → 레포 루트는 세 단계 위.
  return readFileSync(resolve(__dirname, '../../..', rel), 'utf8');
}

describe('open-board kill switch — drift guard', () => {
  it('플래그가 boolean 으로 export 된다', () => {
    expect(typeof OPEN_BOARD_ENABLED).toBe('boolean');
  });

  for (const rel of SURFACES) {
    it(`${rel} 가 OPEN_BOARD_ENABLED 를 참조한다`, () => {
      expect(readSurface(rel)).toContain('OPEN_BOARD_ENABLED');
    });
  }
});
