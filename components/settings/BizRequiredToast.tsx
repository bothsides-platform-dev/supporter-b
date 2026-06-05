'use client';

import { useEffect, useRef } from 'react';
import { toast } from '@/lib/toast';

export function BizRequiredToast() {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    toast('사업자번호를 등록하면 견적 요청을 보낼 수 있어요.', { type: 'info' });
  }, []);

  return null;
}
