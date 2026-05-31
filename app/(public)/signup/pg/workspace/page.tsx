'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod/v4';
import { Button } from '@/components/primitives/Button';
import { SignupStepper } from '@/components/auth/SignupStepper';
import { readSignupDraft, writeSignupDraft } from '@/lib/auth/signup-storage';
import { bizNoRefinement, BIZ_NO_ERROR } from '@/lib/validation/biz-no';

const WorkspaceSchema = z.object({
  wsName: z.string().min(1, '워크스페이스 이름을 입력해주세요'),
  bizNo: z
    .string()
    .min(10, '사업자등록번호 10자리를 입력하세요')
    .max(12, '사업자등록번호를 확인하세요')
    .refine(bizNoRefinement, { message: BIZ_NO_ERROR }),
});

export default function PgWorkspacePage() {
  const router = useRouter();

  const [wsName, setWsName] = useState('');
  const [bizNo, setBizNo] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const draft = readSignupDraft();
  const ready = !!draft.email && !!draft.password;
  const isInvited = !!draft.wsInviteToken;

  useEffect(() => {
    if (!ready) { router.replace('/signup/pg'); return; }
    // 초대 경로는 워크스페이스 단계를 건너뜀
    if (isInvited) { router.replace('/signup/pg/profile'); return; }
  }, [ready, isInvited, router]);

  if (!ready || isInvited) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = WorkspaceSchema.safeParse({ wsName, bizNo });
    if (!result.success) {
      const errs: Record<string, string> = {};
      for (const issue of result.error.issues) {
        errs[String(issue.path[0])] = issue.message;
      }
      setErrors(errs);
      return;
    }
    setSubmitting(true);
    setErrors({});

    writeSignupDraft({
      ...readSignupDraft(),
      wsName: wsName.trim(),
      bizNo: bizNo.replace(/-/g, ''),
    });

    router.push('/signup/pg/profile');
  };

  return (
    <div className="space-y-6">
      <SignupStepper current={2} total={4} />

      <div>
        <h2 className="text-[26px] font-[700] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)]">
          워크스페이스를 만듭니다
        </h2>
        <p className="mt-2 text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
          PG 워크스페이스 이름과 사업자등록번호를 입력해주세요.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-1">
          <label
            htmlFor="ws-name"
            className="font-mono text-[11px] tracking-[0.14em] uppercase text-[var(--md-sys-color-on-surface-variant)]"
          >
            워크스페이스 이름 *
          </label>
          <input
            id="ws-name"
            type="text"
            value={wsName}
            onChange={(e) => setWsName(e.target.value)}
            placeholder="예: 서포터 B 페이 영업팀"
            disabled={submitting}
            className="block w-full bg-transparent border-0 border-b border-[var(--md-sys-color-outline)] py-2 text-[14px] text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-outline)] focus:outline-none focus:border-[var(--md-sys-color-on-surface)] transition-colors"
          />
          {errors.wsName && (
            <p role="alert" className="text-[11px] text-[var(--md-sys-color-error)]">
              {errors.wsName}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <label
            htmlFor="biz-no"
            className="font-mono text-[11px] tracking-[0.14em] uppercase text-[var(--md-sys-color-on-surface-variant)]"
          >
            사업자등록번호 *
          </label>
          <input
            id="biz-no"
            type="text"
            inputMode="numeric"
            value={bizNo}
            onChange={(e) => setBizNo(e.target.value)}
            placeholder="000-00-00000"
            disabled={submitting}
            className="block w-full bg-transparent border-0 border-b border-[var(--md-sys-color-outline)] py-2 text-[14px] font-mono text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-outline)] focus:outline-none focus:border-[var(--md-sys-color-on-surface)] transition-colors"
          />
          {errors.bizNo && (
            <p role="alert" className="text-[11px] text-[var(--md-sys-color-error)]">
              {errors.bizNo}
            </p>
          )}
        </div>

        <Button type="submit" fullWidth size="lg" disabled={submitting}>
          {submitting ? 'LOADING…' : '다음'}
        </Button>
      </form>
    </div>
  );
}
