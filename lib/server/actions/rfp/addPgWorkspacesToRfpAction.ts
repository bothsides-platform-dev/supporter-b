'use server';

import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';

import { requireBuyerSession } from '@/lib/auth/session';
import { rfpInvitations, rfps, workspaces } from '@/lib/db/schema';
import { actionDb, type RfpActionResult } from './_shared';

const Input = z
  .object({
    rfpId: z.string().regex(/^P-\d{4}-\d{4}$/),
    workspaceIds: z.array(z.string().uuid()).min(1).max(20),
  })
  .strict();

export type AddPgWorkspacesInput = z.input<typeof Input>;
export type AddPgWorkspacesResult = RfpActionResult<{
  addedCount: number;
  skipped: string[];
}>;

const ALLOWED_PG_WORKSPACES_MAX = 50;

/**
 * 이미 발송된 RFP에 PG 워크스페이스를 추가 — `'draft'` 상태로 invitation row만
 * 누적해두고, 실제 메일 발송은 `sendDraftInvitationsAction`이 일괄 처리한다.
 *
 * 정책:
 *   - `status='sent' && deadline > now` RFP만 (PG_RFP_SPEC.md §7).
 *   - UUID dedupe → 이미 등록된 워크스페이스는 `skipped`로 응답.
 *   - 총 `allowedPgWorkspaceIds`가 50개를 넘기면 `WORKSPACES_LIMIT_EXCEEDED`.
 *   - `(rfp_id, pg_ws_id)` 부분 unique index가 race를 DB 레벨에서 차단.
 *   - 입력 workspaceIds는 모두 type='pg'인 워크스페이스여야 한다.
 *
 * 토큰 모델: draft 상태에서는 진짜 raw 토큰을 발급하지 않는다(이메일 본문 URL을
 * 만들 일이 없으므로). `tokenHash` 컬럼은 NOT NULL이므로 row id 기반 placeholder
 * (`draft-{uuid}`)를 넣어둔다. send 단계에서 `generateToken()`으로 진짜 raw를
 * 발급하고 hash를 갱신한다.
 */
export async function addPgWorkspacesToRfpAction(
  input: AddPgWorkspacesInput,
): Promise<AddPgWorkspacesResult> {
  let session;
  try {
    session = await requireBuyerSession();
  } catch {
    return { ok: false, error: 'FORBIDDEN_BUYER' };
  }

  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const wsId = session.user.workspaceId;
  const db = actionDb();

  const result = await db.transaction(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (tx: any): Promise<AddPgWorkspacesResult> => {
      const [row] = await tx
        .select({
          buyerWsId: rfps.buyerWsId,
          status: rfps.status,
          deadline: rfps.deadline,
          allowedPgWorkspaceIds: rfps.allowedPgWorkspaceIds,
        })
        .from(rfps)
        .where(eq(rfps.id, parsed.data.rfpId))
        .limit(1);
      if (!row) return { ok: false, error: 'NOT_FOUND' };
      if (row.buyerWsId !== wsId) return { ok: false, error: 'NOT_OWNED' };
      if (row.status !== 'sent') return { ok: false, error: 'RFP_NOT_OPEN' };
      if (new Date(row.deadline).getTime() <= Date.now()) {
        return { ok: false, error: 'RFP_DEADLINE_PASSED' };
      }

      // Verify all provided workspaceIds exist and are type='pg'.
      const confirmedPgRows: { id: string }[] = await tx
        .select({ id: workspaces.id, type: workspaces.type })
        .from(workspaces)
        .where(
          inArray(workspaces.id, parsed.data.workspaceIds),
        )
        .then((rows: { id: string; type: string }[]) =>
          rows.filter((r) => r.type === 'pg'),
        );
      const confirmedPgSet = new Set(confirmedPgRows.map((r) => r.id.toLowerCase()));
      const hasInvalid = parsed.data.workspaceIds.some(
        (id) => !confirmedPgSet.has(id.toLowerCase()),
      );
      if (hasInvalid) {
        return { ok: false, error: 'INVALID_WORKSPACE' };
      }

      // UUID dedupe vs. existing allowlist (lowercase for canonical comparison).
      const existing = new Set(
        (row.allowedPgWorkspaceIds ?? []).map((id: string) => id.toLowerCase()),
      );
      const seenInBatch = new Set<string>();
      const toAdd: string[] = [];
      const skipped: string[] = [];
      for (const raw of parsed.data.workspaceIds) {
        const norm = raw.toLowerCase();
        if (existing.has(norm) || seenInBatch.has(norm)) {
          skipped.push(raw);
          continue;
        }
        seenInBatch.add(norm);
        toAdd.push(norm); // store canonical lowercase UUID
      }

      if (toAdd.length === 0) {
        return { ok: true, addedCount: 0, skipped };
      }

      const totalAfter = (row.allowedPgWorkspaceIds ?? []).length + toAdd.length;
      if (totalAfter > ALLOWED_PG_WORKSPACES_MAX) {
        return { ok: false, error: 'WORKSPACES_LIMIT_EXCEEDED' };
      }

      // allowlist union update — canonical lowercase UUIDs.
      const merged = [
        ...(row.allowedPgWorkspaceIds ?? []).map((id: string) => id.toLowerCase()),
        ...toAdd,
      ];
      await tx
        .update(rfps)
        .set({ allowedPgWorkspaceIds: merged })
        .where(eq(rfps.id, parsed.data.rfpId));

      // draft invitation rows. tokenHash placeholder 'draft-{invId}'를 넣어 NOT
      // NULL/UNIQUE 제약을 충족 — sendDraftInvitationsAction이 진짜 hash로 갱신.
      const expiresAt = new Date(row.deadline);
      for (const workspaceId of toAdd) {
        const invId = randomUUID();
        await tx.insert(rfpInvitations).values({
          id: invId,
          rfpId: parsed.data.rfpId,
          pgWsId: workspaceId,
          tokenHash: `draft-${invId}`,
          sentAt: new Date(),
          expiresAt,
          status: 'draft',
        });
      }

      return { ok: true, addedCount: toAdd.length, skipped };
    },
  );

  return result;
}
