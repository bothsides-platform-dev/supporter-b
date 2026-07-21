'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/primitives/Button';
import { Avatar } from '@/components/primitives/Avatar';

function InviteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  if (!token) {
    return <p className="text-[13px] text-[var(--md-sys-color-error)] text-center">잘못된 초대 링크입니다.</p>;
  }

  return (
    <div className="space-y-8">
      <h2 className="text-[22px] font-[700] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)] text-center leading-snug">
        <span className="text-[var(--md-sys-color-on-surface-variant)]">홍길동</span>님이<br />
        <strong>(주)샘플테크</strong>에 초대했습니다.
      </h2>
      <div className="flex items-center gap-4 p-4 border border-[var(--md-sys-color-outline-variant)] rounded-md">
        <Avatar name="샘플테크" color="primary" size="lg" />
        <div>
          <p className="text-[14px] font-medium text-[var(--md-sys-color-on-surface)]">(주)샘플테크</p>
          <p className="md-label-small text-[var(--md-sys-color-on-surface-variant)] mt-0.5">멤버 1명</p>
        </div>
      </div>
      <div className="space-y-3">
        <Button fullWidth size="lg" onClick={() => router.push(`/signup/pg?token=${token}`)}>가입하고 합류</Button>
        <Button fullWidth variant="outlined" size="md" onClick={() => router.push('/login')}>로그인 후 합류</Button>
        <button type="button" className="block w-full text-center md-label-small text-[var(--md-sys-color-outline)] hover:text-[var(--md-sys-color-on-surface-variant)] transition-colors">
          거절하기
        </button>
      </div>
    </div>
  );
}

export default function InvitePage() {
  return (
    <Suspense fallback={<p className="md-label-medium text-center">LOADING…</p>}>
      <InviteContent />
    </Suspense>
  );
}
