import { describe, expect, it, vi } from 'vitest';

// Next resolves `server-only` through its own alias; vitest has no such alias.
vi.mock('server-only', () => ({}));

import { resolveAxiomWebVitalsTarget } from '../axiom-server';

// web-vitals 는 next-axiom 시절 `NEXT_PUBLIC_AXIOM_* || AXIOM_*` 순서로 토큰·데이터셋을
// 골랐다(next-axiom platform/generic.js). 같은 순서를 지켜야 이전 후에도 같은 데이터셋에
// 쌓인다 — 순서를 뒤집으면 운영 로그(pino, AXIOM_DATASET) 데이터셋으로 조용히 옮겨간다.
describe('resolveAxiomWebVitalsTarget', () => {
  it('NEXT_PUBLIC_AXIOM_* 가 있으면 그것을 쓴다 (AXIOM_* 보다 우선)', () => {
    expect(
      resolveAxiomWebVitalsTarget({
        NEXT_PUBLIC_AXIOM_TOKEN: 'xaat-public',
        NEXT_PUBLIC_AXIOM_DATASET: 'web-vitals',
        AXIOM_TOKEN: 'xaat-server',
        AXIOM_DATASET: 'ops-logs',
      }),
    ).toEqual({ token: 'xaat-public', dataset: 'web-vitals' });
  });

  it('NEXT_PUBLIC_AXIOM_* 가 없으면 AXIOM_* 로 폴백한다', () => {
    expect(
      resolveAxiomWebVitalsTarget({ AXIOM_TOKEN: 'xaat-server', AXIOM_DATASET: 'ops-logs' }),
    ).toEqual({ token: 'xaat-server', dataset: 'ops-logs' });
  });

  it('빈 문자열은 미설정으로 본다', () => {
    expect(
      resolveAxiomWebVitalsTarget({
        NEXT_PUBLIC_AXIOM_TOKEN: '',
        NEXT_PUBLIC_AXIOM_DATASET: '',
        AXIOM_TOKEN: 'xaat-server',
        AXIOM_DATASET: 'ops-logs',
      }),
    ).toEqual({ token: 'xaat-server', dataset: 'ops-logs' });
  });

  it.each([
    ['아무것도 없음', {}],
    ['토큰만 있음', { AXIOM_TOKEN: 'xaat-server' }],
    ['데이터셋만 있음', { NEXT_PUBLIC_AXIOM_DATASET: 'web-vitals' }],
  ])('토큰과 데이터셋이 둘 다 없으면(%s) null', (_label, env) => {
    expect(resolveAxiomWebVitalsTarget(env)).toBeNull();
  });
});
