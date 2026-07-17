import { LocalTime } from '@/components/primitives/LocalTime';
import { CONTRACT_EVENT_LABELS } from '@/lib/types/contract-doc';
import type { ContractDocEvent, ContractDocSigner } from '@/lib/types/contract-doc';

export type ContractAuditTrailProps = {
  events: ContractDocEvent[];
  /** actorUserId → 이름 해석용. 서명 이미지 등 민감 필드는 쓰지 않는다. */
  signers: ContractDocSigner[];
};

/** [별지2] 전자서명·감사추적 확인서 화면판 — 이벤트 타임라인(라벨·행위자·IP·시각). */
export function ContractAuditTrail({ events, signers }: ContractAuditTrailProps) {
  const nameByUserId = new Map(signers.map((s) => [s.userId, s.name]));

  return (
    <ul className="divide-y divide-[var(--md-sys-color-outline-variant)]">
      {events.map((event) => {
        const actorName = event.actorUserId ? nameByUserId.get(event.actorUserId) : undefined;
        return (
          <li key={event.id} className="flex items-center justify-between gap-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="text-[13px] text-[var(--md-sys-color-on-surface)]">
                {CONTRACT_EVENT_LABELS[event.type]}
              </span>
              {actorName && (
                <span className="truncate text-[12px] text-[var(--md-sys-color-on-surface-variant)]">
                  {actorName}
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {event.ip && (
                <span className="md-numeric text-[11px] text-[var(--md-sys-color-outline)]">
                  {event.ip}
                </span>
              )}
              <span className="md-numeric text-[11px] text-[var(--md-sys-color-outline)]">
                <LocalTime iso={event.createdAt} />
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
