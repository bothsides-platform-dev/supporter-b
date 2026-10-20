import { afterEach, expect, it, vi } from 'vitest';
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
  await sendGuestEvent(d, 'completed', []);
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


afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.useRealTimers(); });
it('omits unfinished input and attaches current Clarity metadata with searchable milestones', async () => {
  const request = vi.fn(async () => new Response(null, { status: 204 }));
  const calls: unknown[][] = [];
  vi.stubGlobal('fetch', request);
  vi.stubGlobal('window', Object.assign(new EventTarget(), { clarity: (...args: unknown[]) => {
    calls.push(args);
    if (args[0] === 'metadata') (args[1] as (data: unknown) => void)({ projectId: 'xiq81e87yn', userId: 'user123', sessionId: 'sess456' });
  } }));
  const draft = createGuestDraft();
  draft.data.websiteUrl = 'e';
  await sendGuestEvent(draft, 'started', []);
  const body = JSON.parse((request.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
  expect(body.website).toBeUndefined();
  expect(body.clarity).toEqual({ userId: 'user123', sessionId: 'sess456' });
  expect(calls).toContainEqual(['set', 'guest_rfp_draft', draft.id]);
  expect(calls).toContainEqual(['event', 'guest_rfp_started']);
});
it('sends once without a replay when Clarity never loads; ignores late metadata', async () => {
  vi.useFakeTimers();
  const request = vi.fn(async () => new Response(null, { status: 204 }));
  let callback: (data: unknown) => void = () => {};
  vi.stubGlobal('fetch', request);
  vi.stubGlobal('window', Object.assign(new EventTarget(), { clarity: (...args: unknown[]) => {
    if (args[0] === 'metadata') callback = args[1] as typeof callback;
  } }));
  const pending = sendGuestEvent(createGuestDraft(), 'started', []);
  await vi.advanceTimersByTimeAsync(1500);
  await pending;
  expect(request).toHaveBeenCalledTimes(1);
  callback({ projectId: 'xiq81e87yn', userId: 'u', sessionId: 's' });
  await vi.runAllTimersAsync();
  expect(request).toHaveBeenCalledTimes(1);
  const body = JSON.parse((request.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
  expect(body.clarity).toBeUndefined();
});
it('still delivers if Clarity throws or returns unsafe metadata', async () => {
  const request = vi.fn(async () => new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', request);
  vi.stubGlobal('window', Object.assign(new EventTarget(), { clarity: () => { throw new Error('blocked'); } }));
  await sendGuestEvent(createGuestDraft(), 'started', []);
  expect(request).toHaveBeenCalledTimes(1);
  vi.stubGlobal('window', Object.assign(new EventTarget(), { clarity: (...args: unknown[]) => {
    if (args[0] === 'metadata') (args[1] as (data: unknown) => void)({ projectId: 'other', userId: 'u', sessionId: 's' });
  } }));
  await sendGuestEvent(createGuestDraft(), 'completed', []);
  expect(request).toHaveBeenCalledTimes(2);
  const body = JSON.parse((request.mock.calls[1] as unknown as [string, RequestInit])[1].body as string);
  expect(body.clarity).toBeUndefined();
});


it('flushes on page exit before Clarity loads and never resends when metadata arrives', async () => {
  vi.useFakeTimers();
  const request = vi.fn(async () => new Response(null, { status: 204 }));
  let callback: (data: unknown) => void = () => {};
  const browser = Object.assign(new EventTarget(), { clarity: (...args: unknown[]) => {
    if (args[0] === 'metadata') callback = args[1] as typeof callback;
  } });
  vi.stubGlobal('window', browser);
  vi.stubGlobal('fetch', request);
  const pending = sendGuestEvent(createGuestDraft(), 'started', []);
  expect(request).not.toHaveBeenCalled();
  browser.dispatchEvent(new Event('pagehide'));
  expect(request).toHaveBeenCalledTimes(1);
  expect((request.mock.calls[0] as unknown as [string, RequestInit])[1].keepalive).toBe(true);
  callback({ projectId: 'xiq81e87yn', userId: 'u', sessionId: 's' });
  await pending;
  await vi.runAllTimersAsync();
  browser.dispatchEvent(new Event('pagehide'));
  expect(request).toHaveBeenCalledTimes(1);
});

it('keeps Clarity milestone tags when Slack uses the threaded collector', async () => {
  const { guestJourney } = await import('@/lib/guest-rfp/journey-client');
  const draft = createGuestDraft();
  vi.stubEnv('NEXT_PUBLIC_GUEST_RFP_SLACK_THREADS_ENABLED', 'true');
  vi.spyOn(guestJourney, 'start').mockResolvedValue(true);
  vi.spyOn(guestJourney, 'selected').mockReturnValue({ draftId: draft.id, createdAt: Date.now() });
  vi.spyOn(guestJourney, 'flush').mockResolvedValue();
  const calls: unknown[][] = [];
  vi.stubGlobal('window', Object.assign(new EventTarget(), { clarity: (...args: unknown[]) => {
    calls.push(args); if (args[0] === 'metadata') (args[1] as (v: unknown) => void)({});
  } }));
  await sendGuestEvent(draft, 'started', []); await sendGuestEvent(draft, 'completed', []);
  expect(calls).toContainEqual(['event', 'guest_rfp_started']);
  expect(calls).toContainEqual(['event', 'guest_rfp_completed']);
});
