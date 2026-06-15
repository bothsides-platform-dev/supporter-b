'use client';

import { SampleDeleteBanner } from '@/components/rfp/SampleDeleteBanner';
import { deleteSampleRfpAction } from '@/lib/server/actions/onboarding/deleteSampleRfpAction';

// 상세 페이지 상단 — 구매사 샘플 견적 요청 안내 + 삭제. rfp.isSample 일 때만 렌더.
export function SampleRfpBanner({ rfpCode }: { rfpCode: string }) {
  return (
    <SampleDeleteBanner
      rfpCode={rfpCode}
      blurb="둘러보기용 샘플 견적 요청이에요. 받은 견적을 비교하고 선정하는 과정을 살펴볼 수 있어요. 다 살펴봤다면 삭제해도 돼요."
      onDeleteAction={(code) => deleteSampleRfpAction({ code })}
      redirectTo="/rfp"
    />
  );
}
