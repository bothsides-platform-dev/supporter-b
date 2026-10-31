import { InboxList, type InboxRow } from "./InboxList";
import {
  BoardFilterBar,
  BoardFilterReset,
} from "@/components/board/BoardFilterBar";
import { PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/primitives/EmptyState";
import { InboxIcon } from "@/components/icons";
import { MERCHANT_TIER_LABELS } from "@/lib/types/bid";

const STATUS_OPTIONS = [
  { value: "", label: "전체" },
  { value: "response", label: "응답 필요" },
  { value: "submitted", label: "보낸 견적" },
  { value: "closed", label: "종료" },
];
const GRADE_OPTIONS = Object.entries(MERCHANT_TIER_LABELS).map(
  ([value, label]) => ({ value, label }),
);

/** Real inbox and demo share filter controls and distinguish intake from search emptiness. */
export function InboxPageContent({
  rows,
  totalCount,
  onOpenRfp,
}: {
  rows: InboxRow[];
  totalCount: number;
  onOpenRfp?: (rfpId: string, tab?: "write") => void;
}) {
  return (
    <>
      <PageHeader title="받은 견적 요청" count={rows.length} />
      <div className="shrink-0 border-b border-[var(--md-sys-color-outline-variant)] px-4 py-3 sm:px-6">
        <BoardFilterBar
          variant="inbox"
          statusOptions={STATUS_OPTIONS}
          gradeOptions={GRADE_OPTIONS}
          searchPlaceholder="구매사명·제목·견적번호 검색"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows.length > 0 ? (
          <InboxList rows={rows} onOpenRfp={onOpenRfp} />
        ) : (
          <EmptyState
            icon={<InboxIcon />}
            title={
              totalCount === 0
                ? "아직 받은 견적 요청이 없어요."
                : "조건에 맞는 견적 요청이 없어요."
            }
            description={
              totalCount === 0
                ? "구매사가 초대한 견적 요청이 여기에 표시돼요."
                : "검색어나 필터를 바꾸면 다른 견적 요청을 볼 수 있어요."
            }
            action={totalCount > 0 ? <BoardFilterReset /> : undefined}
          />
        )}
      </div>
    </>
  );
}
