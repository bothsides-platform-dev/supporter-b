'use client';

import { TriangleAlert } from 'lucide-react';

import { isFreeEmailDomain } from '@/lib/auth/free-email-domains';

type SignupEmailGuideProps = {
  email: string;
  /** 에러 문구 표시 중이거나 초대 유입으로 이메일이 고정된 경우 숨김 */
  hidden?: boolean;
};

/**
 * 가입 1단계 이메일 인풋 아래 회사 이메일 권장 안내.
 * 기본은 중립 힌트, 무료(개인) 도메인 감지 시 amber 경고로 전환 — 비차단.
 * 라이브 리전(role="status")은 마운트 시 한 번 생성해 유지한다 — 노드를 갈아끼우면
 * 스크린리더가 힌트→경고 전환을 안내하지 못할 수 있다.
 */
export function SignupEmailGuide({ email, hidden }: SignupEmailGuideProps) {
  if (hidden) return null;

  const warning = isFreeEmailDomain(email);

  return (
    <p
      role="status"
      className={
        warning
          ? 'mt-1.5 flex items-start gap-1.5 text-[11px] leading-normal text-[var(--md-sys-color-warning)]'
          : 'mt-1.5 text-[11px] leading-normal text-[var(--md-sys-color-on-surface-variant)]'
      }
    >
      {warning ? (
        <>
          <TriangleAlert aria-hidden="true" className="mt-[1px] size-3 shrink-0" strokeWidth={2} />
          <span>개인 이메일이에요. 회사 이메일로 가입하면 팀원과 함께 쓰기 쉬워요.</span>
        </>
      ) : (
        '회사 이메일로 가입하면 팀원과 함께 쓰기 쉬워요.'
      )}
    </p>
  );
}
