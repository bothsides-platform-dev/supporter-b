'use client';

/**
 * AwardContextLine — 계약 탭 상단 한 줄(선정 상대 · 담당자 · 메시지).
 *
 * 계약 탭이 기본으로 열리면서 DealResultHeader 가 뒤 탭으로 밀리므로, 최소한의
 * 맥락만 여기 남긴다. 전화·이메일까지 담은 전체 ContactBlock 은 결과 탭에 그대로 있다.
 * 박스를 두르지 않아 카드가 하나 더 늘어난 것처럼 보이지 않게 한다.
 */
import { CheckCircle2 } from 'lucide-react';

import { Button } from '@/components/primitives/Button';
import { useStartConversation } from '@/lib/hooks/useStartConversation';

const dim = 'text-[var(--md-sys-color-on-surface-variant)]';

export function AwardContextLine({
  workspaceName,
  contactName,
  counterpartyWsId,
}: {
  workspaceName: string;
  contactName?: string;
  counterpartyWsId?: string;
}) {
  const { starting, start } = useStartConversation();

  return (
    <div className={'mb-3.5 flex items-center gap-2 text-[13px] ' + dim}>
      <CheckCircle2
        className="size-[17px] shrink-0 text-[var(--md-sys-color-tertiary)]"
        aria-hidden
      />
      <span className="min-w-0 truncate font-semibold text-[var(--md-sys-color-on-surface)]">
        {workspaceName}
      </span>
      <span className="shrink-0">· 선정 완료</span>
      {contactName && <span className="min-w-0 truncate">· 담당자 {contactName}</span>}
      {counterpartyWsId && (
        <span className="ml-auto shrink-0">
          <Button
            variant="outlined"
            size="sm"
            disabled={starting}
            onClick={() => start(counterpartyWsId)}
          >
            메시지
          </Button>
        </span>
      )}
    </div>
  );
}
