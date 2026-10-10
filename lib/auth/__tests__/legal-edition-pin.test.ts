/**
 * 게시된 법적 문서 판본 고정 가드.
 *
 * 가입 증빙은 판본 라벨(getSignupConsentDocuments)과 판 번호 없는 URL을 저장한다. 본문을 고치고
 * 판을 올리지 않으면 이미 저장된 동의 기록이 다른 문안을 가리키게 된다(2026-10-08 문의 주소
 * 정정 때 리뷰에서야 발견). 고정 해시는 docs/SIGNUP_CONSENT_ROLLOUT.md 의 게시 소스 SHA-256 표에도
 * 있어야 한다 — 해시를 바꾸려면 런북에 그 사유가 함께 남는다(리뷰에서 보인다).
 *
 * 이 테스트가 실패하면: 본문이 바뀌었으면 판을 올리고 런북에 기록한 뒤 새 판·해시를 적는다.
 * 본문과 무관한 수정(스타일 등)이면 같은 판에 해시만 갱신하고 그 이유와 해시를 런북에 남긴다.
 */
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getSignupConsentDocuments } from '../signup-documents';

const ROOT = join(__dirname, '..', '..', '..');
const RUNBOOK = readFileSync(join(ROOT, 'docs', 'SIGNUP_CONSENT_ROLLOUT.md'), 'utf8');
const PUBLISHED = {
  terms: { version: 'v2', sha256: '33145678e7c14ec4140a51ed96edbd54cf78903f8f905a22c6835706fad082c4' },
  privacy: { version: 'v4', sha256: 'a7656f516f7565c8ec3b09ba0d80d4e1a7ad42d0535040382e875259234e2495' },
  marketing: { version: 'v3', sha256: '5d75264363e5fb9375b002d79d13e91af0ba2431b2d31be206bd540b5537d09c' },
} as const;

describe('published legal editions', () => {
  it.each(Object.entries(PUBLISHED))('%s 본문은 고정된 판본과 일치한다', (doc, { version, sha256 }) => {
    const source = readFileSync(join(ROOT, 'app', 'legal', doc, 'page.tsx'));
    expect(getSignupConsentDocuments()?.[doc as keyof typeof PUBLISHED].version).toBe(version);
    expect(createHash('sha256').update(source).digest('hex')).toBe(sha256);
    expect(RUNBOOK).toContain(sha256);
  });
});
