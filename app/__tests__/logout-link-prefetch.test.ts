/**
 * @vitest-environment node
 */
// /logout 을 가리키는 next/link 는 프리페치를 끈다. GET /logout 은 프리페치 요청을
// 무시하지만(app/logout/route.ts), 그 요청도 Auth.js 프록시를 지나며 요청에 실린 세션
// 쿠키를 재서명한 Set-Cookie 를 받는다. 쿠키가 교체되기 직전에 떠난 프리페치는 응답이
// 늦게 도착하면 폐기된 옛 토큰을 되살린다(이메일 인증 복귀 e2e). 링크가 아예 요청을
// 보내지 않아야 그 경합이 사라진다.
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');
const SCAN_DIRS = ['app', 'components'];

function sourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__' && entry.name !== 'node_modules') files.push(...sourceFiles(path));
    } else if (entry.name.endsWith('.tsx')) {
      files.push(path);
    }
  }
  return files;
}

function hrefTargetsLogout(attr: ts.JsxAttribute): boolean {
  const init = attr.initializer;
  if (!init) return false;
  const value = ts.isJsxExpression(init) ? init.expression : init;
  if (!value) return false;
  if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) return /^\/logout(\?|$)/.test(value.text);
  if (ts.isTemplateExpression(value)) return /^\/logout(\?|$)/.test(value.head.text);
  return false;
}

function disablesPrefetch(attr: ts.JsxAttribute | undefined): boolean {
  const init = attr?.initializer;
  return !!init && ts.isJsxExpression(init) && init.expression?.kind === ts.SyntaxKind.FalseKeyword;
}

function logoutLinks(): { where: string; prefetchDisabled: boolean }[] {
  const found: { where: string; prefetchDisabled: boolean }[] = [];
  for (const file of SCAN_DIRS.flatMap((d) => sourceFiles(resolve(ROOT, d)))) {
    const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (node: ts.Node) => {
      if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(source) === 'Link') {
        const attrs = node.attributes.properties.filter(ts.isJsxAttribute);
        const named = (name: string) => attrs.find((a) => a.name.getText(source) === name);
        const href = named('href');
        if (href && hrefTargetsLogout(href)) {
          const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
          found.push({ where: `${file.slice(ROOT.length + 1)}:${line + 1}`, prefetchDisabled: disablesPrefetch(named('prefetch')) });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return found;
}

describe('/logout 링크', () => {
  it('모든 next/link 가 prefetch={false} 로 요청을 보내지 않는다', () => {
    const links = logoutLinks();

    // 스캐너가 아무것도 못 찾으면 이 가드는 공허하게 통과한다 — 알려진 두 링크를 고정한다.
    expect(links.map((l) => l.where.replace(/:\d+$/, ''))).toEqual(
      expect.arrayContaining(['app/quote-start/page.tsx', 'components/pending-approval/EmailVerifySection.tsx']),
    );
    expect(links.filter((l) => !l.prefetchDisabled).map((l) => l.where)).toEqual([]);
  });
});
