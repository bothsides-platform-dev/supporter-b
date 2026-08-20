// 조항형 미리보기 렌더 예산 — 사용자별 창 + 전역 백스톱.
//
// 이 리미터가 지키는 것은 공급자 API 가 아니라 **우리 CPU** 다. 미리보기 한 번은
// PDF 문서를 만들고 서브셋 없이 한글 TTF 두 벌(~5MB)을 임베드한다. 에디터는
// 700ms 디바운스로 타이핑이 멎을 때마다 자동으로 이걸 쏘고, 운영은 PM2 단일
// fork 라 흡수할 워커가 없다 — 즉 정상 사용 루프 안에 증폭이 들어 있다.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  consumePreviewRenderBudget,
  PREVIEW_RENDER_LIMIT_PER_USER,
  PREVIEW_RENDER_GLOBAL_LIMIT,
  __resetPreviewRateLimitForTest,
} from '../preview-rate-limit';

beforeEach(() => {
  __resetPreviewRateLimitForTest();
});

describe('consumePreviewRenderBudget', () => {
  it('한도 안에서는 통과한다', () => {
    for (let i = 0; i < PREVIEW_RENDER_LIMIT_PER_USER; i += 1) {
      expect(consumePreviewRenderBudget('u1', 1_000)).toBe('ok');
    }
  });

  it('사용자 창이 차면 그 사용자만 막는다', () => {
    for (let i = 0; i < PREVIEW_RENDER_LIMIT_PER_USER; i += 1) {
      consumePreviewRenderBudget('u1', 1_000);
    }
    expect(consumePreviewRenderBudget('u1', 1_000)).toBe('user');
    // 옆 사용자는 멀쩡해야 한다 — 전역 카운터 하나뿐이면 한 사람이 편집기를 켜 둔
    // 것만으로 다른 PG 담당자 전원의 미리보기가 죽는다.
    expect(consumePreviewRenderBudget('u2', 1_000)).toBe('ok');
  });

  it('창이 지나면 다시 채워진다', () => {
    for (let i = 0; i < PREVIEW_RENDER_LIMIT_PER_USER; i += 1) {
      consumePreviewRenderBudget('u1', 1_000);
    }
    expect(consumePreviewRenderBudget('u1', 1_000)).toBe('user');
    expect(consumePreviewRenderBudget('u1', 1_000 + 60_000)).toBe('ok');
  });

  it('전역 백스톱이 사용자 수와 무관하게 총량을 막는다', () => {
    let allowed = 0;
    // 사용자를 계속 바꾸면 사용자별 창은 절대 안 찬다 — 그때 총량을 지키는 것이 전역이다.
    for (let i = 0; i < PREVIEW_RENDER_GLOBAL_LIMIT + 10; i += 1) {
      if (consumePreviewRenderBudget(`u${i}`, 1_000) === 'ok') allowed += 1;
    }
    expect(allowed).toBe(PREVIEW_RENDER_GLOBAL_LIMIT);
  });
});
