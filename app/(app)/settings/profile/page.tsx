import { redirect } from 'next/navigation';
import { Label } from '@/components/primitives/Label';
import { Chip } from '@/components/primitives/Chip';
import { Avatar } from '@/components/primitives/Avatar';
import { PageEnter } from '@/components/primitives/PageEnter';
import { WorkspaceBizProfileForm } from '@/components/settings/WorkspaceBizProfileForm';
import { WorkspaceBizNoForm } from '@/components/settings/WorkspaceBizNoForm';
import { WorkspaceNameForm } from '@/components/settings/WorkspaceNameForm';
import { WorkspaceLogoForm } from '@/components/settings/WorkspaceLogoForm';
import { BizRequiredToast } from '@/components/settings/BizRequiredToast';
import { DeleteAccountSection } from '@/components/settings/DeleteAccountSection';
import { auth } from '@/auth';
import {
  getUserRepo,
  getWorkspaceRepo,
} from '@/lib/server/repositories/factory';
import { LocalDate } from '@/components/primitives/LocalTime';
import type { ReactNode } from 'react';
import { GRADE_LABELS } from '@/lib/types/biz-profile';

export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ biz_required?: string }> };

export default async function ProfilePage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user?.id || !session.user.workspaceId) {
    redirect('/login?next=/settings/profile');
  }

  const { biz_required } = await searchParams;
  const userRepo = await getUserRepo();
  const wsRepo = await getWorkspaceRepo();
  const me = await userRepo.findById(session.user.id);
  const ws = await wsRepo.findById(session.user.workspaceId);
  if (!me || !ws) {
    return (
      <div className="px-4 py-8 md:px-8 md:py-12">
        <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-[var(--md-sys-color-error)]">
          프로필 정보를 불러오지 못했습니다.
        </p>
      </div>
    );
  }

  const biz = ws.bizProfile;
  const grade = biz?.grade;
  const memberMeta = ws.members.find((m) => m.id === me.id);

  const wsKvPairs: [string, ReactNode][] = [
    ...(biz
      ? ([
          [
            '업태',
            biz.taxType === 'general'
              ? '일반과세'
              : biz.taxType === 'simple'
                ? '간이과세'
                : '면세',
          ],
          ...(grade
            ? ([['가맹점 등급', GRADE_LABELS[grade]]] as [string, ReactNode][])
            : []),
        ] as [string, ReactNode][])
      : []),
    ['생성일', <LocalDate key="createdAt" iso={ws.createdAt} />],
  ];

  const kvRowClass =
    'py-2 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4';
  const kvLabelClass =
    'font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)]';
  const kvValueClass =
    'text-[13px] text-[var(--md-sys-color-on-surface)] font-mono tabular-nums break-all sm:break-normal';

  return (
    <PageEnter className="px-4 py-6 md:px-8 md:py-8 space-y-8 md:space-y-10">
      <div>
        <Label size="md" muted={false} as="span" className="block mb-2">SETTINGS · PROFILE</Label>
        <h1 className="text-[26px] font-[700] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)]">
          프로필 설정
        </h1>
      </div>

      {/* User profile (read-only for now — name/avatar editing is M9 surface) */}
      <section>
        <div className="flex items-center gap-3 mb-3">
          <Label size="md" muted={false}>사용자</Label>
          <div className="flex-1 h-px bg-[var(--md-sys-color-outline-variant)]" />
        </div>
        <div className="flex items-center gap-4 mb-3">
          <Avatar
            name={me.name}
            color="primary"
            size="lg"
          />
          <div className="min-w-0">
            <p className="text-[14px] font-medium text-[var(--md-sys-color-on-surface)]">{me.name}</p>
            <p className="font-mono text-[11px] tabular-nums text-[var(--md-sys-color-on-surface-variant)] break-all">
              {me.email}
            </p>
          </div>
        </div>
        <div className="divide-y divide-[var(--md-sys-color-outline-variant)] border-y border-[var(--md-sys-color-outline-variant)]">
          <div className={kvRowClass}>
            <span className={kvLabelClass}>가입일</span>
            <span className={kvValueClass}><LocalDate iso={memberMeta?.joinedAt ?? me.joinedAt} /></span>
          </div>
        </div>
      </section>

      {/* Workspace + biz profile */}
      <section>
        <div className="flex items-center gap-3 mb-3">
          <Label size="md" muted={false}>워크스페이스</Label>
          <Chip label={ws.type === 'buyer' ? '구매사' : 'PG'} color="surface" />
          <div className="flex-1 h-px bg-[var(--md-sys-color-outline-variant)]" />
        </div>

        <div
          className={
            ws.type === 'buyer'
              ? 'grid grid-cols-1 lg:grid-cols-2 lg:gap-x-12'
              : ''
          }
        >
          {/* Left: meta KV (이름 폼 포함) */}
          <div className="divide-y divide-[var(--md-sys-color-outline-variant)] border-t border-[var(--md-sys-color-outline-variant)]">
            <WorkspaceLogoForm workspaceId={ws.id} name={ws.name} hasLogo={ws.hasLogo} />
            <WorkspaceNameForm
              currentName={ws.name}
              canEdit={memberMeta?.role === 'admin'}
            />
            {wsKvPairs.map(([k, v]) => (
              <div key={k} className={kvRowClass}>
                <span className={kvLabelClass}>{k}</span>
                <span className={kvValueClass}>{v}</span>
              </div>
            ))}
          </div>

          {/* Right: 사업자번호/등급 폼 (buyer only) */}
          {ws.type === 'buyer' && (
            <div className="mt-6 pt-6 border-t border-[var(--md-sys-color-outline-variant)] space-y-6 lg:mt-0 lg:pt-0 lg:border-t-0 lg:space-y-8">
              {biz_required === '1' && !biz && (
                <>
                  <BizRequiredToast />
                  <p
                    role="alert"
                    className="font-mono text-[10px] tracking-[0.12em] uppercase text-[var(--md-sys-color-error)]"
                  >
                    사업자번호를 등록하면 견적 요청을 보낼 수 있어요.
                  </p>
                </>
              )}
              <WorkspaceBizNoForm
                currentBizNo={biz?.bizNo ?? null}
                returnUrl={biz_required === '1' && !biz ? '/rfp-create' : undefined}
              />
              {biz && <WorkspaceBizProfileForm currentGrade={grade} />}
            </div>
          )}
        </div>
      </section>

      {/* 계정 탈퇴 */}
      <section>
        <div className="flex items-center gap-3 mb-3">
          <Label size="md" muted={false}>위험 영역</Label>
          <div className="flex-1 h-px bg-[var(--md-sys-color-error)]/20" />
        </div>
        <DeleteAccountSection />
      </section>
    </PageEnter>
  );
}
