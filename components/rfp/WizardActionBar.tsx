'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export const WizardActionTarget = createContext<HTMLElement | null>(null);

export function WizardActionBar({ children, className }: { children: ReactNode; className: string }) {
  const target = useContext(WizardActionTarget);
  const content = <div className={className}>{children}</div>;
  return target ? createPortal(content, target) : content;
}
