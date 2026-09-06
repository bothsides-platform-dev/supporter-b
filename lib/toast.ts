import { Toast } from '@base-ui/react';

const { createToastManager } = Toast;

export const toastManager = createToastManager();

export function toast(
  message: string,
  opts?: {
    id?: string;
    type?: 'info' | 'error' | 'success';
    timeout?: number;
    onClose?: () => void;
    action?: { label: string; onClick: () => void };
  },
) {
  let toastId = '';
  toastId = toastManager.add({
    id: opts?.id,
    title: message,
    type: opts?.type ?? 'info',
    timeout: opts?.timeout ?? 5000,
    onClose: opts?.onClose,
    actionProps: opts?.action
      ? {
          children: opts.action.label,
          onClick: () => {
            opts.action?.onClick();
            toastManager.close(toastId);
          },
        }
      : undefined,
  });
  return toastId;
}
