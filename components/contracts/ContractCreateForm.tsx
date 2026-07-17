'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { NumericFormat } from 'react-number-format';
import { Button } from '@/components/primitives/Button';
import { Label } from '@/components/primitives/Label';
import { Select } from '@/components/primitives/Select';
import { EmptyState } from '@/components/primitives/EmptyState';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { underlineInputClass, numericInputClass } from '@/components/forms/inputs';
import { FileStackIcon } from '@/components/icons';
import { sendContractAction } from '@/lib/server/actions/contract';
import { CONTRACT_MIN_EXPIRES_DAYS, CONTRACT_MAX_EXPIRES_DAYS } from '@/lib/types/contract-doc';
import type { ContractTemplate } from '@/lib/types/contract-doc';
import { cn } from '@/lib/utils';

export type ContractCreateFormProps = {
  rfp: { code: string; title: string };
  /** ready 첨부가 있는 템플릿만 — 빈 배열이면 템플릿 등록 안내로 대체 렌더. */
  templates: ContractTemplate[];
  buyerPrefill: { name: string; bizNo: string | null; repName: string };
  pgPrefill: { name: string; bizNo: string | null; repName: string };
  /** rfp.createdBy 프로필명 폴백 — 실제 서명자는 발송 시점에 서비스가 재해석한다. */
  buyerSignerName: string;
  pgMembers: { userId: string; name: string; email: string }[];
  defaultExpiresDays: number;
  viewerUserId: string;
};

const ERROR_LABELS: Record<string, string> = {
  INVALID_INPUT: '입력 값을 확인해주세요.',
  NOT_AWARDED: '아직 선정되지 않은 견적이에요.',
  FORBIDDEN_PG: '권한이 없습니다.',
  TEMPLATE_NOT_FOUND: '템플릿을 찾을 수 없습니다.',
  TEMPLATE_PDF_INVALID: '템플릿 PDF 를 확인해주세요.',
  ACTIVE_DOC_EXISTS: '이미 서명 대기 중인 계약서가 있어요.',
  INVALID_SIGNER: '승인된 멤버만 서명자로 지정할 수 있어요.',
  NO_BUYER_SIGNER: '구매사 서명자를 확인할 수 없어요.',
};

type PartyState = { name: string; bizNo: string; repName: string };

function PartyFields({
  label,
  testIdPrefix,
  value,
  onChange,
}: {
  label: string;
  testIdPrefix: string;
  value: PartyState;
  onChange: (v: PartyState) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--md-sys-color-on-surface-variant)]">
        {label}
      </p>
      <div className="space-y-1">
        <Label size="sm">회사명</Label>
        <input
          data-testid={`${testIdPrefix}-name`}
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          maxLength={80}
          className={underlineInputClass}
        />
      </div>
      <div className="space-y-1">
        <Label size="sm">사업자번호</Label>
        <input
          data-testid={`${testIdPrefix}-bizNo`}
          value={value.bizNo}
          onChange={(e) => onChange({ ...value, bizNo: e.target.value })}
          placeholder="000-00-00000"
          className={underlineInputClass}
        />
      </div>
      <div className="space-y-1">
        <Label size="sm">대표자명 *</Label>
        <input
          data-testid={`${testIdPrefix}-repName`}
          value={value.repName}
          onChange={(e) => onChange({ ...value, repName: e.target.value })}
          maxLength={40}
          className={underlineInputClass}
        />
      </div>
    </div>
  );
}

/** PG 전자계약 작성 폼 — /contracts/new. 템플릿 선택 + 당사자 정보 + 서명자 지정 후 발송. */
export function ContractCreateForm({
  rfp,
  templates,
  buyerPrefill,
  pgPrefill,
  buyerSignerName,
  pgMembers,
  defaultExpiresDays,
  viewerUserId,
}: ContractCreateFormProps) {
  const router = useRouter();

  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '');
  const [title, setTitle] = useState(`${rfp.title} 계약`);
  const [buyer, setBuyer] = useState<PartyState>({
    name: buyerPrefill.name,
    bizNo: buyerPrefill.bizNo ?? '',
    repName: buyerPrefill.repName,
  });
  const [pg, setPg] = useState<PartyState>({
    name: pgPrefill.name,
    bizNo: pgPrefill.bizNo ?? '',
    repName: pgPrefill.repName,
  });
  const [expiresInDays, setExpiresInDays] = useState(String(defaultExpiresDays));
  const [pgSignerUserId, setPgSignerUserId] = useState(
    pgMembers.some((m) => m.userId === viewerUserId) ? viewerUserId : (pgMembers[0]?.userId ?? ''),
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (templates.length === 0) {
    return (
      <EmptyState
        icon={<FileStackIcon size={40} />}
        title="계약서 템플릿이 없어요"
        description="계약서를 보내려면 먼저 PDF 템플릿을 등록해주세요."
        action={
          <Link href="/contract-templates" className="block w-fit">
            <Button size="sm">계약 템플릿 관리로 이동</Button>
          </Link>
        }
      />
    );
  }

  const selectedTemplate = templates.find((t) => t.id === templateId);
  const expiresNum = Number(expiresInDays) || 0;
  const canSubmit =
    Boolean(templateId) &&
    Boolean(title.trim()) &&
    Boolean(buyer.repName.trim()) &&
    Boolean(pg.repName.trim()) &&
    Boolean(pgSignerUserId) &&
    expiresNum >= CONTRACT_MIN_EXPIRES_DAYS &&
    expiresNum <= CONTRACT_MAX_EXPIRES_DAYS &&
    !pending;

  const handleSend = () => {
    setError(null);
    startTransition(async () => {
      const r = await sendContractAction({
        rfpCode: rfp.code,
        templateId,
        title: title.trim(),
        parties: {
          _v: 1,
          buyer: {
            name: buyer.name.trim(),
            repName: buyer.repName.trim(),
            bizNo: buyer.bizNo.trim() || null,
          },
          pg: { name: pg.name.trim(), repName: pg.repName.trim(), bizNo: pg.bizNo.trim() || null },
        },
        pgSignerUserId,
        expiresInDays: expiresNum,
      });
      if (r.ok) {
        router.push(`/contracts/${r.docId}`);
        return;
      }
      setConfirmOpen(false);
      setError(r.error);
    });
  };

  return (
    <div className="space-y-6">
      {error && (
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--md-sys-color-error)]">
          {ERROR_LABELS[error] ?? error}
        </p>
      )}

      <div className="space-y-1">
        <Label size="md" muted={false}>
          계약서 템플릿
        </Label>
        <Select
          options={templates.map((t) => ({ value: t.id, label: t.name }))}
          value={templateId}
          onChange={setTemplateId}
        />
        {selectedTemplate?.attachment && (
          <a
            href={`/api/files/${selectedTemplate.attachment.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-[12px] text-[var(--md-sys-color-primary)] hover:underline"
          >
            본문 미리보기
          </a>
        )}
      </div>

      <div className="space-y-1">
        <Label size="md" muted={false}>
          계약서 제목
        </Label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          className={underlineInputClass}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <PartyFields label="갑 (구매사)" testIdPrefix="buyer" value={buyer} onChange={setBuyer} />
        <PartyFields label="을 (결제대행사)" testIdPrefix="pg" value={pg} onChange={setPg} />
      </div>

      <div className="space-y-1">
        <Label size="md" muted={false}>
          유효기간
        </Label>
        <div className="flex items-end gap-1">
          <NumericFormat
            decimalScale={0}
            allowNegative={false}
            isAllowed={({ floatValue }) =>
              floatValue === undefined ||
              (floatValue >= CONTRACT_MIN_EXPIRES_DAYS && floatValue <= CONTRACT_MAX_EXPIRES_DAYS)
            }
            value={expiresInDays}
            onValueChange={(values) => setExpiresInDays(values.value)}
            placeholder={String(defaultExpiresDays)}
            className={cn(numericInputClass, 'flex-1')}
          />
          <span className="pb-2 font-mono text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
            일
          </span>
        </div>
        <p className="text-[11px] text-[var(--md-sys-color-outline)]">
          {CONTRACT_MIN_EXPIRES_DAYS}~{CONTRACT_MAX_EXPIRES_DAYS}일 사이로 설정해요 (기본{' '}
          {defaultExpiresDays}일).
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="space-y-1">
          <Label size="md" muted={false}>
            갑 서명자
          </Label>
          <p className="text-[13px] text-[var(--md-sys-color-on-surface)]">{buyerSignerName || '—'}</p>
          <p className="text-[11px] text-[var(--md-sys-color-outline)]">구매사 관리자가 변경할 수 있어요</p>
        </div>
        <div className="space-y-1">
          <Label size="md" muted={false}>
            을 서명자
          </Label>
          <Select
            options={pgMembers.map((m) => ({ value: m.userId, label: `${m.name} (${m.email})` }))}
            value={pgSignerUserId}
            onChange={setPgSignerUserId}
          />
        </div>
      </div>

      <Button size="sm" onClick={() => setConfirmOpen(true)} disabled={!canSubmit}>
        계약서 보내기
      </Button>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(o) => !pending && setConfirmOpen(o)}
        title="계약서를 보낼까요?"
        description={`${buyer.name || '갑'} ↔ ${pg.name || '을'} · 유효기간 ${
          expiresNum || defaultExpiresDays
        }일. 개요 별지는 요약이며 계약 본문이 우선해요.`}
        confirmLabel="보내기"
        loading={pending}
        onConfirm={handleSend}
      />
    </div>
  );
}
