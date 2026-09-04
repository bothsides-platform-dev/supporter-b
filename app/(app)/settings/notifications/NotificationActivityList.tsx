'use client';

import { useRouter } from 'next/navigation';

import { Chip, type ChipColor } from '@/components/primitives/Chip';
import { useNotifications } from '@/lib/hooks/useNotifications';
import { LocalTime } from '@/components/primitives/LocalTime';
import {
  UNREAD_LABEL,
  canMarkRead,
  type Notification,
  type NotificationStatus,
} from '@/lib/types/notification';

// DESIGN.md §7.3 하드룰: 안 읽음은 항상 primary — 배지든 dot이든 칩이든.
// error 는 실제 오류(전달 실패) 전용이다.
//
// ⚠️ 인앱 알림 row 는 `pending → read` 만 전이한다 — `notify.ts` 가 pending 으로
// INSERT 하고 리포가 read 로 UPDATE 하며, `sent`/`failed` 를 쓰는 경로가 없다
// (TODOS.md 알림 절 ②). 그래서 **화면에 실제로 뜨는 안 읽음 칩은 `pending` 뿐**이다.
// 한때 그것이 `warning`/`대기` 였는데, `대기` 는 DB enum(`queued`) 이름이 샌 것이다 —
// 인앱 알림에는 발송 대기 단계가 없어서 행이 목록에 있다는 건 이미 도착했다는 뜻이다.
// 그 결과 헤더는 파란 `안 읽음 N건` 인데 그것이 세는 행들은 전부 주황이었다.
const statusColor: Record<NotificationStatus, ChipColor> = {
  pending: 'primary',
  sent: 'primary',
  failed: 'error',
  read: 'surface',
};

// 문구 단일 출처는 UNREAD_LABEL (UX_WRITING.md §8). pending·sent 가 같은 라벨인
// 것은 의도다 — 둘의 차이는 DB 사정이지 사용자에게 보일 구분이 아니다.
const statusLabel: Record<NotificationStatus, string> = {
  pending: UNREAD_LABEL,
  sent: UNREAD_LABEL,
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
  // `isUnread` 가 아니라 `canMarkRead` 다 — 실패 알림은 세지 않지만(칩이 `실패`)
  // 치울 수는 있어야 한다. 예전엔 여기 지역 변수 이름이 `isUnread` 라 공유
  // 술어와 이름은 같고 뜻은 달랐다.
  const dismissible = canMarkRead(notif);

  const navigate = () => {
    if (dismissible) {
      void markRead(notif.id);
    }
    if (notif.linkUrl) router.push(notif.linkUrl);
  };

  const markReadInPlace = () => {
    void markRead(notif.id).then(() => router.refresh());
  };

  const body = (
    <>
      <span className="md-numeric text-xs text-[var(--md-sys-color-on-surface-variant)] w-8 mt-0.5 shrink-0">
        {String(indexFromEnd).padStart(3, '0')}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="md-label-small text-[var(--md-sys-color-on-surface-variant)]">
            {notif.type}
          </span>
        </div>
        <p className={`text-[13px] font-medium ${dismissible ? 'text-[var(--md-sys-color-on-surface)]' : 'text-[var(--md-sys-color-on-surface-variant)]'}`}>
          {notif.title}
        </p>
        <p className="text-[12px] text-[var(--md-sys-color-on-surface-variant)] mt-0.5">
          {notif.body}
        </p>
        <div className="mt-2 flex items-center gap-3">
          <span className="md-numeric text-xs text-[var(--md-sys-color-on-surface-variant)]">
            <LocalTime iso={notif.createdAt} />
          </span>
        </div>
      </div>
      <div className="flex flex-col items-end gap-2 shrink-0">
        <Chip label={statusLabel[notif.status]} color={statusColor[notif.status]} />
        {!hasLink && dismissible && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              markReadInPlace();
            }}
            className="md-label-small text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors"
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
