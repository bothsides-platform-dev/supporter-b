'use client';
import { useEffect, useMemo, useState } from 'react';
import type { PgRfpDetailData } from '@/lib/server/rfp-detail-loader';
import { listBidDraftsAction, deleteBidDraftAction } from '@/lib/server/actions/bid-drafts';
import type { SavedBidDraft, BidDraftScope } from '@/lib/quote/draft-schema';
import { personalDraftKey, readPersonalRecovery } from './usePersonalBidDraft';
import { DraftReview } from './bid-wizard/DraftReview';
import { guestFiles } from '@/lib/guest-rfp/files';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

type Recovery = SavedBidDraft & { roundKey: string; localOnly?: boolean };
export function PersonalDraftRecovery({ data }: { data: PgRfpDetailData }) {
  const scope = useMemo<BidDraftScope | null>(
    () =>
      data.userId && data.workspaceId
        ? {
            userId: data.userId,
            workspaceId: data.workspaceId,
            rfpId: data.rfp.id,
            roundKey: 'initial',
          }
        : null,
    [data.userId, data.workspaceId, data.rfp.id],
  );
  const [drafts, setDrafts] = useState<Recovery[]>([]);
  const [failed, setFailed] = useState(false);
  const [removing, setRemoving] = useState<Recovery | null>(null);
  useEffect(() => {
    if (!scope) return;
    let active = true;
    void listBidDraftsAction(scope)
      .then((result) => {
        if (!active) return;
        if (!result.ok) {
          setFailed(true);
          return;
        }
        const copies = new Map(result.drafts.map((d) => [d.roundKey, d as Recovery]));
        // Recover the most recent browser inputs, including a save that failed at the deadline.
        const prefix = personalDraftKey(scope).replace(/initial$/, '');
        try {
          for (const key of Object.keys(localStorage)) {
            if (!key.startsWith(prefix) || key.endsWith(':pdf')) continue;
            const local = readPersonalRecovery(key);
            if (!local) continue;
            const roundKey = key.slice(prefix.length);
            const saved = copies.get(roundKey);
            copies.set(roundKey, {
              ...(saved ?? {
                id: key,
                revision: local.revision,
                updatedAt: '',
                submittedBidId: null,
              }),
              content: local.content,
              roundKey,
              localOnly: true,
            });
          }
        } catch {
          /* A blocked browser store does not hide account copies. */
        }
        setDrafts([...copies.values()]);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [scope]);
  if (!scope) return null;
  return (
    <>
      {failed && (
        <p role="alert">개인 초안을 불러오지 못했어요. 연결 상태를 확인하고 새로고침해요.</p>
      )}
      {drafts.map((d) => (
        <details
          key={d.roundKey}
          className="rounded-[6px] border border-[var(--md-sys-color-outline-variant)] p-4"
        >
          <summary className="cursor-pointer text-[14px]">
            내 초안 복구 · {d.roundKey === 'initial' ? '최초 견적' : '수정 견적'} · 읽기 전용
          </summary>
          <p className="my-3 text-[14px]">
            {d.localOnly ? '이 브라우저에 보관한 입력이에요.' : '내 계정에 저장한 초안이에요.'}{' '}
            구매사와 동료에게는 보이지 않아요.
          </p>
          <DraftReview
            content={d.content}
            rfp={data.rfp}
            buyerName={data.buyer.name}
            baseBid={data.myBidHistory.find((b) => b.id === d.content.baseBidId)}
          />
          <button
            type="button"
            className="mt-4 min-h-11 text-[14px] underline"
            onClick={() => setRemoving(d)}
          >
            이 초안 삭제
          </button>
        </details>
      ))}
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title="이 개인 초안을 삭제할까요?"
        description="계정과 이 브라우저에 보관한 작성 내용을 지워요. 보낸 견적에는 영향을 주지 않아요."
        confirmLabel="초안 삭제"
        variant="danger"
        onConfirm={async () => {
          if (!removing) return;
          const target = { ...scope, roundKey: removing.roundKey };
          if (removing.revision) {
            const result = await deleteBidDraftAction(target, removing.revision);
            if (!result.ok) {
              setFailed(true);
              setRemoving(null);
              return;
            }
          }
          try {
            localStorage.removeItem(personalDraftKey(target));
            await guestFiles.remove(`${personalDraftKey(target)}:pdf`);
          } catch {
            setFailed(true);
            return;
          }
          setDrafts((current) => current.filter((d) => d.roundKey !== removing.roundKey));
          setRemoving(null);
        }}
      />
    </>
  );
}
