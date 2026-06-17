import { describe, it, expect } from 'vitest';
import { PG_STRIP } from '@/lib/server/rfp-detail-loader';
import { HIDEABLE_PG_PATHS } from '@/lib/types/rfp-terms';

// 봉인입찰 fail-closed 보장: hidden_from_pg 에 들어갈 수 있는 모든 경로(쓰기측 SSOT
// HIDEABLE_PG_PATHS)는 반드시 loadPgRfpDetail 의 PG_STRIP strip 핸들러를 가진다.
// 핸들러 없는 숨김 경로는 PG 페이로드로 새므로(fail-open), 새 숨김가능 필드를 추가하고
// PG_STRIP 핸들러를 빼먹으면 이 드리프트 테스트가 빨갛게 잡는다.
describe('PG strip allowlist coverage', () => {
  it('쓰기측이 만들 수 있는 모든 숨김 경로는 PG_STRIP 핸들러를 가진다', () => {
    const handled = new Set(Object.keys(PG_STRIP));
    for (const path of HIDEABLE_PG_PATHS) {
      expect(handled.has(path)).toBe(true);
    }
  });
});
