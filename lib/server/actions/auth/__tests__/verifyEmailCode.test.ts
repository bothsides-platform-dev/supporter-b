import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

import { outboxEntries } from '@/lib/db/schema';
import { signupEmailAction } from '../signupEmailAction';
import { verifyEmailCodeAction } from '../verifyEmailCodeAction';
import { setupActionEnv, teardownActionEnv } from './_setup';
import type { PgliteDB } from '@/lib/db/client-pglite';

/**
 * signupEmailAction 이 HTML 에 심어 놓은 6자리 코드를 추출한다.
 * 템플릿이 "코드: XXXXXX" 형태로 렌더링한다고 가정 — 실제 템플릿 작성 전
 * 테스트는 RED 상태가 되어야 함.
 */
function codeFromHtml(html: string): string {
  return html.match(/letter-spacing:[^>]+>\s*(\d{6})\s*</)?.[1] ?? '';
}

let db: PgliteDB;

describe('verifyEmailCodeAction', () => {
  beforeEach(async () => {
    db = await setupActionEnv();
  });
  afterEach(teardownActionEnv);

  it('returns ok=true and email when code matches', async () => {
    await signupEmailAction({ email: 'code@example.com', workspaceType: 'buyer' });

    const [row] = await db
      .select({ html: outboxEntries.html })
      .from(outboxEntries)
      .where(eq(outboxEntries.toAddr, 'code@example.com'))
      .limit(1);
    const code = codeFromHtml(row.html);
    expect(code).toMatch(/^\d{6}$/);

    const r = await verifyEmailCodeAction({ email: 'code@example.com', code });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.email).toBe('code@example.com');
  });

  it('returns error TOKEN_INVALID_OR_EXPIRED for wrong code', async () => {
    await signupEmailAction({ email: 'code2@example.com' });
    const r = await verifyEmailCodeAction({ email: 'code2@example.com', code: '000000' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('TOKEN_INVALID_OR_EXPIRED');
  });

  it('returns error INVALID_INPUT for non-6-digit code', async () => {
    const r = await verifyEmailCodeAction({ email: 'code3@example.com', code: 'abc' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('INVALID_INPUT');
  });

  it('second use of same code returns error (single-use)', async () => {
    await signupEmailAction({ email: 'code4@example.com' });

    const [row] = await db
      .select({ html: outboxEntries.html })
      .from(outboxEntries)
      .where(eq(outboxEntries.toAddr, 'code4@example.com'))
      .limit(1);
    const code = codeFromHtml(row.html);

    const first = await verifyEmailCodeAction({ email: 'code4@example.com', code });
    expect(first.ok).toBe(true);
    const second = await verifyEmailCodeAction({ email: 'code4@example.com', code });
    expect(second.ok).toBe(false);
  });

  it('returns inviteToken from meta when present', async () => {
    await signupEmailAction({ email: 'code5@example.com', inviteToken: 'INV-CODE-42' });

    const [row] = await db
      .select({ html: outboxEntries.html })
      .from(outboxEntries)
      .where(eq(outboxEntries.toAddr, 'code5@example.com'))
      .limit(1);
    const code = codeFromHtml(row.html);

    const r = await verifyEmailCodeAction({ email: 'code5@example.com', code });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.inviteToken).toBe('INV-CODE-42');
  });
});
