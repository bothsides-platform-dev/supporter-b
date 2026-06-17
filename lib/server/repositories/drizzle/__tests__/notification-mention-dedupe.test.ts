import { describe, it, expect, beforeEach } from 'vitest';
import { createPgliteDb } from '@/lib/db/client-pglite';
import type { PgliteDB } from '@/lib/db/client-pglite';
import { DrizzleNotificationRepository } from '../notification';
import { seedUser } from './_seed';
import type { Notification } from '@/lib/types/notification';

let db: PgliteDB;
beforeEach(async () => {
  db = await createPgliteDb();
});

describe('DrizzleNotificationRepository.hasPendingTeamMentionNotification', () => {
  it('같은 window 내 team_chat.mention 알림이 있으면 true, 없으면 false', async () => {
    const repo = new DrizzleNotificationRepository(db);
    const u = await seedUser(db);
    const rfpId = '33333333-3333-4333-8333-333333333333';
    const windowStart = new Date('2026-06-14T00:00:00Z');

    expect(await repo.hasPendingTeamMentionNotification(u.id, rfpId, windowStart)).toBe(false);

    const notif: Notification = {
      id: '44444444-4444-4444-8444-444444444444',
      userId: u.id,
      workspaceId: null,
      type: 'team_chat.mention',
      title: '언급',
      body: 'x',
      channel: 'inapp',
      status: 'pending', // 저장 시 'queued' 로 매핑
      linkUrl: `/messages?t=${rfpId}`,
      createdAt: '2026-06-14T00:01:00Z',
    };
    await repo.save(notif);

    expect(await repo.hasPendingTeamMentionNotification(u.id, rfpId, windowStart)).toBe(true);
    // team_chat.message 일반 알림 dedupe 와 섞이지 않는다.
    expect(await repo.hasPendingTeamNotification(u.id, rfpId, windowStart)).toBe(false);
  });
});
