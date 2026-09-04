'use client';

import { Toast } from '@base-ui/react';

const { useToastManager } = Toast;
import { toastManager } from '@/lib/toast';
import { cn } from '@/lib/utils';

function ToastViewport() {
  const { toasts } = useToastManager();

  return (
    <Toast.Viewport className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 outline-none">
      {toasts.map((t) => (
        <Toast.Root
          key={t.id}
          toast={t}
          className={cn(
            'flex max-w-[min(92vw,24rem)] items-start justify-between gap-6 rounded-[var(--md-sys-shape-extra-small)] bg-[var(--md-sys-color-inverse-surface)] px-4 py-3 shadow-[var(--md-sys-elevation-3)] transition-all duration-200 data-[starting-style]:translate-y-1 data-[starting-style]:opacity-0 data-[ending-style]:translate-y-1 data-[ending-style]:opacity-0',
            t.type === 'success' && 'border-l-2 border-[var(--md-sys-color-tertiary)]',
          )}
        >
          <Toast.Title className="line-clamp-2 break-words text-[length:var(--md-typescale-body-medium-size)] text-[var(--md-sys-color-inverse-on-surface)]">
            {t.title}
          </Toast.Title>
          <div className="flex items-center gap-3 shrink-0">
            <Toast.Action className="md-label-medium text-[var(--md-sys-color-inverse-primary)] hover:underline">
              {t.actionProps?.children}
            </Toast.Action>
            <Toast.Close
              aria-label="닫기"
              className="text-[length:var(--md-typescale-label-medium-size)] text-[var(--md-sys-color-inverse-primary)] opacity-80 hover:opacity-100 transition-opacity"
            >
              ×
            </Toast.Close>
          </div>
        </Toast.Root>
      ))}
    </Toast.Viewport>
  );
}

export function ToasterProvider({ children }: { children: React.ReactNode }) {
  return (
    <Toast.Provider toastManager={toastManager}>
      {children}
      <ToastViewport />
    </Toast.Provider>
  );
}
