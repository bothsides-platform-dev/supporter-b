'use client';

// 목록 페이지(견적 요청/받은 견적 요청) 상단 · 빈 상태 옆에 렌더되는 '샘플로 둘러보기'
// 엔트리 카드. 클릭하면 인터셉트 라우트(soft-nav)로 가상 샘플 딜룸 모달이 열린다.
// X(숨기기)는 해당 온보딩 태스크를 dismissed 로 표시하고 새로고침해 카드를 치운다.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { X } from 'lucide-react';
import { IconButton } from '@/components/primitives/IconButton';
import { updateOnboardingAction } from '@/lib/server/actions/onboarding/updateOnboardingAction';
import type { OnboardingKey } from '@/lib/types/onboarding';

type Variant = 'buyer' | 'pg';

const COPY: Record<Variant, { href: string; title: string; description: string; key: OnboardingKey }> = {
  buyer: {
    href: '/rfp/sample',
    title: '샘플로 둘러보기',
    description: '가상 견적 요청으로 PG 견적을 비교하고 선정하는 과정을 미리 체험해봐요.',
    key: 'buyerSample',
  },
  pg: {
    href: '/inbox/sample',
    title: '샘플로 둘러보기',
    description: '가상 견적 요청에 견적을 작성해 제출하는 과정을 미리 체험해봐요.',
    key: 'pgSample',
  },
};

export function SampleEntryCard({ variant }: { variant: Variant }) {
  const router = useRouter();
  const [hidden, setHidden] = useState(false);
  const copy = COPY[variant];

  if (hidden) return null;

  const handleDismiss = async () => {
    setHidden(true);
    await updateOnboardingAction({ key: copy.key, event: 'dismissed' });
    router.refresh();
  };

  return (
    <div className="relative rounded-[6px] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] px-4 py-3">
      <Link href={copy.href} className="block pr-8">
        <p className="text-[13px] font-medium text-[var(--md-sys-color-on-surface)]">{copy.title}</p>
        <p className="mt-0.5 text-[12px] text-[var(--md-sys-color-on-surface-variant)]">{copy.description}</p>
      </Link>
      <div className="absolute top-2 right-2">
        <IconButton label="숨기기" size="sm" onClick={handleDismiss}>
          <X />
        </IconButton>
      </div>
    </div>
  );
}
