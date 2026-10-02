/**
 * Reproduce both save/bind lock orders against the real Drizzle repositories.
 * Run from the repository root:
 *   rtk proxy pnpm exec tsx docs/audits/2026-10-02-agreement-postgres-locks.ts
 *
 * Owns an ephemeral Docker PostgreSQL container, loopback random port and tmpfs.
 * Does not read DATABASE_URL, .env files, or use an existing database/container.
 * Barriers hold transactions; pg_blocking_pids verifies the competing SQL waits.
 * This verifies database serialization only, not SnowSign or service orchestration.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import * as schema from '../../lib/db/schema';
import { generateSchemaDDL } from '../../lib/db/schema-ddl';
import { DrizzleAgreementRepository } from '../../lib/server/repositories/drizzle/agreement';
import { DrizzleSigningContractRepository } from '../../lib/server/repositories/drizzle/signing-contract';
import type { SentContractSnapshot } from '../../lib/types/signing';

const containerName = `bidit-agreement-audit-${Date.now()}-${randomUUID().slice(0, 8)}`;
const image = 'postgres:16-alpine';
const password = randomUUID();
const clients: ReturnType<typeof postgres>[] = [];
let containerCreated = false;

function docker(...args: string[]) {
  return execFileSync('rtk', ['proxy', 'docker', ...args], { encoding: 'utf8' }).trim();
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function main() {
  docker('run', '--detach', '--rm', '--name', containerName,
    '--tmpfs', '/var/lib/postgresql/data', '--publish', '127.0.0.1::5432',
    '--env', 'POSTGRES_USER=agreement_audit', '--env', 'POSTGRES_DB=agreement_audit',
    '--env', `POSTGRES_PASSWORD=${password}`, image);
  containerCreated = true;
  const startupDeadline = Date.now() + 30_000;
  while (true) {
    try {
      // The image briefly starts a socket-only bootstrap server; wait for TCP.
      docker('exec', containerName, 'pg_isready', '-h', '127.0.0.1', '-U', 'agreement_audit', '-d', 'agreement_audit');
      break;
    } catch (error) {
      if (Date.now() > startupDeadline) throw error;
    }
  }
  const binding = docker('port', containerName, '5432/tcp');
  assert.match(binding, /^127\.0\.0\.1:\d+$/);
  const port = Number(binding.split(':')[1]);
  const client = (name: string) => {
    const value = postgres({
      host: '127.0.0.1', port, username: 'agreement_audit', password,
      database: 'agreement_audit', max: 1,
      connection: { application_name: `agreement-audit-${name}`, lock_timeout: 10_000, statement_timeout: 15_000 },
      onnotice: () => {},
    });
    clients.push(value);
    return value;
  };
  const control = client('control');
  const sqlA = client('bind');
  const sqlB = client('save');
  const db = drizzle(control, { schema, casing: 'snake_case' });
  const dbA = drizzle(sqlA, { schema, casing: 'snake_case' });
  const dbB = drizzle(sqlB, { schema, casing: 'snake_case' });
  const version = (await control`select version() as version`)[0].version;
  const isolation = (await control`show transaction_isolation`)[0].transaction_isolation;
  const pidA = Number((await sqlA`select pg_backend_pid() as pid`)[0].pid);
  const pidB = Number((await sqlB`select pg_backend_pid() as pid`)[0].pid);
  console.log(JSON.stringify({ containerName, image, binding, version, isolation }));
  for (const statement of await generateSchemaDDL()) await control.unsafe(statement);

  const userId = randomUUID();
  const workspaceId = randomUUID();
  await db.insert(schema.users).values({ id: userId, email: 'audit@example.invalid', name: 'Audit', passwordHash: '!' });
  await db.insert(schema.workspaces).values({ id: workspaceId, name: 'Audit buyer', type: 'buyer', status: 'active' });
  const partyA = { company: '문서 A', bizNo: '1234567890', address: '서울시 강남구', representative: '담당자' };
  const partiesA = { buyer: partyA, pg: partyA };
  const partiesB = { buyer: { ...partyA, company: '문서 B' }, pg: partyA };
  const preparedA: SentContractSnapshot = {
    _v: 1,
    doc: { _v: 1, title: 'Audit agreement', preamble: '', clauses: [], closing: '' },
    feeRows: [], parties: partiesA,
  };
  async function seed() {
    const rfpId = randomUUID();
    const id = randomUUID();
    const claimedAt = new Date(Date.now() - 10 * 60_000);
    await db.insert(schema.rfps).values({
      id: rfpId, code: `AUDIT-${id}`, title: 'Audit agreement',
      buyerWsId: workspaceId, createdBy: userId, deadline: new Date(),
    });
    await db.insert(schema.signingContracts).values({
      id, rfpId, createdBy: userId, claimedForSendAt: claimedAt, claimedForSendBy: userId,
    });
    await db.insert(schema.signingAgreementDrafts).values({
      contractId: id, revision: 1, parties: partiesA, prepared: preparedA,
    });
    return { id, claimedAt };
  }
  async function waitForLock(waiter: number, blocker: number) {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      const [row] = await control`
        select wait_event_type, wait_event, pg_blocking_pids(pid) as blockers
        from pg_stat_activity where pid = ${waiter}
      `;
      if (row?.wait_event_type === 'Lock' && row.blockers.includes(blocker)) return row;
    }
    throw new Error(`No verified row-lock wait: waiter=${waiter}, blocker=${blocker}`);
  }
  async function inspect(id: string) {
    const [contract] = await db.select().from(schema.signingContracts).where(eq(schema.signingContracts.id, id));
    const [draft] = await db.select().from(schema.signingAgreementDrafts).where(eq(schema.signingAgreementDrafts.contractId, id));
    return { contract, draft };
  }

  // B owns FOR UPDATE first. A's real conditional UPDATE must recheck B's
  // committed token invalidation when the lock is released.
  {
    const { id, claimedAt } = await seed();
    const agreements = new DrizzleAgreementRepository(dbB);
    const signing = new DrizzleSigningContractRepository(dbA);
    const locked = deferred<void>();
    const release = deferred<void>();
    const findDraft = agreements.findDraft.bind(agreements);
    agreements.findDraft = async (...args: Parameters<typeof agreements.findDraft>) => {
      locked.resolve();
      await release.promise;
      return findDraft(...args);
    };
    const save = agreements.saveDraft(id, 1, partiesB);
    await locked.promise;
    const bind = signing.bindDraftRef(id, { origin: 'compose', providerRef: 'provider-a' }, undefined, { claimedAt });
    const wait = await waitForLock(pidA, pidB);
    release.resolve();
    assert.equal(await save, 2);
    assert.equal(await bind, false);
    const state = await inspect(id);
    assert.equal(state.contract.providerRef, null);
    assert.equal(state.contract.claimedForSendAt, null);
    assert.equal(state.contract.claimedForSendBy, null);
    assert.equal(state.draft.revision, 2);
    assert.equal(state.draft.parties.buyer.company, '문서 B');
    assert.equal(state.draft.prepared, null);
    console.log(JSON.stringify({ case: 'save-first', observedWait: wait, saveRevision: 2, bindAccepted: false, ref: null, prepared: null, passed: true }));
  }

  // A's actual bind UPDATE holds the row lock before commit. B's SELECT FOR
  // UPDATE must see the committed ref and reject its stale draft save.
  {
    const { id, claimedAt } = await seed();
    const agreements = new DrizzleAgreementRepository(dbB);
    const signing = new DrizzleSigningContractRepository(dbA);
    const locked = deferred<void>();
    const release = deferred<void>();
    const bind = dbA.transaction(async (tx) => {
      const bound = await signing.bindDraftRef(id, { origin: 'compose', providerRef: 'provider-a' }, tx, { claimedAt });
      assert.equal(bound, true);
      locked.resolve();
      await release.promise;
      return bound;
    });
    await locked.promise;
    const save = agreements.saveDraft(id, 1, partiesB);
    const wait = await waitForLock(pidB, pidA);
    release.resolve();
    assert.equal(await bind, true);
    assert.equal(await save, undefined);
    const state = await inspect(id);
    assert.equal(state.contract.providerRef, 'provider-a');
    assert.equal(state.draft.revision, 1);
    assert.equal(state.draft.parties.buyer.company, '문서 A');
    assert.deepEqual(state.draft.prepared, preparedA);
    console.log(JSON.stringify({ case: 'bind-first', observedWait: wait, bindAccepted: true, saveRejected: true, ref: 'provider-a', prepared: 'document A', passed: true }));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await Promise.allSettled(clients.map((client) => client.end({ timeout: 1 })));
  if (containerCreated) {
    docker('rm', '--force', containerName);
    console.log(JSON.stringify({ containerName, removed: true }));
  }
});
