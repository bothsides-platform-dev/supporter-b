'use client';
import Link from 'next/link';
import type { ComponentProps } from 'react';
import { useSessionAuthed } from './use-session-authed';
export function QuoteStartLink(
  props: Omit<ComponentProps<typeof Link>, 'href'>,
) {
  const authed = useSessionAuthed();
  return <Link {...props} href={authed ? '/rfp-create' : '/quote-start'} />;
}
