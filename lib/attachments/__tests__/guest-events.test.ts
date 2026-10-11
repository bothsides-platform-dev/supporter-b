import { expect, it, vi } from 'vitest';
import { createGuestDraft } from '@/lib/guest-rfp/draft';
import { sendGuestEvent } from '@/lib/guest-rfp/events';
it('reports allowed summaries only, without full notes, amounts, or attachment bytes', async () => {
  const request = vi.fn(
    async (_url: string, _opts: RequestInit) =>
      new Response(null, { status: 204 }),
  );
  vi.stubGlobal('fetch', request);
  const d = createGuestDraft();
  d.data.websiteUrl = 'https://example.com';
  d.data.memo = 'secret';
  d.data.annualPgVolume = '100000';
  sendGuestEvent(d, 'started', []);
  const body = JSON.parse(request.mock.calls[0][1].body as string);
  expect(Object.keys(body).sort()).toEqual([
    'attachmentCount',
    'draftId',
    'event',
    'website',
  ]);
  expect(JSON.stringify(body)).not.toContain('secret');
  vi.unstubAllGlobals();
});
