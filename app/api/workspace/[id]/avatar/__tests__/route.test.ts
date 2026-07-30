/**
 * @vitest-environment node
 */
// GET/POST/DELETE /api/workspace/[id]/avatar
//
// Coverage:
//   GET:  404 no logo, 200 + bytes + Content-Type + Cache-Control
//   POST: 401 unauthenticated, 403 wrong workspace, 400 empty file,
//         413 too large, 415 mime not allowed, 415 sniff mismatch,
//         200 upserts blob + sets logoUpdatedAt
//   POST admin gate: 403 plain member (+no bytes written), 403 unapproved admin,
//         403 removed member with live token (no membership row), 403 before file
//         validation (member + oversized → 403 not 413), 200 master (no row),
//         403 master with unverified email + 403 master on a non-active workspace
//         (the exemption skips ONLY the membership check, never the gates above it)
//   DELETE: 401 unauthenticated, 403 wrong workspace, 200 deletes blob + clears logoUpdatedAt
//   DELETE admin gate: 403 plain member (+logo still present). unapproved-admin
//         and master branches are covered via the shared guardWrite POST cases.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { workspaces, workspaceLogoBlobs } from '@/lib/db/schema';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { eq } from 'drizzle-orm';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
} from '@/lib/server/repositories/factory';
import {
  seedBuyerWorkspace,
  seedUser,
  seedMembership,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';

const sessionRef: { value: unknown | null } = { value: null };
vi.mock('@/auth', () => ({
  auth: () => Promise.resolve(sessionRef.value),
}));
// 폐기 세션(sv stale) 차단용 — requireSession 미사용 라우트도 동일 기준 적용.
const getDbSessionVersionMock = vi.hoisted(() => vi.fn());
const getDbEmailVerifiedMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/session-version-db', () => ({
  getDbSessionVersion: (...a: unknown[]) => getDbSessionVersionMock(...a),
  getDbEmailVerified: (...a: unknown[]) => getDbEmailVerifiedMock(...a),
}));


let db: PgliteDB;

beforeEach(async () => {
  __resetForTest();
  db = await createPgliteDb();
  sessionRef.value = null;
  getDbSessionVersionMock.mockReset();
  getDbSessionVersionMock.mockResolvedValue(1);
  getDbEmailVerifiedMock.mockReset();
  getDbEmailVerifiedMock.mockResolvedValue(true);

  // Point the repo factory at the pglite handle so the route's repo calls
  // (workspace-logo / workspace) resolve against the test DB.
  await __useDrizzleWithDbForTest(db);
});

afterEach(async () => {
  __resetForTest();
  vi.resetModules();
});

const PNG_HEAD = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_HEAD = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00, 0x00, 0x00]);

function makePng(sizeBytes = 100): Buffer {
  const buf = Buffer.alloc(sizeBytes);
  PNG_HEAD.copy(buf);
  return buf;
}

function makeFile(type: string, body: Buffer): File {
  return new File([new Uint8Array(body)], 'avatar.png', { type });
}

async function callGet(wsId: string) {
  const { GET } = await import('../route');
  return GET(new Request(`http://localhost/api/workspace/${wsId}/avatar`), {
    params: Promise.resolve({ id: wsId }),
  });
}

async function callPost(wsId: string, form: FormData) {
  const { POST } = await import('../route');
  return POST(
    new Request(`http://localhost/api/workspace/${wsId}/avatar`, {
      method: 'POST',
      body: form,
    }),
    { params: Promise.resolve({ id: wsId }) },
  );
}

async function callDelete(wsId: string) {
  const { DELETE } = await import('../route');
  return DELETE(
    new Request(`http://localhost/api/workspace/${wsId}/avatar`, {
      method: 'DELETE',
    }),
    { params: Promise.resolve({ id: wsId }) },
  );
}

// ─── GET ────────────────────────────────────────────────────────────────────

it('GET returns 404 when workspace has no logo', async () => {
  const { id: wsId } = await seedBuyerWorkspace(db);
  const res = await callGet(wsId);
  expect(res.status).toBe(404);
});

it('GET returns image bytes and correct headers when logo exists', async () => {
  const { id: wsId } = await seedBuyerWorkspace(db);
  const bytes = makePng(200);
  await db.insert(workspaceLogoBlobs).values({
    workspaceId: wsId,
    bytes,
    mime: 'image/png',
  });

  const res = await callGet(wsId);
  expect(res.status).toBe(200);
  expect(res.headers.get('Content-Type')).toBe('image/png');
  expect(res.headers.get('Cache-Control')).toContain('public');
  expect(res.headers.get('Cache-Control')).toContain('immutable');
  const body = Buffer.from(await res.arrayBuffer());
  expect(body).toEqual(bytes);
});

// GET 은 인증이 없고 1년 immutable 캐시가 붙는다. 쓰기 경로는 PNG/JPEG 만 통과하지만
// (`ALLOWED_MIMES` + 매직바이트), 저장된 행의 mime 을 그대로 Content-Type 으로
// 되울리면 **과거에 심긴 행**이 그 경계를 우회한다 — 삭제된 `backfill-pg-logos`
// 스크립트가 canonical PG 로고를 SVG 로 심었고, 그 행이 남아 있으면 앱 origin 에서
// 인라인으로 서빙된다(<script> 실행 = 저장형 XSS). nosniff(next.config 의 전역
// SECURITY_HEADERS)는 **명시된** image/svg+xml 을 막지 못하므로, 서빙 타입 자체를
// 쓰기 허용목록으로 좁히는 것이 이 축의 유일한 방어다.
it('GET clamps a stored mime outside the write allowlist (legacy SVG row)', async () => {
  const { id: wsId } = await seedBuyerWorkspace(db);
  const bytes = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');
  await db.insert(workspaceLogoBlobs).values({
    workspaceId: wsId,
    bytes,
    mime: 'image/svg+xml',
  });

  const res = await callGet(wsId);
  expect(res.status).toBe(200);
  // 브라우저가 인라인 실행 가능한 타입으로 해석하지 못하게 한다.
  expect(res.headers.get('Content-Type')).toBe('application/octet-stream');
  // 바이트는 그대로 — 이 게이트는 해석 방식만 좁힌다.
  const body = Buffer.from(await res.arrayBuffer());
  expect(body).toEqual(bytes);
});

it('GET serves image/jpeg unchanged (allowlisted)', async () => {
  const { id: wsId } = await seedBuyerWorkspace(db);
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  await db.insert(workspaceLogoBlobs).values({
    workspaceId: wsId,
    bytes,
    mime: 'image/jpeg',
  });

  const res = await callGet(wsId);
  expect(res.headers.get('Content-Type')).toBe('image/jpeg');
});

// ─── POST ───────────────────────────────────────────────────────────────────

it('POST returns 401 when unauthenticated', async () => {
  const { id: wsId } = await seedBuyerWorkspace(db);
  const form = new FormData();
  form.append('file', makeFile('image/png', makePng()));
  const res = await callPost(wsId, form);
  expect(res.status).toBe(401);
});

it('POST returns 403 when session workspace differs from target', async () => {
  const { id: wsId } = await seedBuyerWorkspace(db);
  const { id: otherWsId } = await seedBuyerWorkspace(db);
  const { id: userId } = await seedUser(db);
  await seedMembership(db, wsId, userId, 'admin');
  sessionRef.value = {
    user: { id: userId, workspaceId: otherWsId, workspaceType: 'buyer' },
  };

  const form = new FormData();
  form.append('file', makeFile('image/png', makePng()));
  const res = await callPost(wsId, form);
  expect(res.status).toBe(403);
});

// ─── admin 게이트 ────────────────────────────────────────────────────────────
// 로고는 워크스페이스 정체성이다 — 이름·사업자번호와 같은 층위이고, 그 둘은
// v0.4.34.0 에서 admin 게이트를 지난다. 로고만 아무 멤버나 바꿀 수 있으면
// 같은 패널의 세 컨트롤 중 하나만 열려 있는 셈이다.

it('POST returns 403 when the caller is a plain member', async () => {
  const { id: wsId } = await seedBuyerWorkspace(db);
  const { id: userId } = await seedUser(db);
  await seedMembership(db, wsId, userId, 'member');
  sessionRef.value = {
    user: { id: userId, email: 'm@x.com', workspaceId: wsId, workspaceType: 'buyer' },
  };

  const form = new FormData();
  form.append('file', makeFile('image/png', makePng()));
  const res = await callPost(wsId, form);
  expect(res.status).toBe(403);
  expect(await res.json()).toMatchObject({ error: 'FORBIDDEN_NOT_ADMIN' });

  // 바이트가 저장되지 않았는지도 확인 — 상태코드만 보면 쓰기 후 거부도 통과한다.
  const rows = await db
    .select()
    .from(workspaceLogoBlobs)
    .where(eq(workspaceLogoBlobs.workspaceId, wsId));
  expect(rows).toHaveLength(0);
});

it('DELETE returns 403 when the caller is a plain member', async () => {
  const { id: wsId } = await seedBuyerWorkspace(db);
  const { id: userId } = await seedUser(db);
  await seedMembership(db, wsId, userId, 'member');
  await db.insert(workspaceLogoBlobs).values({
    workspaceId: wsId,
    bytes: makePng(),
    mime: 'image/png',
  });
  sessionRef.value = {
    user: { id: userId, email: 'm@x.com', workspaceId: wsId, workspaceType: 'buyer' },
  };

  const res = await callDelete(wsId);
  expect(res.status).toBe(403);

  // 로고가 실제로 남아 있어야 한다.
  const rows = await db
    .select()
    .from(workspaceLogoBlobs)
    .where(eq(workspaceLogoBlobs.workspaceId, wsId));
  expect(rows).toHaveLength(1);
});

it('POST returns 403 for a removed member whose token is still alive', async () => {
  // 멤버십 row 가 사라졌지만 JWT 는 살아 있는 경우 — getMembership 이 null 이다.
  // 이게 없으면 `if (membership && !isApprovedAdmin(membership))` 같은 fail-open
  // 변이가 전 스위트를 초록으로 통과한다(다른 거부 테스트는 전부 row 를 심는다).
  const { id: wsId } = await seedBuyerWorkspace(db);
  const { id: userId } = await seedUser(db);
  // 의도적으로 seedMembership 없음. 마스터도 아니다.
  sessionRef.value = {
    user: { id: userId, email: 'ex@x.com', workspaceId: wsId, workspaceType: 'buyer' },
  };

  const form = new FormData();
  form.append('file', makeFile('image/png', makePng()));
  const res = await callPost(wsId, form);
  expect(res.status).toBe(403);
  expect(await res.json()).toMatchObject({ error: 'FORBIDDEN_NOT_ADMIN' });

  const rows = await db
    .select()
    .from(workspaceLogoBlobs)
    .where(eq(workspaceLogoBlobs.workspaceId, wsId));
  expect(rows).toHaveLength(0);
});

it('POST denies a plain member BEFORE parsing/validating the file', async () => {
  // 게이트가 formData()/크기/MIME 검사 아래로 내려가면 403 대신 413 이 난다 —
  // 비-admin 이 5MB 멀티파트 파싱을 강제할 수 있게 된다. 기존에는 413/415 픽스처가
  // 우연히 멤버로 시드돼 이 순서를 증언했는데, admin 으로 승격하면서 그 증거가 없어졌다.
  const { id: wsId } = await seedBuyerWorkspace(db);
  const { id: userId } = await seedUser(db);
  await seedMembership(db, wsId, userId, 'member');
  sessionRef.value = {
    user: { id: userId, email: 'm@x.com', workspaceId: wsId, workspaceType: 'buyer' },
  };

  const bigBuf = Buffer.alloc(5 * 1024 * 1024 + 1);
  PNG_HEAD.copy(bigBuf);
  const form = new FormData();
  form.append('file', makeFile('image/png', bigBuf));
  const res = await callPost(wsId, form);
  expect(res.status).toBe(403);
});

it('POST returns 403 when the caller is an unapproved admin', async () => {
  // JWT 의 role 은 stale 할 수 있고 미승인 admin 도 포함할 수 있다 —
  // updateWorkspaceBizProfileAction 과 같은 이유로 DB 승인 상태까지 본다.
  const { id: wsId } = await seedBuyerWorkspace(db);
  const { id: userId } = await seedUser(db);
  await seedMembership(db, wsId, userId, 'admin', { approvalStatus: 'pending_approval' });
  sessionRef.value = {
    user: { id: userId, email: 'p@x.com', workspaceId: wsId, workspaceType: 'buyer' },
  };

  const form = new FormData();
  form.append('file', makeFile('image/png', makePng()));
  const res = await callPost(wsId, form);
  expect(res.status).toBe(403);
});

it('POST allows a master account with no membership row', async () => {
  // 마스터는 synthetic admin 으로 진입해 workspace_members row 가 없다.
  const prev = process.env.MASTER_ACCOUNT_EMAILS;
  process.env.MASTER_ACCOUNT_EMAILS = 'ops@support-b.com';
  try {
    const { id: wsId } = await seedBuyerWorkspace(db);
    const { id: userId } = await seedUser(db, { email: 'ops@support-b.com' });
    // 의도적으로 seedMembership 없음.
    sessionRef.value = {
      user: {
        id: userId,
        email: 'ops@support-b.com',
        workspaceId: wsId,
        workspaceType: 'buyer',
      },
    };

    const form = new FormData();
    form.append('file', makeFile('image/png', makePng()));
    const res = await callPost(wsId, form);
    expect(res.status).toBe(200);
  } finally {
    if (prev === undefined) delete process.env.MASTER_ACCOUNT_EMAILS;
    else process.env.MASTER_ACCOUNT_EMAILS = prev;
  }
});

// 마스터 면제는 **멤버십 검사만** 건너뛴다. 세션 자체의 유효성(폐기·이메일 미인증)과
// 워크스페이스 일치는 그 위에 있고, 순서가 뒤집히면 그 둘이 마스터에게만 무력해진다.
// 위 200 케이스만 있으면 `isMasterEmail` 을 guardWrite 맨 앞으로 올려도 초록이다.

it('POST denies a master whose email is unverified (exemption sits below the verify gate)', async () => {
  const prev = process.env.MASTER_ACCOUNT_EMAILS;
  process.env.MASTER_ACCOUNT_EMAILS = 'ops@support-b.com';
  try {
    getDbEmailVerifiedMock.mockResolvedValue(false);
    const { id: wsId } = await seedBuyerWorkspace(db);
    const { id: userId } = await seedUser(db, { email: 'ops@support-b.com' });
    sessionRef.value = {
      user: {
        id: userId,
        email: 'ops@support-b.com',
        workspaceId: wsId,
        workspaceType: 'buyer',
      },
    };

    const form = new FormData();
    form.append('file', makeFile('image/png', makePng()));
    const res = await callPost(wsId, form);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: 'FORBIDDEN' });

    const rows = await db
      .select()
      .from(workspaceLogoBlobs)
      .where(eq(workspaceLogoBlobs.workspaceId, wsId));
    expect(rows).toHaveLength(0);
  } finally {
    if (prev === undefined) delete process.env.MASTER_ACCOUNT_EMAILS;
    else process.env.MASTER_ACCOUNT_EMAILS = prev;
  }
});

it('POST denies a master acting on a workspace they are not currently in', async () => {
  // 마스터라도 지금 들어와 있는 워크스페이스만 건드릴 수 있다 — 면제가 이 검사
  // 위로 올라가면 운영자 세션 하나로 임의 워크스페이스 로고를 갈아치울 수 있다.
  const prev = process.env.MASTER_ACCOUNT_EMAILS;
  process.env.MASTER_ACCOUNT_EMAILS = 'ops@support-b.com';
  try {
    const { id: wsId } = await seedBuyerWorkspace(db);
    const { id: otherWsId } = await seedBuyerWorkspace(db);
    const { id: userId } = await seedUser(db, { email: 'ops@support-b.com' });
    sessionRef.value = {
      user: {
        id: userId,
        email: 'ops@support-b.com',
        workspaceId: otherWsId,
        workspaceType: 'buyer',
      },
    };

    const form = new FormData();
    form.append('file', makeFile('image/png', makePng()));
    const res = await callPost(wsId, form);
    expect(res.status).toBe(403);

    const rows = await db
      .select()
      .from(workspaceLogoBlobs)
      .where(eq(workspaceLogoBlobs.workspaceId, wsId));
    expect(rows).toHaveLength(0);
  } finally {
    if (prev === undefined) delete process.env.MASTER_ACCOUNT_EMAILS;
    else process.env.MASTER_ACCOUNT_EMAILS = prev;
  }
});

it('POST returns 400 when no file provided', async () => {
  const { id: wsId } = await seedBuyerWorkspace(db);
  const { id: userId } = await seedUser(db);
  await seedMembership(db, wsId, userId, 'admin');
  sessionRef.value = {
    user: { id: userId, workspaceId: wsId, workspaceType: 'buyer' },
  };

  const form = new FormData();
  const res = await callPost(wsId, form);
  expect(res.status).toBe(400);
});

it('POST returns 413 when file exceeds 5MB', async () => {
  const { id: wsId } = await seedBuyerWorkspace(db);
  const { id: userId } = await seedUser(db);
  await seedMembership(db, wsId, userId, 'admin');
  sessionRef.value = {
    user: { id: userId, workspaceId: wsId, workspaceType: 'buyer' },
  };

  const bigBuf = Buffer.alloc(5 * 1024 * 1024 + 1);
  PNG_HEAD.copy(bigBuf);
  const form = new FormData();
  form.append('file', makeFile('image/png', bigBuf));
  const res = await callPost(wsId, form);
  expect(res.status).toBe(413);
});

it('POST returns 415 when mime not image/png or image/jpeg', async () => {
  const { id: wsId } = await seedBuyerWorkspace(db);
  const { id: userId } = await seedUser(db);
  await seedMembership(db, wsId, userId, 'admin');
  sessionRef.value = {
    user: { id: userId, workspaceId: wsId, workspaceType: 'buyer' },
  };

  const form = new FormData();
  form.append(
    'file',
    makeFile('application/pdf', Buffer.from([0x25, 0x50, 0x44, 0x46])),
  );
  const res = await callPost(wsId, form);
  expect(res.status).toBe(415);
});

it('POST returns 415 when magic bytes mismatch stated mime', async () => {
  const { id: wsId } = await seedBuyerWorkspace(db);
  const { id: userId } = await seedUser(db);
  await seedMembership(db, wsId, userId, 'admin');
  sessionRef.value = {
    user: { id: userId, workspaceId: wsId, workspaceType: 'buyer' },
  };

  // Claim PNG but actual bytes are JPEG
  const form = new FormData();
  form.append('file', makeFile('image/png', JPEG_HEAD));
  const res = await callPost(wsId, form);
  expect(res.status).toBe(415);
});

it('POST upserts logo blob and sets logoUpdatedAt on workspace', async () => {
  const { id: wsId } = await seedBuyerWorkspace(db);
  const { id: userId } = await seedUser(db);
  await seedMembership(db, wsId, userId, 'admin');
  sessionRef.value = {
    user: { id: userId, workspaceId: wsId, workspaceType: 'buyer' },
  };

  const form = new FormData();
  form.append('file', makeFile('image/png', makePng()));
  const res = await callPost(wsId, form);
  expect(res.status).toBe(200);

  const [blob] = await db
    .select()
    .from(workspaceLogoBlobs)
    .where(eq(workspaceLogoBlobs.workspaceId, wsId));
  expect(blob).toBeDefined();
  expect(blob.mime).toBe('image/png');

  const [ws] = await db
    .select({ logoUpdatedAt: workspaces.logoUpdatedAt })
    .from(workspaces)
    .where(eq(workspaces.id, wsId));
  expect(ws.logoUpdatedAt).not.toBeNull();
});

it('POST replaces existing logo on second upload', async () => {
  const { id: wsId } = await seedBuyerWorkspace(db);
  const { id: userId } = await seedUser(db);
  await seedMembership(db, wsId, userId, 'admin');
  sessionRef.value = {
    user: { id: userId, workspaceId: wsId, workspaceType: 'buyer' },
  };

  const form1 = new FormData();
  form1.append('file', makeFile('image/png', makePng(100)));
  await callPost(wsId, form1);

  const newBytes = makePng(200);
  const form2 = new FormData();
  form2.append('file', makeFile('image/png', newBytes));
  const res = await callPost(wsId, form2);
  expect(res.status).toBe(200);

  const blobs = await db
    .select()
    .from(workspaceLogoBlobs)
    .where(eq(workspaceLogoBlobs.workspaceId, wsId));
  expect(blobs).toHaveLength(1);
  expect(blobs[0].bytes.length).toBe(200);
});

// ─── DELETE ─────────────────────────────────────────────────────────────────

it('DELETE returns 401 when unauthenticated', async () => {
  const { id: wsId } = await seedBuyerWorkspace(db);
  const res = await callDelete(wsId);
  expect(res.status).toBe(401);
});

it('DELETE returns 403 when session workspace differs from target', async () => {
  const { id: wsId } = await seedBuyerWorkspace(db);
  const { id: otherWsId } = await seedBuyerWorkspace(db);
  const { id: userId } = await seedUser(db);
  await seedMembership(db, wsId, userId, 'admin');
  sessionRef.value = {
    user: { id: userId, workspaceId: otherWsId, workspaceType: 'buyer' },
  };

  const res = await callDelete(wsId);
  expect(res.status).toBe(403);
});

it('DELETE removes logo blob and clears logoUpdatedAt', async () => {
  const { id: wsId } = await seedBuyerWorkspace(db);
  const { id: userId } = await seedUser(db);
  await seedMembership(db, wsId, userId, 'admin');

  // Pre-insert a logo
  await db.insert(workspaceLogoBlobs).values({
    workspaceId: wsId,
    bytes: makePng(),
    mime: 'image/png',
  });
  await db
    .update(workspaces)
    .set({ logoUpdatedAt: new Date() })
    .where(eq(workspaces.id, wsId));

  sessionRef.value = {
    user: { id: userId, workspaceId: wsId, workspaceType: 'buyer' },
  };

  const res = await callDelete(wsId);
  expect(res.status).toBe(200);

  const blobs = await db
    .select()
    .from(workspaceLogoBlobs)
    .where(eq(workspaceLogoBlobs.workspaceId, wsId));
  expect(blobs).toHaveLength(0);

  const [ws] = await db
    .select({ logoUpdatedAt: workspaces.logoUpdatedAt })
    .from(workspaces)
    .where(eq(workspaces.id, wsId));
  expect(ws.logoUpdatedAt).toBeNull();
});

it('403 POST when email not verified', async () => {
  sessionRef.value = { user: { id: 'u-1', workspaceId: 'ws-1', sessionVersion: 1 } };
  getDbEmailVerifiedMock.mockResolvedValue(false);
  const { POST } = await import('../route');
  const r = await POST(
    new Request('http://localhost/api/workspace/ws-1/avatar', { method: 'POST', body: new FormData() }),
    { params: Promise.resolve({ id: 'ws-1' }) }
  );
  expect(r.status).toBe(403);
});

it('403 DELETE when email not verified', async () => {
  sessionRef.value = { user: { id: 'u-1', workspaceId: 'ws-1', sessionVersion: 1 } };
  getDbEmailVerifiedMock.mockResolvedValue(false);
  const { DELETE } = await import('../route');
  const r = await DELETE(
    new Request('http://localhost/api/workspace/ws-1/avatar', { method: 'DELETE' }),
    { params: Promise.resolve({ id: 'ws-1' }) }
  );
  expect(r.status).toBe(403);
});

describe('avatar — 폐기 세션', () => {
  it('POST: sv 가 stale 한(폐기된) 세션은 401', async () => {
    const { id: wsId } = await seedBuyerWorkspace(db);
    sessionRef.value = { user: { id: '00000000-0000-4000-8000-0000000000aa', email: 'x@x.com', sessionVersion: 1, workspaceId: wsId } };
    getDbSessionVersionMock.mockResolvedValue(2);
    const form = new FormData();
    form.append('file', makeFile('image/png', makePng()));
    const res = await callPost(wsId, form);
    expect(res.status).toBe(401);
  });
});
