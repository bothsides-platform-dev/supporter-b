'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/primitives/Button';
import { Label } from '@/components/primitives/Label';
import { Select } from '@/components/primitives/Select';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { CurrencyInput, PercentInput, numericInputClass, underlineInputClass } from '@/components/forms/inputs';
import { saveQuoteTemplateAction } from '@/lib/server/actions/quote-template/saveQuoteTemplateAction';
import { deleteQuoteTemplateAction } from '@/lib/server/actions/quote-template/deleteQuoteTemplateAction';
import {
  PAYMENT_METHOD_CATEGORIES,
  PAYMENT_METHOD_LABELS,
  isTieredMethod,
  type PaymentMethod,
  type TierRates,
} from '@/lib/types/bid';
import type { QuoteTemplateOption } from '@/lib/types/bid';
import { cn } from '@/lib/utils';

const ALL_PAYMENT_METHODS: PaymentMethod[] = PAYMENT_METHOD_CATEGORIES.flatMap(
  (c) => c.methods,
);

const CYCLE_UNITS = [
  { value: 'D', label: 'D+' },
  { value: 'W', label: 'W+' },
  { value: 'M', label: 'M+' },
] as const;

const ERROR_LABELS: Record<string, string> = {
  INVALID_INPUT: '입력 값을 확인해주세요.',
  LIMIT_REACHED: '템플릿은 최대 20개까지 저장할 수 있어요.',
  FORBIDDEN: '권한이 없습니다.',
  TEMPLATE_NOT_FOUND: '템플릿을 찾을 수 없습니다.',
};

type EditorState = {
  id?: string;
  name: string;
  cycleUnit: 'D' | 'W' | 'M';
  cycleNum: string;
  settleLimit: string;
  guaranteeInsurance: string;
  fees: Record<string, string>;
  /** 구간 요율 수단은 편집기에서 단일 입력 불가 — TierRates를 원형 그대로 보존해 저장 시 재첨부 */
  tieredFees: Partial<Record<PaymentMethod, TierRates>>;
};

const fmtPct = (rate: number) => String(Math.round(rate * 1e6) / 1e4);

function blankEditor(): EditorState {
  return {
    name: '',
    cycleUnit: 'D',
    cycleNum: '1',
    settleLimit: '0',
    guaranteeInsurance: '0',
    fees: {},
    tieredFees: {},
  };
}

function editorFromTemplate(t: QuoteTemplateOption): EditorState {
  const m = /^([DWM])\+(\d+)$/.exec(t.settleCycle);
  const fees: Record<string, string> = {};
  const tieredFees: Partial<Record<PaymentMethod, TierRates>> = {};
  for (const method of ALL_PAYMENT_METHODS) {
    const stored = t.paymentFees[method];
    if (stored === undefined) continue;
    if (typeof stored === 'object') {
      tieredFees[method] = stored;
    } else {
      fees[method] = fmtPct(stored);
    }
  }
  return {
    id: t.id,
    name: t.name,
    cycleUnit: (m?.[1] ?? 'D') as 'D' | 'W' | 'M',
    cycleNum: m?.[2] ?? '1',
    settleLimit: String(t.settleLimit),
    guaranteeInsurance: String(t.guaranteeInsurance),
    fees,
    tieredFees,
  };
}

export function QuoteTemplatesPanel({
  initialTemplates,
  workspaceName,
}: {
  initialTemplates: QuoteTemplateOption[];
  workspaceName?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<QuoteTemplateOption | null>(null);

  const setFee = (key: string, value: string) =>
    setEditor((e) => (e ? { ...e, fees: { ...e.fees, [key]: value } } : e));
  const setField = <K extends keyof EditorState>(key: K, value: EditorState[K]) =>
    setEditor((e) => (e ? { ...e, [key]: value } : e));

  const handleSave = () => {
    if (!editor) return;
    const name = editor.name.trim();
    if (!name) return;
    setError(null);

    const settleCycle = `${editor.cycleUnit}+${editor.cycleNum || '1'}`;
    const paymentFees: Partial<Record<PaymentMethod, number | TierRates>> = { ...editor.tieredFees };
    for (const method of ALL_PAYMENT_METHODS) {
      const v = editor.fees[method] ?? '';
      if (v !== '') paymentFees[method] = parseFloat(v) / 100;
    }
    const base = {
      name,
      settleCycle,
      settleLimit: parseInt(editor.settleLimit) || 0,
      guaranteeInsurance: parseInt(editor.guaranteeInsurance) || 0,
      paymentFees,
    };

    startTransition(async () => {
      const r = await saveQuoteTemplateAction(
        editor.id ? { id: editor.id, ...base } : base,
      );
      if (r.ok) {
        setEditor(null);
        router.refresh();
      } else {
        setError(r.error);
      }
    });
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    const templateId = deleteTarget.id;
    startTransition(async () => {
      const r = await deleteQuoteTemplateAction({ templateId });
      setDeleteTarget(null);
      if (r.ok) router.refresh();
      else setError(r.error);
    });
  };

  return (
    <div className="space-y-8">
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="템플릿을 삭제할까요?"
        description={`"${deleteTarget?.name ?? ''}" 템플릿이 영구히 삭제돼요.`}
        confirmLabel="삭제할게요"
        variant="danger"
        onConfirm={handleDelete}
        loading={pending}
      />

      <header className="space-y-1">
        <h1 className="text-[20px] font-[700] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)]">
          견적 템플릿
        </h1>
        <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
          자주 쓰는 정산조건과 수수료율을 저장해 두고, 견적 작성 시 한 번에 불러와요
          {workspaceName ? ` · ${workspaceName}` : ''}.
        </p>
      </header>

      {error && (
        <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--md-sys-color-error)]">
          {ERROR_LABELS[error] ?? error}
        </p>
      )}

      {/* 목록 */}
      <div className="space-y-2">
        {initialTemplates.length === 0 ? (
          <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
            아직 저장된 템플릿이 없어요. 새 템플릿을 만들어 보세요.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--md-sys-color-outline-variant)] border-y border-[var(--md-sys-color-outline-variant)]">
            {initialTemplates.map((t) => (
              <li key={t.id} className="flex items-center justify-between py-3">
                <div className="min-w-0">
                  <p className="text-[14px] text-[var(--md-sys-color-on-surface)] truncate">
                    {t.name}
                  </p>
                  <p className="font-mono text-[11px] text-[var(--md-sys-color-outline)] md-numeric">
                    정산 {t.settleCycle}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    type="button"
                    size="sm"
                    variant="text"
                    onClick={() => {
                      setError(null);
                      setEditor(editorFromTemplate(t));
                    }}
                  >
                    편집
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="text"
                    color="error"
                    onClick={() => setDeleteTarget(t)}
                  >
                    삭제
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 에디터 / 새 템플릿 버튼 */}
      {editor === null ? (
        <Button
          type="button"
          size="sm"
          variant="outlined"
          onClick={() => {
            setError(null);
            setEditor(blankEditor());
          }}
        >
          새 템플릿
        </Button>
      ) : (
        <div className="space-y-6 border border-[var(--md-sys-color-outline-variant)] rounded-[6px] p-5">
          <div className="space-y-1">
            <Label size="md" muted={false}>템플릿 이름 *</Label>
            <input
              value={editor.name}
              onChange={(e) => setField('name', e.target.value)}
              placeholder="템플릿 이름"
              maxLength={80}
              className={cn(underlineInputClass)}
            />
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-5">
            <div className="col-span-2 space-y-1">
              <Label size="md" muted={false}>정산 주기 *</Label>
              <div className="flex items-end gap-2">
                <div className="w-28">
                  <Select
                    options={CYCLE_UNITS.map((u) => ({ value: u.value, label: u.label }))}
                    value={editor.cycleUnit}
                    onChange={(v) => setField('cycleUnit', v as 'D' | 'W' | 'M')}
                  />
                </div>
                <input
                  type="number"
                  min="1"
                  max="99"
                  value={editor.cycleNum}
                  onChange={(e) => setField('cycleNum', e.target.value)}
                  placeholder="1"
                  className={cn(numericInputClass, 'flex-1')}
                />
              </div>
            </div>
            <CurrencyInput
              label="정산한도 (원/월)"
              value={editor.settleLimit}
              onChange={(v) => setField('settleLimit', v)}
              placeholder="0"
            />
            <CurrencyInput
              label="월 보증보험 (원/연)"
              value={editor.guaranteeInsurance}
              onChange={(v) => setField('guaranteeInsurance', v)}
              placeholder="0"
            />
          </div>

          <div className="space-y-3">
            <span className="font-mono text-[11px] tracking-[0.16em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
              결제수단별 수수료
            </span>
            <div className="grid grid-cols-2 gap-x-6 gap-y-5">
              {ALL_PAYMENT_METHODS.map((m) =>
                isTieredMethod(m) && editor.tieredFees[m] ? (
                  <div key={m} className="space-y-0.5">
                    <span className="font-mono text-[10px] tracking-[0.08em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
                      {PAYMENT_METHOD_LABELS[m]} 수수료
                    </span>
                    <p className="font-mono text-[12px] text-[var(--md-sys-color-outline)]">
                      구간별 (견적 작성 시 수정)
                    </p>
                  </div>
                ) : (
                  <PercentInput
                    key={m}
                    label={`${PAYMENT_METHOD_LABELS[m]} 수수료`}
                    value={editor.fees[m] ?? ''}
                    onChange={(v) => setFee(m, v)}
                  />
                ),
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={!editor.name.trim() || pending}
            >
              템플릿 저장
            </Button>
            <Button
              type="button"
              size="sm"
              variant="text"
              onClick={() => {
                setEditor(null);
                setError(null);
              }}
            >
              취소
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
