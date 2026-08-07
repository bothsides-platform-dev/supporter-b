import { Skeleton } from '@/components/ui/skeleton';
import { ContractTemplatesPageSkeleton } from '@/components/skeletons';
import { CONTRACT_TEMPLATES_ENABLED } from '@/lib/features/contract-templates';

export default function Loading() {
  // kill switch 중에는 목록 스켈레톤을 그리지 않는다 — 행 3개와 액션 버튼을 그려 두면
  // 곧 '잠시 닫았어요' 로 바뀔 화면에 없는 템플릿을 약속하는 셈이다. 헤더 스트립만 남긴다.
  if (!CONTRACT_TEMPLATES_ENABLED) {
    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-[var(--md-sys-color-outline-variant)] px-6">
          <div className="flex items-center gap-3 py-3">
            <Skeleton className="h-5 w-28" />
          </div>
        </div>
      </div>
    );
  }
  return <ContractTemplatesPageSkeleton />;
}
