// components/rfp/RfpStep1BizProfile.tsx
'use client';

import { Button } from '@/components/primitives/Button';
import type { BizProfile } from '@/lib/types/biz-profile';

type Props = {
  bizProfile?: Pick<BizProfile, 'bizNo' | 'taxType' | 'status'>;
  workspaceName?: string;
  guest?: boolean;
  onNext: () => void;
};

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="border border-[var(--md-sys-color-outline-variant)] px-4 py-4 space-y-2">
      {children}
    </div>
  );
}

export function RfpStep1BizProfile({ bizProfile, workspaceName = '', guest = false, onNext }: Props) {
  return (
    <div className="space-y-6">
      {bizProfile ? (
        // bizProfile이 있으면 guest여도 등록된 사업자 테이블을 우선 표시한다.
        // (실제 guest는 bizProfile이 없어 영향 없음 — 랜딩 데모가 fixture를 주입하는 경로.)
        <>
          <div className="border border-[var(--md-sys-color-outline-variant)] divide-y divide-[var(--md-sys-color-outline-variant)]">
            <div className="px-4 py-2 flex items-center justify-between">
              <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
                WORKSPACE — 등록된 사업자
              </span>
              <span className="font-mono text-[10px] tracking-[0.1em] text-[var(--md-sys-color-tertiary)]">
                ✓ 확인됨
              </span>
            </div>
            {(
              [
                ['상호명', workspaceName],
                ['사업자번호', bizProfile.bizNo ?? '미입력'],
                [
                  '과세 유형',
                  bizProfile.taxType === 'general'
                    ? '일반과세'
                    : bizProfile.taxType === 'simple'
                      ? '간이과세'
                      : bizProfile.taxType === 'exempt'
                        ? '면세'
                        : '—',
                ],
                [
                  '사업자 상태',
                  bizProfile.status === 'active'
                    ? '정상'
                    : bizProfile.status === 'suspended'
                      ? '휴업'
                      : bizProfile.status === 'closed'
                        ? '폐업'
                        : '—',
                ],
              ] as [string, string][]
            ).map(([label, value]) => (
              <div key={label} className="px-4 py-2.5 flex items-baseline justify-between">
                <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
                  {label}
                </span>
                <span className="text-[13px] text-[var(--md-sys-color-on-surface)] font-mono tabular-nums">
                  {value}
                </span>
              </div>
            ))}
          </div>
          <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--md-sys-color-outline)]">
            사업자 정보 갱신은 설정 → 프로필에서 가능합니다.
          </p>
        </>
      ) : guest ? (
        <InfoBox>
          <p className="text-[13px] leading-relaxed text-[var(--md-sys-color-on-surface)]">
            가입 후 사업자 정보가 자동으로 연동돼요.
          </p>
          <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--md-sys-color-outline)]">
            견적 요청 내용을 먼저 작성한 뒤, 보낼 때 가입 페이지로 이동해요.
          </p>
        </InfoBox>
      ) : (
        <InfoBox>
          <p className="text-[13px] leading-relaxed text-[var(--md-sys-color-on-surface)]">
            사업자번호 없이 작성 중입니다.
          </p>
          <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--md-sys-color-outline)]">
            법인 설립 후에는 설정 → 프로필에서 사업자번호를 등록할 수 있습니다.
          </p>
        </InfoBox>
      )}

      <div className="flex justify-end pt-2 border-t border-[var(--md-sys-color-outline-variant)]">
        <Button data-demo-cursor data-coachmark="tutorial-wizard-next-1" type="button" size="md" onClick={onNext}>
          다음
        </Button>
      </div>
    </div>
  );
}
