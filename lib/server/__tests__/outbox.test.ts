// Outbox repo contract tests — in-memory backend.
//
// Step 10 retired `NotificationOutboxAdapter` (its API folded into
// `OutboxRepo`). This file preserves the exact assertions from the old
// adapter test (dedupe / stays pending under maxAttempts / flips failed
// once exceeded / no resend of sent / multi-entry without dedupe) but runs
// them against `InMemoryOutboxRepository`. The Drizzle backend has its own
// pglite-backed test in `lib/server/repositories/drizzle/__tests__/outbox.test.ts`.
//
// Sender is supplied per-test via `flush(sender)` — the new shape — instead
// of being constructor-injected like the old adapter.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { InMemoryOutboxRepository } from '../repositories/in-memory/outbox';
import type { Sender } from '../outbox/types';

const okSender: Sender = async () => ({ ok: true });

describe('InMemoryOutboxRepository (Step 10 swap of NotificationOutboxAdapter)', () => {
  let repo: InMemoryOutboxRepository;

  beforeEach(() => {
    repo = new InMemoryOutboxRepository();
  });

  it('enqueues a notification', async () => {
    await repo.enqueue({
      event: 'auth.verify',
      to: 'u@e.com',
      subject: 'S',
      html: '',
    });
    expect(repo.__pendingSync()).toHaveLength(1);
  });

  it('suppresses duplicate by dedupeKey', async () => {
    const key = 'invite-rfp1-pg1';
    const first = await repo.enqueue({
      event: 'rfp.invited',
      to: 'a@b.com',
      subject: 'X',
      html: '',
      dedupeKey: key,
    });
    const second = await repo.enqueue({
      event: 'rfp.invited',
      to: 'a@b.com',
      subject: 'X',
      html: '',
      dedupeKey: key,
    });
    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(repo.__pendingSync()).toHaveLength(1);
  });

  it('flushes and marks sent on success', async () => {
    await repo.enqueue({
      event: 'auth.verify',
      to: 'u@e.com',
      subject: 'S',
      html: '',
    });
    const { ok, failed } = await repo.flush(okSender);
    expect(ok).toBe(1);
    expect(failed).toBe(0);
    expect(repo.__pendingSync()).toHaveLength(0);
  });

  it('stays pending under maxAttempts on failure', async () => {
    const failSender = vi
      .fn<Sender>()
      .mockResolvedValue({ ok: false, error: 'SMTP err' });
    await repo.enqueue({
      event: 'auth.verify',
      to: 'u@e.com',
      subject: 'S',
      html: '',
      maxAttempts: 3,
    });

    await repo.flush(failSender); // attempt 1
    expect(repo.__pendingSync()).toHaveLength(1);
    expect(repo.__all()[0].attempts).toBe(1);
  });

  it('marks failed after exhausting maxAttempts', async () => {
    const failSender = vi
      .fn<Sender>()
      .mockResolvedValue({ ok: false, error: 'err' });
    await repo.enqueue({
      event: 'auth.reset',
      to: 'u@e.com',
      subject: 'S',
      html: '',
      maxAttempts: 2,
    });

    await repo.flush(failSender);
    await repo.flush(failSender);
    expect(repo.__all()[0].status).toBe('failed');
    expect(repo.__pendingSync()).toHaveLength(0);
  });

  it('does not resend already-sent entries', async () => {
    const sender = vi.fn<Sender>().mockResolvedValue({ ok: true });
    await repo.enqueue({
      event: 'auth.verify',
      to: 'u@e.com',
      subject: 'S',
      html: '',
    });

    await repo.flush(sender);
    await repo.flush(sender);
    expect(sender).toHaveBeenCalledTimes(1);
  });

  it('allows multiple entries with no dedupeKey', async () => {
    await repo.enqueue({
      event: 'auth.verify',
      to: 'a@e.com',
      subject: 'S',
      html: '',
    });
    await repo.enqueue({
      event: 'auth.verify',
      to: 'b@e.com',
      subject: 'S',
      html: '',
    });
    expect(repo.__pendingSync()).toHaveLength(2);
  });
});
