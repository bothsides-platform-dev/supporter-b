'use client';

import { useEffect, useRef } from 'react';
import { toast } from '@/lib/toast';

export function BizRequiredToast() {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    toast('제안 생성 전 사업자번호를 등록해 주세요.', { type: 'info' });
  }, []);

  return null;
}
