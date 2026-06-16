'use client';

import { SampleDeleteBanner } from '@/components/rfp/SampleDeleteBanner';
import { deleteSamplePgRfpAction } from '@/lib/server/actions/onboarding/deleteSamplePgRfpAction';

// 인박스 상세 상단 — PG 온보딩 샘플 견적 요청 안내 + 삭제. rfp.isSample 일 때만 렌더.
export function SamplePgRfpBanner({ rfpCode }: { rfpCode: string }) {
  return (
    <SampleDeleteBanner
      rfpCode={rfpCode}
      blurb="둘러보기용 샘플 견적 요청이에요. 직접 견적을 작성해 보내보면 선정되는 과정을 체험할 수 있어요. 다 살펴봤다면 삭제해도 돼요."
      onDeleteAction={(code) => deleteSamplePgRfpAction({ code })}
      redirectTo="/inbox"
    />
  );
}
