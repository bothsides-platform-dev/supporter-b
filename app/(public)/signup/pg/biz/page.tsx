'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod/v4';
import { signIn } from 'next-auth/react';
import { clearSignupDraft, readSignupDraft } from '@/lib/auth/signup-storage';
import { signupCompleteAction } from '@/lib/server/actions/auth';
import { bizNoRefinement, BIZ_NO_ERROR } from '@/lib/validation/biz-no';

const PAYMENT_METHODS = ['카드', '간편결제', '계좌이체', '휴대폰', '가상계좌', '해외결제'] as const;
const VOLUME_RANGES = ['1억 미만', '1억~10억', '10억~100억', '100억 이상'] as const;

const BizSchema = z.object({
  bizNo: z
    .string()
    .min(10, '사업자등록번호 10자리를 입력하세요')
    .max(12, '사업자등록번호를 확인하세요')
    .refine(bizNoRefinement, { message: BIZ_NO_ERROR }),
  paymentMethods: z.array(z.string()).min(1, '결제수단을 하나 이상 선택하세요'),
  volumeRange: z.string().min(1, '월 거래액 구간을 선택하세요'),
});

export default function PgBizPage() {
  const router = useRouter();
  const draft = readSignupDraft();
  const isInvite = !!draft.inviteToken;
  const current = isInvite ? 4 : 5;
  const total = isInvite ? 4 : 5;

  const [form, setForm] = useState({
    bizNo: '',
    paymentMethods: [] as string[],
    volumeRange: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  // Guard: if draft incomplete, go back
  if (!draft?.email || !draft?.wsName) {
    router.replace('/signup/pg/workspace');
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = BizSchema.safeParse(form);
    if (!result.success) {
      const errs: Record<string, string> = {};
      for (const issue of result.error.issues) {
        errs[String(issue.path[0])] = issue.message;
      }
      setErrors(errs);
      return;
    }
    setLoading(true);
    setErrors({});
    try {
      const d = readSignupDraft();
      if (!d.email || !d.password || !d.name || !d.phone || !d.phoneVerificationId || !d.wsName) {
        setErrors({ form: '세션이 만료되었습니다. 처음부터 다시 시도해주세요.' });
        return;
      }
      const r = await signupCompleteAction({
        email: d.email,
        name: d.name,
        password: d.password,
        phone: d.phone,
        phoneVerificationId: d.phoneVerificationId,
        wsKind: 'pg',
        wsName: d.wsName,
        pgProfile: {
          bizNo: form.bizNo,
          serviceScope: {
            paymentMethods: form.paymentMethods,
            industries: [],
            volumeRange: form.volumeRange,
            integrationTypes: [],
          },
        },
      });

      if (!r.ok) {
        setErrors({ form: `가입을 완료하지 못했습니다. (${r.error})` });
        return;
      }

      const signInResult = await signIn('credentials', {
        email: r.email,
        password: r.password,
        redirect: false,
      });

      const wsInviteToken = d.wsInviteToken;
      clearSignupDraft();

      if (signInResult && signInResult.error) {
        setErrors({ form: '로그인에 실패했습니다. 로그인 페이지에서 다시 시도해주세요.' });
        router.push('/login');
        return;
      }

      // If user arrived via a workspace invite, redirect back to the invite URL
      // so WorkspaceInviteAuthedClient can accept it now that they're signed in.
      router.push(wsInviteToken ? `/invite/workspace/${wsInviteToken}` : r.redirectTo);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-[var(--md-sys-color-on-surface-variant)] mb-3">
          {String(current).padStart(2, '0')} / {String(total).padStart(2, '0')}
        </p>
        <h2 className="text-[26px] font-[700] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)]">
          서비스 정보를 입력합니다
        </h2>
        <p className="mt-2 text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
          심사에 필요한 정보를 입력해 주세요.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 사업자등록번호 */}
        <div className="space-y-2">
          <label
            htmlFor="biz-no"
            className="font-mono text-[10px] tracking-[0.16em] uppercase text-[var(--md-sys-color-on-surface-variant)]"
          >
            사업자등록번호 *
          </label>
          <input
            id="biz-no"
            type="text"
            value={form.bizNo}
            onChange={(e) => setForm((p) => ({ ...p, bizNo: e.target.value }))}
            placeholder="000-00-00000"
            disabled={loading}
            className="w-full px-4 py-3 text-[14px] bg-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface)] border border-[var(--md-sys-color-outline)] rounded-md placeholder:text-[var(--md-sys-color-on-surface-variant)] focus:outline-none focus:border-[var(--md-sys-color-primary)] disabled:opacity-50"
          />
          {errors.bizNo && (
            <p
              role="alert"
              className="font-mono text-[10px] tracking-[0.12em] uppercase text-[var(--md-sys-color-error)]"
            >
              {errors.bizNo}
            </p>
          )}
        </div>

        {/* 결제수단 */}
        <div className="space-y-2">
          <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
            서비스 가능 결제수단 *
          </p>
          <div className="flex flex-wrap gap-3">
            {PAYMENT_METHODS.map((m) => (
              <label key={m} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.paymentMethods.includes(m)}
                  disabled={loading}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      paymentMethods: e.target.checked
                        ? [...p.paymentMethods, m]
                        : p.paymentMethods.filter((x) => x !== m),
                    }))
                  }
                  className="rounded"
                />
                <span className="text-[13px] text-[var(--md-sys-color-on-surface)]">{m}</span>
              </label>
            ))}
          </div>
          {errors.paymentMethods && (
            <p
              role="alert"
              className="font-mono text-[10px] tracking-[0.12em] uppercase text-[var(--md-sys-color-error)]"
            >
              {errors.paymentMethods}
            </p>
          )}
        </div>

        {/* 월 거래액 구간 */}
        <div className="space-y-2">
          <label
            htmlFor="volume-range"
            className="font-mono text-[10px] tracking-[0.16em] uppercase text-[var(--md-sys-color-on-surface-variant)]"
          >
            월 거래액 구간 *
          </label>
          <select
            id="volume-range"
            value={form.volumeRange}
            onChange={(e) => setForm((p) => ({ ...p, volumeRange: e.target.value }))}
            disabled={loading}
            className="w-full px-4 py-3 text-[14px] bg-[var(--md-sys-color-surface-variant)] text-[var(--md-sys-color-on-surface)] border border-[var(--md-sys-color-outline)] rounded-md focus:outline-none focus:border-[var(--md-sys-color-primary)] disabled:opacity-50"
          >
            <option value="">선택</option>
            {VOLUME_RANGES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          {errors.volumeRange && (
            <p
              role="alert"
              className="font-mono text-[10px] tracking-[0.12em] uppercase text-[var(--md-sys-color-error)]"
            >
              {errors.volumeRange}
            </p>
          )}
        </div>

        {errors.form && (
          <p
            role="alert"
            className="font-mono text-[10px] tracking-[0.12em] uppercase text-[var(--md-sys-color-error)]"
          >
            {errors.form}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 text-[14px] font-[600] tracking-[-0.01em] bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] rounded-md disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
        >
          {loading ? 'LOADING…' : '완료'}
        </button>
      </form>
    </div>
  );
}
