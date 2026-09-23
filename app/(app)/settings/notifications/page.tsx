// Notifications settings page — RSC.
//
// 알림 환경설정(이메일 수신, 채널 선호도 등)이 여기에 들어갈 예정입니다.
// 알림 활동 피드는 /notifications 전용 페이지로 이전되었습니다.
import { SettingsPage } from '@/components/settings/SettingsPage';
import { PageEnter } from '@/components/primitives/PageEnter';

export const dynamic = 'force-dynamic';

export default function NotificationsSettingsPage() {
  return (
    <PageEnter className="flex h-full min-h-0 flex-col">
      <SettingsPage title="알림 설정">
        <div>
          <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
            알림 환경설정(이메일 수신, 채널 선호도 등)이 이 화면에 들어갈 예정입니다.
          </p>
        </div>
        <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
          받은 알림 기록은{' '}
          <a href="/notifications" className="text-[var(--md-sys-color-primary)] underline">
            알림 페이지
          </a>
          에서 확인해요.
        </p>
      </SettingsPage>
    </PageEnter>
  );
}
