/**
 * 고객 문의 주소 단일화 가드 (2026-10-08 사용자 결정: contact@support-b.com).
 *
 * 화면·법적 문서에 옛 문의 주소 help@ 가 남으면 사용자가 서로 다른 창구로 흩어진다.
 * 운영 계정 allowlist(MASTER_ACCOUNT_EMAILS)는 로그인 계정이라 문의 주소와 별개이고,
 * 그 테스트들(__tests__)과 env 예시는 사용자 화면이 아니므로 검사하지 않는다.
 *
 * 현재 주소의 단일 출처는 siteConfig.operator.email 이다. 법적 문서는 게시된 문안 그대로
 * 주소를 적으므로 예외로 둔다 — 그 밖에서 주소를 다시 적으면 다음 주소 변경 때 흩어진다.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { siteConfig } from '@/lib/site-config';

const ROOT = join(__dirname, '..', '..');
const SCANNED = ['app', 'components', 'lib'];
const OLD_SUPPORT_EMAIL = 'help@support-b.com';
const LITERAL_ALLOWED = [/^lib\/site-config\.ts$/, /^app\/legal\//];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
    return /\.(tsx?|mdx?)$/.test(name) ? [path] : [];
  });
}

const files = SCANNED.flatMap((dir) => sourceFiles(join(ROOT, dir))).map((path) => relative(ROOT, path));
const containing = (needle: string) => files.filter((path) => readFileSync(join(ROOT, path), 'utf8').includes(needle));

describe('support email', () => {
  it('검사할 소스 파일을 실제로 찾는다', () => {
    expect(files).toContain('components/shell/Footer.tsx');
  });

  it('사용자 화면과 법적 문서는 옛 문의 주소를 쓰지 않는다', () => {
    expect(containing(OLD_SUPPORT_EMAIL)).toEqual([]);
  });

  it('현재 문의 주소는 siteConfig 와 법적 문서에만 적는다', () => {
    const offenders = containing(siteConfig.operator.email).filter((path) => !LITERAL_ALLOWED.some((re) => re.test(path)));
    expect(offenders).toEqual([]);
  });
});
