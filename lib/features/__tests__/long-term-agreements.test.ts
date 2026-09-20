import { expect, it } from 'vitest';
import { LONG_TERM_AGREEMENTS_ENABLED } from '../long-term-agreements';
import { CONTRACT_TEMPLATES_ENABLED } from '../contract-templates';
it('장기합의서를 사용하는 동안 신규 템플릿 선택 표면은 숨긴다', () => {
  expect(LONG_TERM_AGREEMENTS_ENABLED).toBe(true);
  expect(CONTRACT_TEMPLATES_ENABLED).toBe(false);
});
