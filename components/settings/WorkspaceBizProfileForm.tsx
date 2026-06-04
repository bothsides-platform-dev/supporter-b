'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/primitives/Button';
import { Field } from '@/components/primitives/Field';
import { updateWorkspaceBizProfileAction } from '@/lib/server/actions/rfp';
import { GRADE_LABELS, type MerchantGrade } from '@/lib/types/biz-profile';
import { toast } from '@/lib/toast';

const ALL_GRADES: MerchantGrade[] = [
  'small',
  'sme1',
  'sme2',
  'sme3',
  'general',
];

type Props = {
  currentGrade: MerchantGrade | undefined;
};

export function WorkspaceBizProfileForm({ currentGrade }: Props) {
  const [grade, setGrade] = useState<MerchantGrade>(
    currentGrade ?? 'sme2',
  );
  const [submitting, setSubmitting] = useState(false);
  const [, startTransition] = useTransition();
  const router = useRouter();

  const dirty = grade !== currentGrade;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dirty || submitting) return;
    setSubmitting(true);
    const r = await updateWorkspaceBizProfileAction({ grade });
    setSubmitting(false);
    if (!r.ok) {
      toast(`저장하지 못했어요 — ${r.error}`, { type: 'error' });
      return;
    }
    toast('가맹점 등급을 변경했어요.');
    startTransition(() => router.refresh());
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="가맹점 등급 갱신" htmlFor="ws-grade-small">
        <div className="border-t border-[var(--md-sys-color-outline-variant)] divide-y divide-[var(--md-sys-color-outline-variant)]">
          {ALL_GRADES.map((g) => {
            const selected = grade === g;
            return (
              <label
                key={g}
                htmlFor={`ws-grade-${g}`}
                className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-[var(--md-sys-color-surface-container-high)] transition-colors"
              >
                <input
                  id={`ws-grade-${g}`}
                  type="radio"
                  name="ws-merchant-grade"
                  value={g}
                  checked={selected}
                  onChange={() => setGrade(g)}
                  className="w-3.5 h-3.5 accent-[var(--md-sys-color-on-surface)]"
                />
                <span className="text-[13px] text-[var(--md-sys-color-on-surface)] font-medium min-w-[3rem]">
                  {GRADE_LABELS[g]}
                </span>
              </label>
            );
          })}
        </div>
      </Field>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={!dirty || submitting}>
          {submitting ? '저장 중…' : '등급 갱신'}
        </Button>
      </div>
      <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--md-sys-color-outline)]">
        새 등급은 새로운 사업자 프로필 row로 저장되며 워크스페이스에 반영돼요.
        과거 견적 요청은 보낸 시점 정보를 그대로 유지해요.
      </p>
    </form>
  );
}
