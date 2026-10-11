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
