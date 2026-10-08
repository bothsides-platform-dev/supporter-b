/**
 * 고객 문의 주소 단일화 가드 (2026-10-08 사용자 결정: contact@support-b.com).
 *
 * 화면·법적 문서에 옛 문의 주소 help@ 가 남으면 사용자가 서로 다른 창구로 흩어진다.
 * 운영 계정 allowlist(MASTER_ACCOUNT_EMAILS)는 로그인 계정이라 문의 주소와 별개이고,
 * 그 테스트들(lib/auth/**)과 env 예시는 사용자 화면이 아니므로 검사하지 않는다.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const SCANNED = ['app', 'components'];
const OLD_SUPPORT_EMAIL = 'help@support-b.com';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
    return /\.(tsx?|mdx?)$/.test(name) ? [path] : [];
  });
}

describe('support email', () => {
  it('사용자 화면과 법적 문서는 옛 문의 주소를 쓰지 않는다', () => {
    const offenders = SCANNED.flatMap((dir) => sourceFiles(join(ROOT, dir)))
      .filter((path) => readFileSync(path, 'utf8').includes(OLD_SUPPORT_EMAIL))
      .map((path) => relative(ROOT, path));
    expect(offenders).toEqual([]);
  });
});
