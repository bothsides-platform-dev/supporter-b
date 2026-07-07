import { describe, expect, it } from 'vitest';

import { isFreeEmailDomain } from '../free-email-domains';

describe('isFreeEmailDomain', () => {
  it.each([
    'kim@gmail.com',
    'kim@googlemail.com',
    'kim@naver.com',
    'kim@hanmail.net',
    'kim@daum.net',
    'kim@kakao.com',
    'kim@nate.com',
    'kim@outlook.com',
    'kim@hotmail.com',
    'kim@live.com',
    'kim@msn.com',
    'kim@yahoo.com',
    'kim@yahoo.co.kr',
    'kim@ymail.com',
    'kim@icloud.com',
    'kim@me.com',
    'kim@mac.com',
    'kim@protonmail.com',
    'kim@proton.me',
    'kim@aol.com',
    'kim@gmx.com',
  ])('무료 도메인이면 true — %s', (email) => {
    expect(isFreeEmailDomain(email)).toBe(true);
  });

  it.each([
    'kim@acme.co.kr',
    'kim@support-b.com',
    'kim@dooray.com',
  ])('회사 도메인이면 false — %s', (email) => {
    expect(isFreeEmailDomain(email)).toBe(false);
  });

  it('대소문자·공백을 정규화해 판별한다', () => {
    expect(isFreeEmailDomain('  Kim@GMAIL.com  ')).toBe(true);
  });

  it('이메일 형식이 아니면 false (경고를 띄우지 않는다)', () => {
    expect(isFreeEmailDomain('')).toBe(false);
    expect(isFreeEmailDomain('kim')).toBe(false);
    expect(isFreeEmailDomain('kim@')).toBe(false);
    expect(isFreeEmailDomain('kim@gmail')).toBe(false);
    expect(isFreeEmailDomain('@gmail.com')).toBe(false);
    expect(isFreeEmailDomain('kim@gmail com')).toBe(false);
  });

  it('입력 도중의 접두 도메인은 매칭하지 않는다', () => {
    expect(isFreeEmailDomain('kim@gmail.c')).toBe(false);
    expect(isFreeEmailDomain('kim@notgmail.com')).toBe(false);
  });
});
