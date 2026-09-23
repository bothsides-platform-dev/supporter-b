import { SettingsPage } from '@/components/settings/SettingsPage';
import { Skeleton } from '@/components/ui/skeleton';
import { Divider } from '@/components/primitives/Divider';


export function MembersPageSkeleton() {
  return (
    <SettingsPage title="멤버 관리" action={<Skeleton className="h-8 w-24" />}>
      <Skeleton className="h-4 w-52 max-w-full" />

      {/* 활성 멤버 */}
      <section>
        <div className="flex items-center gap-3 mb-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-6" />
          <Divider />
        </div>
        <div className="divide-y divide-[var(--md-sys-color-outline-variant)] border-y border-[var(--md-sys-color-outline-variant)]">
          {(['w-28', 'w-24', 'w-32'] as const).map((nw, i) => (
            <div key={i} className="flex items-center gap-3 py-3">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className={`h-3.5 ${nw}`} />
                <Skeleton className={`h-3 ${i % 2 === 0 ? 'w-36' : 'w-40'}`} />
              </div>
              <Skeleton className="hidden h-6 w-14 sm:block" />
              <Skeleton className="hidden h-3 w-36 sm:block" />
              <Skeleton className="h-8 w-8" />
            </div>
          ))}
        </div>
      </section>
    </SettingsPage>
  );
}
