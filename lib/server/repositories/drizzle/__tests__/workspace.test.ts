import { describe, expect, it, beforeEach } from 'vitest';
import { createPgliteDb } from '@/lib/db/client-pglite';
import { DrizzleWorkspaceRepository } from '../workspace';
import { seedPgWorkspace, seedUser, seedMembership } from './_seed';

describe('DrizzleWorkspaceRepository', () => {
  let repo: DrizzleWorkspaceRepository;
  let db: Awaited<ReturnType<typeof createPgliteDb>>;

  beforeEach(async () => {
    db = await createPgliteDb();
    repo = new DrizzleWorkspaceRepository(db);
  });

  it('findById hydrates members and biz profile when present', async () => {
    const ws = await seedPgWorkspace(db, '서포터 B 페이');
    const u = await seedUser(db, { email: 'a@toss.im' });
    await seedMembership(db, ws.id, u.id, 'admin');
    const fetched = await repo.findById(ws.id);
    expect(fetched).toBeDefined();
    expect(fetched!.type).toBe('pg');
    expect(fetched!.members[0].role).toBe('admin');
  });

  it('findById returns undefined for unknown id', async () => {
    expect(await repo.findById('00000000-0000-0000-0000-000000000000')).toBeUndefined();
  });

  it('findByShareToken hydrates the workspace for a known token', async () => {
    const ws = await seedPgWorkspace(db, '서포터 B 페이');
    const seeded = await repo.findById(ws.id);
    const fetched = await repo.findByShareToken(seeded!.shareToken);
    expect(fetched).toBeDefined();
    expect(fetched!.id).toBe(ws.id);
    expect(fetched!.shareToken).toBe(seeded!.shareToken);
  });

  it('findByShareToken returns undefined for unknown token', async () => {
    expect(await repo.findByShareToken('no-such-token')).toBeUndefined();
  });
});
