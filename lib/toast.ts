import { Toast } from '@base-ui/react';

const { createToastManager } = Toast;

export const toastManager = createToastManager();

export function toast(
  message: string,
  opts?: { id?: string; type?: 'info' | 'error' | 'success'; timeout?: number },
) {
  return toastManager.add({
    id: opts?.id,
    title: message,
    type: opts?.type ?? 'info',
    timeout: opts?.timeout ?? 5000,
  });
}
