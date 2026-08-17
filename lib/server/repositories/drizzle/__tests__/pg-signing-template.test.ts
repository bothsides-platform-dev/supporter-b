import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createPgliteDb } from '@/lib/db/client-pglite';
import type { ContractDoc } from '@/lib/types/contract-doc';
import { DrizzlePgSigningTemplateRepository } from '../pg-signing-template';
import { seedPgWorkspace, seedUser } from './_seed';

async function setup() {
  const db = await createPgliteDb();
  return { db, repo: new DrizzlePgSigningTemplateRepository(db) };
}

const DOC: ContractDoc = {
  _v: 1,
  title: '전자결제 서비스 이용계약서',
  preamble: '갑과 을은 다음과 같이 계약을 체결한다.',
  clauses: [{ id: 'c1', kind: 'text', heading: '목적', body: '본 계약은 목적을 정한다.' }],
  closing: '각 1부씩 보관한다.',
};

describe('DrizzlePgSigningTemplateRepository', () => {
  it('create() + findById() round-trips a template', async () => {
    const { db, repo } = await setup();
    const ws = await seedPgWorkspace(db, 'signing.tpl1');
    const user = await seedUser(db);

    await repo.create({
      id: 'aaaaaaaa-0000-4000-8000-000000000001',
      workspaceId: ws.id,
      snowsignTemplateId: 'sst-1',
      name: '표준 계약서',
      createdBy: user.id,
    });

    const found = await repo.findById('aaaaaaaa-0000-4000-8000-000000000001');
    expect(found?.workspaceId).toBe(ws.id);
    expect(found?.snowsignTemplateId).toBe('sst-1');
    expect(found?.name).toBe('표준 계약서');
    expect(found?.createdBy).toBe(user.id);
  });

  it('findById() returns undefined for a missing id', async () => {
    const { repo } = await setup();
    const found = await repo.findById('aaaaaaaa-0000-4000-8000-000000000099');
    expect(found).toBeUndefined();
  });

  it('listByWorkspace() returns only that workspace templates, oldest first', async () => {
    const { db, repo } = await setup();
    const wsA = await seedPgWorkspace(db, 'signing.tplA');
    const wsB = await seedPgWorkspace(db, 'signing.tplB');
    const user = await seedUser(db);

    await repo.create({ workspaceId: wsA.id, snowsignTemplateId: 'a1', name: '첫번째', createdBy: user.id });
    await repo.create({ workspaceId: wsA.id, snowsignTemplateId: 'a2', name: '두번째', createdBy: user.id });
    await repo.create({ workspaceId: wsB.id, snowsignTemplateId: 'b1', name: '다른워크스페이스', createdBy: user.id });

    const rows = await repo.listByWorkspace(wsA.id);
    expect(rows.map((r) => r.name)).toEqual(['첫번째', '두번째']);
  });

  it('updateName() renames a template', async () => {
    const { db, repo } = await setup();
    const ws = await seedPgWorkspace(db, 'signing.tplRename');
    const user = await seedUser(db);
    await repo.create({ id: 'aaaaaaaa-0000-4000-8000-000000000002', workspaceId: ws.id, snowsignTemplateId: 's', name: '원래이름', createdBy: user.id });

    await repo.updateName('aaaaaaaa-0000-4000-8000-000000000002', '새이름');

    const found = await repo.findById('aaaaaaaa-0000-4000-8000-000000000002');
    expect(found?.name).toBe('새이름');
  });

  // 수정 저장 = provider 템플릿 재생성 후 교체. 행을 지우고 새로 만들면
  // bids.signing_template_id(ON DELETE SET NULL)가 끊기므로 반드시 in-place UPDATE.
  it('updateProviderTemplate() swaps the provider id + name in place, keeping the row id', async () => {
    const { db, repo } = await setup();
    const ws = await seedPgWorkspace(db, 'signing.tplSwap');
    const user = await seedUser(db);
    await repo.create({
      id: 'aaaaaaaa-0000-4000-8000-000000000004',
      workspaceId: ws.id,
      snowsignTemplateId: 'sst-old',
      name: '개정 전',
      createdBy: user.id,
    });

    const swapped = await repo.updateProviderTemplate(
      'aaaaaaaa-0000-4000-8000-000000000004',
      'sst-new',
      '개정판',
    );

    expect(swapped).toBe(true);
    const found = await repo.findById('aaaaaaaa-0000-4000-8000-000000000004');
    expect(found?.snowsignTemplateId).toBe('sst-new');
    expect(found?.name).toBe('개정판');
    expect(found?.workspaceId).toBe(ws.id);
  });

  // 소유 검증과 UPDATE 사이에 provider 왕복(최대 15초)이 있어 그 사이 동료의
  // 삭제가 끼어들 수 있다 — 0행 UPDATE 를 성공으로 보고하면 에디터가 거짓
  // '저장했어요' 토스트를 띄운다(적대 리뷰).
  it('updateProviderTemplate() returns false when the row vanished (0 rows affected)', async () => {
    const { repo } = await setup();
    const swapped = await repo.updateProviderTemplate(
      'aaaaaaaa-0000-4000-8000-000000000099',
      'sst-new',
      '개정판',
    );
    expect(swapped).toBe(false);
  });

  // ── 조항형(composed) 서식 ────────────────────────────────────────────────
  //
  // PDF 업로드 서식과 **같은 테이블**에 산다. 별도 테이블로 가르면
  // `bids.signing_template_id` 링크가 둘로 갈라져(어느 쪽이 채워졌나 불변식이
  // 새로 생긴다) 견적 위저드 피커도 두 목록을 합쳐야 한다. `kind` 컬럼 하나가 싸다.

  it('createComposed() + findById() 가 문서째로 왕복한다', async () => {
    const { db, repo } = await setup();
    const ws = await seedPgWorkspace(db, 'signing.tplComposed');
    const user = await seedUser(db);

    await repo.createComposed({
      id: 'aaaaaaaa-0000-4000-8000-00000000000a',
      workspaceId: ws.id,
      name: '조항형 표준계약서',
      document: DOC,
      createdBy: user.id,
    });

    const found = await repo.findById('aaaaaaaa-0000-4000-8000-00000000000a');
    expect(found?.kind).toBe('composed');
    if (found?.kind !== 'composed') return;
    expect(found.document).toEqual(DOC);
    expect(found.name).toBe('조항형 표준계약서');
    expect(found.workspaceId).toBe(ws.id);
  });

  it('PDF 서식은 kind=pdf 로 읽힌다 — 기존 행의 의미가 바뀌지 않는다', async () => {
    const { db, repo } = await setup();
    const ws = await seedPgWorkspace(db, 'signing.tplKindPdf');
    const user = await seedUser(db);
    await repo.create({
      id: 'aaaaaaaa-0000-4000-8000-00000000000b',
      workspaceId: ws.id,
      snowsignTemplateId: 'sst-kind',
      name: 'PDF 서식',
      createdBy: user.id,
    });

    const found = await repo.findById('aaaaaaaa-0000-4000-8000-00000000000b');
    expect(found?.kind).toBe('pdf');
    if (found?.kind !== 'pdf') return;
    expect(found.snowsignTemplateId).toBe('sst-kind');
  });

  // 불변식을 주석이 아니라 **DB 가** 지킨다. 반쪽짜리 행(pdf 인데 document 가 있거나
  // composed 인데 provider id 가 있는)은 어느 코드 경로가 만들려 해도 실패해야 한다.
  it('CHECK: pdf 행에 document 를 넣으면 거부한다', async () => {
    const { db } = await setup();
    const ws = await seedPgWorkspace(db, 'signing.tplChk1');
    const user = await seedUser(db);
    await expect(
      db.execute(sql`
        insert into pg_signing_templates (workspace_id, snowsign_template_id, kind, document, name, created_by)
        values (${ws.id}, 'sst-x', 'pdf', ${JSON.stringify(DOC)}::jsonb, '잘못된행', ${user.id})
      `),
    ).rejects.toThrow();
  });

  it('CHECK: composed 행에 provider 템플릿 id 를 넣으면 거부한다', async () => {
    const { db } = await setup();
    const ws = await seedPgWorkspace(db, 'signing.tplChk2');
    const user = await seedUser(db);
    await expect(
      db.execute(sql`
        insert into pg_signing_templates (workspace_id, snowsign_template_id, kind, document, name, created_by)
        values (${ws.id}, 'sst-y', 'composed', ${JSON.stringify(DOC)}::jsonb, '잘못된행', ${user.id})
      `),
    ).rejects.toThrow();
  });

  it('CHECK: composed 행에 document 가 없으면 거부한다', async () => {
    const { db } = await setup();
    const ws = await seedPgWorkspace(db, 'signing.tplChk3');
    const user = await seedUser(db);
    await expect(
      db.execute(sql`
        insert into pg_signing_templates (workspace_id, snowsign_template_id, kind, name, created_by)
        values (${ws.id}, null, 'composed', '문서없음', ${user.id})
      `),
    ).rejects.toThrow();
  });

  // composed 행은 snowsign_template_id 가 NULL 이다. 유니크 인덱스는 NULL 을
  // 서로 다른 값으로 보므로 한 워크스페이스에 여러 개가 공존한다 — 안 그러면
  // PG 는 조항형 서식을 딱 하나만 가질 수 있다.
  it('한 워크스페이스에 composed 서식이 여러 개 공존한다', async () => {
    const { db, repo } = await setup();
    const ws = await seedPgWorkspace(db, 'signing.tplMulti');
    const user = await seedUser(db);

    await repo.createComposed({ workspaceId: ws.id, name: '첫번째', document: DOC, createdBy: user.id });
    await repo.createComposed({ workspaceId: ws.id, name: '두번째', document: DOC, createdBy: user.id });

    const rows = await repo.listByWorkspace(ws.id);
    expect(rows.map((r) => r.name)).toEqual(['첫번째', '두번째']);
    expect(rows.every((r) => r.kind === 'composed')).toBe(true);
  });

  it('listByWorkspace() 는 두 종류를 함께 돌려준다', async () => {
    const { db, repo } = await setup();
    const ws = await seedPgWorkspace(db, 'signing.tplBoth');
    const user = await seedUser(db);
    await repo.create({ workspaceId: ws.id, snowsignTemplateId: 'p1', name: 'PDF', createdBy: user.id });
    await repo.createComposed({ workspaceId: ws.id, name: '조항형', document: DOC, createdBy: user.id });

    const rows = await repo.listByWorkspace(ws.id);
    expect(rows.map((r) => r.kind)).toEqual(['pdf', 'composed']);
  });

  // 조항형 편집은 provider 왕복이 없다 — 우리 DB 의 UPDATE 하나로 끝난다.
  // 행 id 를 유지해야 `bids.signing_template_id` 연결이 살아남는다.
  it('updateComposedDocument() 가 행 id 를 유지한 채 문서를 갈아끼운다', async () => {
    const { db, repo } = await setup();
    const ws = await seedPgWorkspace(db, 'signing.tplEdit');
    const user = await seedUser(db);
    await repo.createComposed({
      id: 'aaaaaaaa-0000-4000-8000-00000000000c',
      workspaceId: ws.id,
      name: '개정 전',
      document: DOC,
      createdBy: user.id,
    });

    const next: ContractDoc = { ...DOC, title: '개정된 계약서' };
    const ok = await repo.updateComposedDocument(
      'aaaaaaaa-0000-4000-8000-00000000000c',
      '개정판',
      next,
    );

    expect(ok).toBe(true);
    const found = await repo.findById('aaaaaaaa-0000-4000-8000-00000000000c');
    expect(found?.kind).toBe('composed');
    if (found?.kind !== 'composed') return;
    expect(found.document.title).toBe('개정된 계약서');
    expect(found.name).toBe('개정판');
  });

  it('updateComposedDocument() 는 사라진 행에 false 를 돌려준다', async () => {
    const { repo } = await setup();
    expect(
      await repo.updateComposedDocument('aaaaaaaa-0000-4000-8000-0000000000ff', 'x', DOC),
    ).toBe(false);
  });

  // 종류를 넘나드는 쓰기는 막는다 — composed 행을 pdf 로 바꿔치기하면 CHECK 가
  // 막아 주지만, 그 전에 레포가 대상 자체를 kind 로 좁히는 것이 더 정직하다.
  it('updateProviderTemplate() 은 composed 행을 건드리지 않는다', async () => {
    const { db, repo } = await setup();
    const ws = await seedPgWorkspace(db, 'signing.tplCross');
    const user = await seedUser(db);
    await repo.createComposed({
      id: 'aaaaaaaa-0000-4000-8000-00000000000d',
      workspaceId: ws.id,
      name: '조항형',
      document: DOC,
      createdBy: user.id,
    });

    const swapped = await repo.updateProviderTemplate(
      'aaaaaaaa-0000-4000-8000-00000000000d',
      'sst-new',
      '바뀐이름',
    );

    expect(swapped).toBe(false);
    const found = await repo.findById('aaaaaaaa-0000-4000-8000-00000000000d');
    expect(found?.kind).toBe('composed');
    expect(found?.name).toBe('조항형');
  });

  it('updateComposedDocument() 는 pdf 행을 건드리지 않는다', async () => {
    const { db, repo } = await setup();
    const ws = await seedPgWorkspace(db, 'signing.tplCross2');
    const user = await seedUser(db);
    await repo.create({
      id: 'aaaaaaaa-0000-4000-8000-00000000000e',
      workspaceId: ws.id,
      snowsignTemplateId: 'sst-keep',
      name: 'PDF 서식',
      createdBy: user.id,
    });

    expect(
      await repo.updateComposedDocument('aaaaaaaa-0000-4000-8000-00000000000e', 'x', DOC),
    ).toBe(false);
  });

  it('remove() hard-deletes a template', async () => {
    const { db, repo } = await setup();
    const ws = await seedPgWorkspace(db, 'signing.tplRemove');
    const user = await seedUser(db);
    await repo.create({ id: 'aaaaaaaa-0000-4000-8000-000000000003', workspaceId: ws.id, snowsignTemplateId: 's', name: '지울것', createdBy: user.id });

    await repo.remove('aaaaaaaa-0000-4000-8000-000000000003');

    expect(await repo.findById('aaaaaaaa-0000-4000-8000-000000000003')).toBeUndefined();
  });
});
