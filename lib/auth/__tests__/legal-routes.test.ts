import { describe, expect, it } from 'vitest';
import { decideRoute } from '../route-decision';

describe('법적 고지 공개 접근', () => {
  it.each(['/legal/terms', '/legal/privacy', '/legal/marketing'])(
    '%s는 가입 전과 로그인 후 모두 읽을 수 있다', (path) => {
      expect(decideRoute(path, '', false)).toEqual({ kind: 'next' });
      expect(decideRoute(path, '', true)).toEqual({ kind: 'next' });
    },
  );
  it('이름만 legal로 시작하는 다른 경로는 공개하지 않는다', () => {
    expect(decideRoute('/legal-admin', '', false).kind).toBe('redirect');
  });
});
