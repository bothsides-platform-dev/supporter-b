import { expect, it } from 'vitest';
import { GuestRfpService } from '../guest-rfp';
it('escapes summaries and claims both milestones once, including failed deliveries', async () => {
  const claimed = new Set<string>();
  const outcomes: string[] = [];
  const messages: string[] = [];
  const repo = {
    claim: async (id: string, event: string) => {
      const key = id + event;
      if (claimed.has(key)) return false;
      claimed.add(key);
      return true;
    },
    finish: async (_id: string, _event: string, result: string) => {
      outcomes.push(result);
    },
  };
  const svc = new GuestRfpService(repo, async ({ text }) => {
    messages.push(text);
    return { ok: false, error: 'offline' };
  });
  const event = {
    draftId: '10000000-0000-4000-8000-000000000001',
    event: 'started' as const,
    website: 'https://example.com',
    title: '<!channel>',
    attachmentCount: 0,
  };
  await Promise.all([
    svc.record(event),
    svc.record(event),
    svc.record({
      ...event,
      event: 'completed',
      industry: '의류',
      contractType: 'new',
    }),
  ]);
  expect(messages).toHaveLength(2);
  expect(messages[0]).toContain('&lt;!channel&gt;');
  expect(outcomes).toEqual(['failed', 'failed']);
  await svc.record(event);
  expect(messages).toHaveLength(2);
});


it('includes a project-pinned Clarity replay link, or an explicit unavailable message', async () => {
  const messages: string[] = [];
  const svc = new GuestRfpService({ claim: async () => true, finish: async () => {} }, async ({ text }) => {
    messages.push(text);
    return { ok: true };
  });
  const event = { draftId: '10000000-0000-4000-8000-000000000001', event: 'started' as const, attachmentCount: 0 };
  await svc.record({ ...event, clarity: { userId: 'user123', sessionId: 'sess456' } });
  await svc.record(event);
  expect(messages[0]).toContain('https://clarity.microsoft.com/player/xiq81e87yn/user123/sess456');
  expect(messages[0]).not.toContain('undefined');
  expect(messages[1]).toContain('Clarity: 세션 링크를 확보하지 못했어요');
});
