import { describe, it, expect, afterEach } from 'vitest';

import { isMasterEmail, masterOAuthEnabled } from '@/lib/auth/master-allowlist';

const ORIGINAL = process.env.MASTER_ACCOUNT_EMAILS;
const ORIGINAL_FLAG = process.env.NEXT_PUBLIC_MASTER_OAUTH_ENABLED;
const ORIGINAL_GID = process.env.AUTH_GOOGLE_ID;
const ORIGINAL_GSECRET = process.env.AUTH_GOOGLE_SECRET;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.MASTER_ACCOUNT_EMAILS;
  else process.env.MASTER_ACCOUNT_EMAILS = ORIGINAL;
  if (ORIGINAL_FLAG === undefined) delete process.env.NEXT_PUBLIC_MASTER_OAUTH_ENABLED;
  else process.env.NEXT_PUBLIC_MASTER_OAUTH_ENABLED = ORIGINAL_FLAG;
  if (ORIGINAL_GID === undefined) delete process.env.AUTH_GOOGLE_ID;
  else process.env.AUTH_GOOGLE_ID = ORIGINAL_GID;
  if (ORIGINAL_GSECRET === undefined) delete process.env.AUTH_GOOGLE_SECRET;
  else process.env.AUTH_GOOGLE_SECRET = ORIGINAL_GSECRET;
});

describe('isMasterEmail', () => {
  it('단일 allowlist 이메일과 일치하면 true', () => {
    process.env.MASTER_ACCOUNT_EMAILS = 'help@support-b.com';
    expect(isMasterEmail('help@support-b.com')).toBe(true);
  });

  it('쉼표로 구분된 여러 이메일 각각을 허용한다 (복수 운영자)', () => {
    process.env.MASTER_ACCOUNT_EMAILS = 'help@support-b.com,ops@support-b.com,ceo@support-b.com';
    expect(isMasterEmail('help@support-b.com')).toBe(true);
    expect(isMasterEmail('ops@support-b.com')).toBe(true);
    expect(isMasterEmail('ceo@support-b.com')).toBe(true);
  });

  it('대소문자를 무시하고 매칭한다', () => {
    process.env.MASTER_ACCOUNT_EMAILS = 'Help@Supporter-B.com';
    expect(isMasterEmail('help@support-b.com')).toBe(true);
    expect(isMasterEmail('HELP@SUPPORTER-B.COM')).toBe(true);
  });

  it('이메일 사이 공백을 정규화한다', () => {
    process.env.MASTER_ACCOUNT_EMAILS = '  help@support-b.com ,  ops@support-b.com  ';
    expect(isMasterEmail('ops@support-b.com')).toBe(true);
  });

  it('목록에 없는 이메일은 false', () => {
    process.env.MASTER_ACCOUNT_EMAILS = 'help@support-b.com';
    expect(isMasterEmail('intruder@gmail.com')).toBe(false);
  });

  it('환경변수 미설정이면 모두 false', () => {
    delete process.env.MASTER_ACCOUNT_EMAILS;
    expect(isMasterEmail('help@support-b.com')).toBe(false);
  });

  it('환경변수가 빈 문자열이면 모두 false', () => {
    process.env.MASTER_ACCOUNT_EMAILS = '';
    expect(isMasterEmail('help@support-b.com')).toBe(false);
  });

  it('빈 이메일 입력은 false (allowlist에 빈 항목이 있어도)', () => {
    process.env.MASTER_ACCOUNT_EMAILS = 'help@support-b.com, ,';
    expect(isMasterEmail('')).toBe(false);
    expect(isMasterEmail('   ')).toBe(false);
  });
});

describe('masterOAuthEnabled', () => {
  it('NEXT_PUBLIC 플래그=true이고 AUTH_GOOGLE_ID·SECRET이 모두 설정되면 true', () => {
    process.env.NEXT_PUBLIC_MASTER_OAUTH_ENABLED = 'true';
    process.env.AUTH_GOOGLE_ID = 'gid.apps.googleusercontent.com';
    process.env.AUTH_GOOGLE_SECRET = 'gsecret';
    expect(masterOAuthEnabled()).toBe(true);
  });

  it('플래그=true지만 AUTH_GOOGLE_ID가 없으면 false (죽은 버튼 방지)', () => {
    process.env.NEXT_PUBLIC_MASTER_OAUTH_ENABLED = 'true';
    delete process.env.AUTH_GOOGLE_ID;
    process.env.AUTH_GOOGLE_SECRET = 'gsecret';
    expect(masterOAuthEnabled()).toBe(false);
  });

  it('플래그=true·ID만 있고 AUTH_GOOGLE_SECRET이 없으면 false (반쪽 설정 → Configuration 에러 예방)', () => {
    process.env.NEXT_PUBLIC_MASTER_OAUTH_ENABLED = 'true';
    process.env.AUTH_GOOGLE_ID = 'gid.apps.googleusercontent.com';
    delete process.env.AUTH_GOOGLE_SECRET;
    expect(masterOAuthEnabled()).toBe(false);
  });

  it('플래그가 미설정/다른 값이면 (Google 클라이언트가 완비돼도) false', () => {
    process.env.AUTH_GOOGLE_ID = 'gid.apps.googleusercontent.com';
    process.env.AUTH_GOOGLE_SECRET = 'gsecret';
    delete process.env.NEXT_PUBLIC_MASTER_OAUTH_ENABLED;
    expect(masterOAuthEnabled()).toBe(false);
    process.env.NEXT_PUBLIC_MASTER_OAUTH_ENABLED = '1';
    expect(masterOAuthEnabled()).toBe(false);
  });
});
