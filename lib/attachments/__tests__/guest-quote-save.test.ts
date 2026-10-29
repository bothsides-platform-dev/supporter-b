import { afterEach, expect, it, vi } from 'vitest';
import { createGuestDraft } from '@/lib/guest-rfp/draft';
import { newQuoteContext } from '@/lib/guest-rfp/quote-context';
import { saveGuestProgress, saveGuestForSignup } from '@/lib/guest-rfp/server-client';
afterEach(() => vi.unstubAllGlobals());
it('조회 전 저장과 가입 저장을 직렬화하고 문맥과 서버 revision을 이어 전달한다', async () => {
  const draft = createGuestDraft(); draft.quoteContext = { ...newQuoteContext(), companyName: '노온', bizNo: '1248100998' };
  const sent: { op: string; revision?: number; quoteContext?: unknown }[] = [];
  const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string); sent.push(body);
    return Response.json(body.op === 'save' ? { id: draft.id, revision: body.revision + 1 } : { ok: true });
  });
  vi.stubGlobal('fetch', fetcher);
  await Promise.all([saveGuestProgress(draft, () => {}), saveGuestForSignup(draft, () => {})]);
  expect(sent.filter(s => s.op === 'save').map(s => s.revision)).toEqual([0, 1]);
  expect(sent.filter(s => s.op === 'save').every(s => (s.quoteContext as { companyName: string }).companyName === '노온')).toBe(true);
  expect(draft.serverRevision).toBe(2);
});
