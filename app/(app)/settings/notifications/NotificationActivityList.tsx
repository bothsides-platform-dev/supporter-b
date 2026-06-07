'use client';

import { useRouter } from 'next/navigation';

import { Chip, type ChipColor } from '@/components/primitives/Chip';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { LocalTime } from '@/components/primitives/LocalTime';
import type { Notification, NotificationStatus } from '@/lib/types/notification';

const statusColor: Record<NotificationStatus, ChipColor> = {
  pending: 'warning',
  sent: 'error',
  failed: 'error',
  read: 'surface',
};

const statusLabel: Record<NotificationStatus, string> = {
  pending: '대기',
  sent: '미읽음',
  failed: '실패',
  read: '읽음',
};


export function NotificationActivityList({ items }: { items: Notification[] }) {
  if (items.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
          알림이 오면 여기에 표시돼요.
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-[var(--md-sys-color-outline-variant)] border-y border-[var(--md-sys-color-outline-variant)]">
      {items.map((n, i) => (
        <NotificationRow key={n.id} notif={n} indexFromEnd={items.length - i} />
      ))}
    </div>
  );
}

function NotificationRow({
  notif,
  indexFromEnd,
}: {
  notif: Notification;
  indexFromEnd: number;
}) {
  const router = useRouter();
  const { markRead } = useNotifications();
  const hasLink = Boolean(notif.linkUrl);
  const isUnread = notif.status !== 'read';

  const navigate = () => {
    if (notif.status !== 'read') {
      void markRead(notif.id);
    }
    if (notif.linkUrl) router.push(notif.linkUrl);
  };

  const markReadInPlace = () => {
    void markRead(notif.id).then(() => router.refresh());
  };

  const body = (
    <>
      <span className="font-mono text-[10px] tabular-nums text-[var(--md-sys-color-outline)] w-8 mt-0.5 shrink-0">
        {String(indexFromEnd).padStart(3, '0')}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
            {notif.type}
          </span>
        </div>
        <p className={`text-[13px] font-medium ${isUnread ? 'text-[var(--md-sys-color-on-surface)]' : 'text-[var(--md-sys-color-on-surface-variant)]'}`}>
          {notif.title}
        </p>
        <p className="text-[12px] text-[var(--md-sys-color-on-surface-variant)] mt-0.5">
          {notif.body}
        </p>
        <div className="mt-2 flex items-center gap-3">
          <span className="font-mono text-[10px] tabular-nums text-[var(--md-sys-color-outline)]">
            <LocalTime iso={notif.createdAt} />
          </span>
        </div>
      </div>
      <div className="flex flex-col items-end gap-2 shrink-0">
        <Chip label={statusLabel[notif.status]} color={statusColor[notif.status]} />
        {!hasLink && isUnread && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              markReadInPlace();
            }}
            className="font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors"
          >
            읽음 처리
          </button>
        )}
      </div>
    </>
  );

  if (hasLink) {
    return (
      <button
        type="button"
        onClick={navigate}
        className="w-full text-left py-4 px-2 -mx-2 flex items-start gap-4 hover:bg-[var(--md-sys-color-surface-container-high)] transition-colors"
      >
        {body}
      </button>
    );
  }

  return (
    <div className="py-4 px-2 -mx-2 flex items-start gap-4 opacity-80">
      {body}
    </div>
  );
}
