// Notifications settings page — RSC.
//
// 알림 환경설정(이메일 수신, 채널 선호도 등)이 여기에 들어갈 예정입니다.
// 알림 활동 피드는 /notifications 전용 페이지로 이전되었습니다.
import { Label } from '@/components/primitives/Label';
import { PageEnter } from '@/components/primitives/PageEnter';

export const dynamic = 'force-dynamic';

export default function NotificationsSettingsPage() {
  return (
    <PageEnter className="px-4 py-6 md:px-8 md:py-8 space-y-8">
      <div>
        <Label size="md" muted={false} as="span" className="block mb-2">SETTINGS · NOTIFICATIONS</Label>
        <h1 className="text-[26px] font-[700] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)]">
          알림 설정
        </h1>
        <p className="mt-2 text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
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
    </PageEnter>
  );
}
