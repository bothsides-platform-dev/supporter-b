'use client';

import { useEffect, useRef } from 'react';
import { toast } from '@/lib/toast';

export function PgRfpBlockedToast() {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    toast('견적 요청 작성은 구매사 계정 전용이에요. 받은 견적 요청은 인박스에서 확인해요.', { type: 'info' });
  }, []);

  return null;
}
