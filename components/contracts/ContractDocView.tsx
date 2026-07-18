'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/primitives/Button';
import { Select } from '@/components/primitives/Select';
import { LocalTime } from '@/components/primitives/LocalTime';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ContractStatusChip } from './ContractStatusChip';
import { IntegrityBadge } from './IntegrityBadge';
import { ContractAuditTrail } from './ContractAuditTrail';
import { SignDialog } from './SignDialog';
import {
  signContractAction,
  declineContractAction,
  cancelContractAction,
  reassignContractSignerAction,
  recordContractViewAction,
} from '@/lib/server/actions/contract';
import { toast } from '@/lib/toast';
import type { ContractDocDetail } from '@/lib/server/contract-loader';
import type { ContractDocSigner, ContractSignatureMethod } from '@/lib/types/contract-doc';

export type ContractDocViewProps = ContractDocDetail & {
  /** buyer admin + canReassign 일 때만 페이지가 채워주는 자기 워크스페이스 팀 로스터. */
  reassignMembers?: { userId: string; name: string; email: string }[];
};

// sign/decline/cancel/reassign 4개 액션이 공유하는 에러코드 — 계약 도메인 용어(UX_WRITING §8) 준수.
const ERROR_LABELS: Record<string, string> = {
  ALREADY_SIGNED: '이미 서명했어요.',
  EXPIRED: '유효기간이 지나 만료됐어요.',
  INVALID_STATE: '이미 처리된 계약서예요.',
  FORBIDDEN: '권한이 없습니다.',
  FORBIDDEN_SIGNER: '지정된 서명자만 서명할 수 있어요.',
  INVALID_SIGNATURE_IMAGE: '서명 이미지를 다시 확인해주세요.',
  SIGNER_ALREADY_SIGNED: '이미 서명한 서명자는 변경할 수 없어요.',
  INVALID_SIGNER: '승인된 멤버만 서명자로 지정할 수 있어요.',
  NOT_FOUND: '계약서를 찾을 수 없어요.',
  INVALID_INPUT: '입력 값을 확인해주세요.',
};

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function partyLabel(party: ContractDocSigner['party']): string {
  return party === 'buyer' ? '갑 (구매사)' : '을 (결제대행사)';
}

function SignerRow({ signer }: { signer: ContractDocSigner }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <p className="text-[13px] text-[var(--md-sys-color-on-surface)]">
          <span className="text-[var(--md-sys-color-on-surface-variant)]">{partyLabel(signer.party)}</span>
          <span aria-hidden className="mx-1">·</span>
          <span>{signer.name}</span>
        </p>
        <p className="truncate text-[12px] text-[var(--md-sys-color-on-surface-variant)]">{signer.email}</p>
      </div>
      <div className="shrink-0 text-[12px]">
        {signer.signedAt ? (
          <span className="text-[var(--md-sys-color-tertiary)]">
            서명 완료 · <LocalTime iso={signer.signedAt} />
          </span>
        ) : (
          <span className="text-[var(--md-sys-color-on-surface-variant)]">서명 대기</span>
        )}
      </div>
    </div>
  );
}

/** /contracts/[id] 상세 본문 — 헤더·PDF 뷰어·서명자 패널·감사추적·CTA(서명/반려/회수/서명자 변경). */
export function ContractDocView(props: ContractDocViewProps) {
  const { doc, signers, events, mySigner, canSign, canDecline, canCancel, canReassign, reassignMembers } = props;
  const router = useRouter();

  const [signOpen, setSignOpen] = useState(false);
  const [signSubmitting, setSignSubmitting] = useState(false);

  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [declinePending, startDeclineTransition] = useTransition();

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelPending, startCancelTransition] = useTransition();

  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignUserId, setReassignUserId] = useState(reassignMembers?.[0]?.userId ?? '');
  const [reassignPending, startReassignTransition] = useTransition();

  // 첫 조회를 감사추적에 남긴다 — best-effort(액션 자체가 실패를 던지지 않는다).
  useEffect(() => {
    void recordContractViewAction({ docId: doc.id });
  }, [doc.id]);

  const handleSign = async ({
    imageDataUrl,
    method,
  }: {
    imageDataUrl: string;
    method: ContractSignatureMethod;
  }) => {
    setSignSubmitting(true);
    const r = await signContractAction({ docId: doc.id, imageDataUrl, method });
    setSignSubmitting(false);
    if (!r.ok) {
      toast(ERROR_LABELS[r.error] ?? r.error, { type: 'error' });
      return;
    }
    setSignOpen(false);
    toast(
      r.completed ? '서명 완료 — 양측 서명이 모두 끝났어요. 완료된 계약서를 확인해 보세요.' : '서명 완료',
      { type: 'success' },
    );
    router.refresh();
  };

  const handleDecline = () => {
    const reason = declineReason.trim();
    if (!reason) return;
    startDeclineTransition(async () => {
      const r = await declineContractAction({ docId: doc.id, reason });
      if (!r.ok) {
        toast(ERROR_LABELS[r.error] ?? r.error, { type: 'error' });
        return;
      }
      setDeclineOpen(false);
      router.refresh();
    });
  };

  const handleCancel = () => {
    startCancelTransition(async () => {
      const r = await cancelContractAction({ docId: doc.id });
      if (!r.ok) {
        toast(ERROR_LABELS[r.error] ?? r.error, { type: 'error' });
        return;
      }
      setCancelOpen(false);
      router.refresh();
    });
  };

  const handleReassign = () => {
    if (!reassignUserId) return;
    startReassignTransition(async () => {
      const r = await reassignContractSignerAction({ docId: doc.id, newUserId: reassignUserId });
      if (!r.ok) {
        toast(ERROR_LABELS[r.error] ?? r.error, { type: 'error' });
        return;
      }
      setReassignOpen(false);
      router.refresh();
    });
  };

  const mySignPending = doc.status === 'sent' && !!mySigner && !mySigner.signedAt;
  const expiresDays = doc.status === 'sent' ? daysUntil(doc.expiresAt) : null;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="md-numeric text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
            {doc.code}
          </span>
          <h1 className="text-[20px] font-[700] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)]">
            {doc.title}
          </h1>
          <ContractStatusChip status={doc.status} mySignPending={mySignPending} />
          {doc.status === 'completed' && <IntegrityBadge docId={doc.id} />}
        </div>
        {expiresDays !== null && (
          <p className="md-numeric text-[12px] text-[var(--md-sys-color-on-surface-variant)]">
            {expiresDays > 0 ? `만료 D-${expiresDays}` : '오늘 만료'}
          </p>
        )}
      </header>

      <div className="overflow-hidden rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)]">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--md-sys-color-outline-variant)] px-4 py-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--md-sys-color-on-surface-variant)]">
            계약서 본문
          </span>
          <div className="flex items-center gap-3">
            <a
              href={`/api/contract-docs/${doc.id}/file`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--md-sys-color-on-surface)] hover:underline"
            >
              새 창 열기 →
            </a>
            <a
              href={`/api/contract-docs/${doc.id}/file?download=1`}
              className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--md-sys-color-on-surface)] hover:underline"
            >
              다운로드
            </a>
          </div>
        </div>
        <iframe
          src={`/api/contract-docs/${doc.id}/file`}
          title={doc.title}
          className="h-[70vh] w-full bg-white"
        />
      </div>

      <section className="divide-y divide-[var(--md-sys-color-outline-variant)] rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] px-4">
        {signers.map((s) => (
          <SignerRow key={s.id} signer={s} />
        ))}
      </section>

      {(canSign || canDecline || canCancel || canReassign) && (
        <div className="flex flex-wrap gap-2">
          {canSign && (
            <Button size="sm" onClick={() => setSignOpen(true)}>
              서명하기
            </Button>
          )}
          {canDecline && (
            <Button size="sm" variant="outlined" color="error" onClick={() => setDeclineOpen(true)}>
              반려
            </Button>
          )}
          {canCancel && (
            <Button size="sm" variant="outlined" color="error" onClick={() => setCancelOpen(true)}>
              회수
            </Button>
          )}
          {canReassign && (
            <Button size="sm" variant="outlined" onClick={() => setReassignOpen(true)}>
              서명자 변경
            </Button>
          )}
        </div>
      )}

      <section className="space-y-2">
        <h2 className="text-[14px] font-medium text-[var(--md-sys-color-on-surface)]">감사 추적</h2>
        <ContractAuditTrail events={events} signers={signers} />
      </section>

      <SignDialog
        open={signOpen}
        onOpenChange={setSignOpen}
        docCode={doc.code}
        docTitle={doc.title}
        signerName={mySigner?.name ?? ''}
        submitting={signSubmitting}
        onSubmit={handleSign}
      />

      <Dialog
        open={declineOpen}
        onOpenChange={(o) => {
          if (declinePending) return;
          setDeclineOpen(o);
          if (!o) setDeclineReason('');
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>계약서를 반려할까요?</DialogTitle>
            <DialogDescription>반려 사유를 입력해주세요. PG 에게 전달돼요.</DialogDescription>
          </DialogHeader>
          <textarea
            value={declineReason}
            onChange={(e) => setDeclineReason(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="반려 사유"
            className="w-full resize-none rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] bg-transparent p-2 text-[13px] text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-outline)] focus:outline-none focus:border-[var(--md-sys-color-on-surface)]"
          />
          <DialogFooter>
            <Button variant="outlined" onClick={() => setDeclineOpen(false)} disabled={declinePending}>
              취소
            </Button>
            <Button color="error" onClick={handleDecline} disabled={!declineReason.trim() || declinePending}>
              {declinePending ? '처리 중…' : '반려'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={(o) => !cancelPending && setCancelOpen(o)}
        title="계약서를 회수할까요?"
        description="회수하면 상대방이 더 이상 서명할 수 없어요."
        confirmLabel="회수"
        variant="danger"
        loading={cancelPending}
        onConfirm={handleCancel}
      />

      <Dialog open={reassignOpen} onOpenChange={(o) => !reassignPending && setReassignOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>서명자를 변경할까요?</DialogTitle>
            <DialogDescription>구매사 측 서명자를 다른 승인된 멤버로 바꿔요.</DialogDescription>
          </DialogHeader>
          <Select
            options={(reassignMembers ?? []).map((m) => ({
              value: m.userId,
              label: `${m.name} (${m.email})`,
            }))}
            value={reassignUserId}
            onChange={setReassignUserId}
          />
          <DialogFooter>
            <Button variant="outlined" onClick={() => setReassignOpen(false)} disabled={reassignPending}>
              취소
            </Button>
            <Button onClick={handleReassign} disabled={!reassignUserId || reassignPending}>
              {reassignPending ? '처리 중…' : '변경'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
