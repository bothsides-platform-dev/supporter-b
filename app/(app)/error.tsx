'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { ErrorPageLayout } from '@/components/shell/ErrorPageLayout';

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <ErrorPageLayout
      code="500"
      title="오류가 발생했어요"
      description="일시적인 문제가 생겼어요. 잠시 후 다시 시도해요."
      variant="error"
      chip="서버 오류"
      primaryAction={{ label: '다시 시도', onClick: reset }}
      secondaryAction={{ label: '홈으로 돌아가기', href: '/' }}
    />
  );
}
