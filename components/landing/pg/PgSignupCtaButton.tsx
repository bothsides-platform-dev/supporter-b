'use client';

import { type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/primitives/Button';
import { useSignupDraftStore } from '@/lib/stores/signup-draft';

type Props = {
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
};

export function PgSignupCtaButton({ children, size = 'lg' }: Props) {
  const router = useRouter();
  const { setWorkspaceType, reset } = useSignupDraftStore();

  const handleClick = () => {
    reset();
    setWorkspaceType('pg');
    router.push('/signup/pg');
  };

  return (
    <Button size={size} onClick={handleClick}>
      {children}
    </Button>
  );
}
