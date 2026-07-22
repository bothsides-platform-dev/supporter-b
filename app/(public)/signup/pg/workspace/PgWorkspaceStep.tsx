'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/primitives/Button';
import { Label } from '@/components/primitives/Label';
import { SignupStepper } from '@/components/auth/SignupStepper';
import {
  BizLookupField,
  type BizLookupResult,
} from '@/components/rfp/BizLookupField';
import { ntsLookup } from '@/components/rfp/nts-lookup';
import { readSignupDraft, writeSignupDraft } from '@/lib/auth/signup-storage';
import { WorkspaceAvatar } from '@/components/primitives/WorkspaceAvatar';
import { underlineInputClass } from '@/components/forms/inputs';

type CanonicalCompany = { id: string; name: string; canonicalPgKey: string; logoUpdatedAt: string | null };

export default function PgWorkspaceStep({
  canonicalCompanies,
}: {
  canonicalCompanies: CanonicalCompany[];
}) {
  const router = useRouter();

  const [mode, setMode] = useState<'select' | 'manual'>('select');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [wsName, setWsName] = useState('');
  const [bizProfile, setBizProfile] = useState<BizLookupResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const draft = readSignupDraft();
  const ready = !!draft.email && !!draft.password;
  const isInvited = !!draft.wsInviteToken;

  useEffect(() => {
    if (!ready) { router.replace('/signup/pg'); return; }
    if (isInvited) { router.replace('/signup/pg/profile'); return; }
  }, [ready, isInvited, router]);

  if (!ready || isInvited) return null;

  const handleSelectCompany = (company: CanonicalCompany) => {
    if (submitting) return;
    setSelectedId(company.id);
    setSubmitting(true);
    writeSignupDraft({
      ...readSignupDraft(),
      selectedPgWorkspaceId: company.id,
      wsName: undefined,
      bizNo: undefined,
    });
    router.push('/signup/pg/profile');
  };

  const handleManualSubmit = () => {
    if (!wsName.trim() || !bizProfile || submitting) return;
    setSubmitting(true);
    writeSignupDraft({
      ...readSignupDraft(),
      wsName: wsName.trim(),
      bizNo: bizProfile.bizNo.replace(/-/g, ''),
      selectedPgWorkspaceId: undefined,
    });
    router.push('/signup/pg/profile');
  };

  return (
    <div className="space-y-6">
      <SignupStepper current={2} total={3} />

      <div>
        <h2 className="text-[26px] font-[700] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)]">
          소속 PG사를 선택하세요
        </h2>
        <p className="mt-2 text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
          아래 목록에서 소속 PG사를 선택하거나, 직접 입력할 수 있습니다.
        </p>
      </div>

      {mode === 'select' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {canonicalCompanies.map((company) => (
              <button
                key={company.id}
                type="button"
                disabled={submitting}
                onClick={() => handleSelectCompany(company)}
                className={[
                  'flex flex-col items-center justify-center gap-2 rounded-[6px] border px-3 py-4',
                  'text-[13px] font-[500] text-center leading-snug transition-colors',
                  selectedId === company.id
                    ? 'border-[var(--md-sys-color-primary)] text-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)]'
                    : 'border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)] hover:border-[var(--md-sys-color-outline)] hover:bg-[var(--md-sys-color-surface-variant)]',
                ].join(' ')}
              >
                <WorkspaceAvatar
                  name={company.name}
                  workspaceId={company.id}
                  logoUpdatedAt={company.logoUpdatedAt}
                  size="md"
                />
                {company.name}
              </button>
            ))}
          </div>

          <div className="pt-2 text-center">
            <button
              type="button"
              onClick={() => setMode('manual')}
              className="text-[13px] text-[var(--md-sys-color-on-surface-variant)] underline underline-offset-2 hover:text-[var(--md-sys-color-on-surface)]"
            >
              해당 PG사를 찾을 수 없나요? 직접 입력
            </button>
          </div>
        </div>
      )}

      {mode === 'manual' && (
        <div className="space-y-8">
          <button
            type="button"
            onClick={() => setMode('select')}
            className="text-[13px] text-[var(--md-sys-color-on-surface-variant)] underline underline-offset-2 hover:text-[var(--md-sys-color-on-surface)]"
          >
            ← PG사 목록으로 돌아가기
          </button>

          <div className="space-y-1">
            <Label size="md" muted={false}>워크스페이스 이름 *</Label>
            <input
              type="text"
              value={wsName}
              onChange={(e) => setWsName(e.target.value)}
              placeholder="예: 서포터 B 페이 영업팀"
              disabled={submitting}
              className={underlineInputClass}
            />
          </div>

          <BizLookupField
            onLookup={ntsLookup}
            onResult={(profile) => setBizProfile(profile)}
            onReset={() => setBizProfile(null)}
          />

          <Button
            type="button"
            fullWidth
            size="lg"
            disabled={!wsName.trim() || !bizProfile || submitting}
            onClick={handleManualSubmit}
          >
            {submitting ? 'LOADING…' : '다음'}
          </Button>
        </div>
      )}
    </div>
  );
}
