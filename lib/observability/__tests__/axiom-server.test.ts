import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Next resolves `server-only` through its own alias; vitest has no such alias.
vi.mock('server-only', () => ({}));

import { resolveAxiomWebVitalsTarget } from '../axiom-server';

// /api/axiom 은 익명 호출자가 쓰는 공개 수집 창구다. 그래서 web-vitals 전용 설정
// (NEXT_PUBLIC_AXIOM_TOKEN + NEXT_PUBLIC_AXIOM_DATASET — next-axiom 시절 브라우저가 쓰던 그
// 쌍)이 있을 때만 켜진다. 운영 로그용 AXIOM_* 로 폴백하면 익명 호출자가 장애 조사용 pino
// 데이터셋에 임의 레코드를 쓸 수 있게 된다 — next-axiom 은 이 경우 아예 보내지 않았다.
describe('resolveAxiomWebVitalsTarget', () => {
  it('NEXT_PUBLIC_AXIOM_TOKEN 과 NEXT_PUBLIC_AXIOM_DATASET 이 둘 다 있으면 그것을 쓴다', () => {
    expect(
      resolveAxiomWebVitalsTarget({
        NEXT_PUBLIC_AXIOM_TOKEN: 'xaat-public',
        NEXT_PUBLIC_AXIOM_DATASET: 'web-vitals',
        AXIOM_TOKEN: 'xaat-server',
        AXIOM_DATASET: 'ops-logs',
      }),
    ).toEqual({ token: 'xaat-public', dataset: 'web-vitals' });
  });

  it.each([
    ['운영 로그 설정만 있음', { AXIOM_TOKEN: 'xaat-server', AXIOM_DATASET: 'ops-logs' }],
    ['데이터셋이 운영 로그 쪽에만 있음', { NEXT_PUBLIC_AXIOM_TOKEN: 'xaat-public', AXIOM_DATASET: 'ops-logs' }],
    ['토큰이 운영 로그 쪽에만 있음', { AXIOM_TOKEN: 'xaat-server', NEXT_PUBLIC_AXIOM_DATASET: 'web-vitals' }],
    ['빈 문자열', { NEXT_PUBLIC_AXIOM_TOKEN: '', NEXT_PUBLIC_AXIOM_DATASET: '' }],
    ['아무것도 없음', {}],
  ])('web-vitals 전용 쌍이 갖춰지지 않으면(%s) null — 운영 로그 데이터셋으로 폴백하지 않는다', (_label, env) => {
    expect(resolveAxiomWebVitalsTarget(env)).toBeNull();
  });
});

// 로거는 모듈 스코프에 한 번 만들어 재사용한다 — 매 요청마다 Axiom 클라이언트를 새로
// 만들면 배치가 쪼개진다. 모듈을 새로 불러와 캐시를 비운 상태에서 잰다.
describe('getAxiomWebVitalsLogger', () => {
  const AXIOM_KEYS = [
    'NEXT_PUBLIC_AXIOM_TOKEN',
    'NEXT_PUBLIC_AXIOM_DATASET',
    'AXIOM_TOKEN',
    'AXIOM_DATASET',
  ] as const;

  async function freshModule() {
    vi.resetModules();
    return import('../axiom-server');
  }

  beforeEach(() => {
    for (const key of AXIOM_KEYS) vi.stubEnv(key, '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('web-vitals 전용 설정이 없으면 운영 로그 설정이 있어도 null 이다', async () => {
    vi.stubEnv('AXIOM_TOKEN', 'xaat-server');
    vi.stubEnv('AXIOM_DATASET', 'ops-logs');
    const { getAxiomWebVitalsLogger } = await freshModule();

    expect(getAxiomWebVitalsLogger()).toBeNull();
  });

  it('설정돼 있으면 Logger 를 만들고 이후 호출에는 같은 인스턴스를 돌려준다', async () => {
    vi.stubEnv('NEXT_PUBLIC_AXIOM_TOKEN', 'xaat-public');
    vi.stubEnv('NEXT_PUBLIC_AXIOM_DATASET', 'web-vitals');
    const { getAxiomWebVitalsLogger } = await freshModule();
    const { Logger } = await import('@axiomhq/logging');

    const first = getAxiomWebVitalsLogger();

    expect(first).toBeInstanceOf(Logger);
    expect(getAxiomWebVitalsLogger()).toBe(first);
  });
});
