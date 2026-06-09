import { describe, it, expect } from 'vitest';
import { josa } from '@/lib/utils/josa';

describe('josa', () => {
  it('받침 없는 이름 뒤에는 를/와를 붙인다', () => {
    expect(josa('토스페이먼츠', '을/를')).toBe('토스페이먼츠를');
    expect(josa('토스페이먼츠', '와/과')).toBe('토스페이먼츠와');
  });

  it('받침 있는 이름 뒤에는 을/과를 붙인다', () => {
    expect(josa('한국정보통신', '을/를')).toBe('한국정보통신을');
    expect(josa('한국정보통신', '와/과')).toBe('한국정보통신과');
  });

  it('영문/숫자로 끝나면 받침 없음으로 처리한다(가독성 우선)', () => {
    expect(josa('KG이니시스', '을/를')).toBe('KG이니시스를'); // 스: 받침 없음
    expect(josa('PayX', '을/를')).toBe('PayX를'); // 비한글 종료 → 받침 없음 취급
  });
});
