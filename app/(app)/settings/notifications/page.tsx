import { requireSession } from '@/lib/auth/session';
import { getAlimtalkRepo } from '@/lib/server/repositories/factory';
import { BusinessAlimtalkSettings } from '@/components/settings/BusinessAlimtalkSettings';
import { SettingsPage } from '@/components/settings/SettingsPage';
import { PageEnter } from '@/components/primitives/PageEnter';

export const dynamic = 'force-dynamic';

export default async function NotificationsSettingsPage() {
  const session = await requireSession();
  const preference = await (
    await getAlimtalkRepo()
  ).preference(session.user.id);
  const phone = preference?.phone?.replace(/[\s-]/g, '');
  const maskedPhone =
    phone && /^010\d{8}$/.test(phone) ? `010-****-${phone.slice(-4)}` : null;
  return (
    <PageEnter className="flex h-full min-h-0 flex-col">
      <SettingsPage title="알림 설정">
        <BusinessAlimtalkSettings
          enabled={preference?.enabled ?? true}
          maskedPhone={maskedPhone}
        />
        <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
          받은 알림 기록은{' '}
          <a
            href="/notifications"
            className="text-[var(--md-sys-color-primary)] underline"
          >
            알림 페이지
          </a>
          에서 확인해요.
        </p>
      </SettingsPage>
    </PageEnter>
  );
}
