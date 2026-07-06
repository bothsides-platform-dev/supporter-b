// 가상 샘플 딜룸 상단 배너 — 한 줄 서비스 흐름 안내. 완료 후에는 구매사에게 실제
// 견적 요청 작성으로 이어지는 CTA 를 보여준다(PG는 별도 CTA 없음 — 실제 요청은
// 구매사가 초대해야 시작되므로 자체 액션 유도가 없다).
import Link from 'next/link';
import { Button } from '@/components/primitives/Button';

type Variant = 'buyer' | 'pg';

const BLURB: Record<Variant, string> = {
  buyer: '요청 1건 작성 → 여러 PG 견적 도착 → 비교하고 선정해요.',
  pg: '요청 확인 → 견적 작성 → 제출하면 결과를 바로 확인해요.',
};

export function SampleExperienceBanner({
  variant,
  completed = false,
}: {
  variant: Variant;
  completed?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[6px] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] px-4 py-2.5">
      <p className="text-[12px] text-[var(--md-sys-color-on-surface-variant)]">{BLURB[variant]}</p>
      {variant === 'buyer' && completed && (
        <Link href="/rfp-create">
          <Button size="sm">실제 견적 요청 보내기 →</Button>
        </Link>
      )}
    </div>
  );
}
