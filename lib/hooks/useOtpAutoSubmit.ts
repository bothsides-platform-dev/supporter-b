'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * OTP 코드가 정해진 자릿수를 채우는 순간 자동으로 제출한다.
 *
 * 코드 길이가 고정이라 마지막 자리를 채우는 순간 사용자의 의도는 명백하다 —
 * 버튼을 한 번 더 누르게 하지 않는다. 확인 버튼은 폴백으로 남는다.
 *
 * 자동 발화는 **같은 코드로 두 번 일어나지 않는다**. 틀린 코드를 넣은 뒤 한 자
 * 지웠다 같은 자를 다시 넣어도 재발화하지 않는다는 뜻인데, 그러지 않으면 사용자가
 * 의도하지 않은 재시도로 서버의 시도 횟수 제한(MAX_ATTEMPTS)을 소진시킨다.
 * 같은 코드를 다시 던지는 건 버튼 클릭이라는 명시적 경로만 허용한다.
 */
export function useOtpAutoSubmit({
  code,
  length = 6,
  enabled = true,
  onComplete,
}: {
  code: string;
  length?: number;
  /** false 면 발화하지 않고 기록도 남기지 않는다 — 나중에 켜지면 그때 발화한다. */
  enabled?: boolean;
  onComplete: () => void;
}): { reset: () => void } {
  const onCompleteRef = useRef(onComplete);
  const submittedRef = useRef<string | null>(null);

  // 콜백은 렌더마다 새 함수다 — ref 로 잡아 아래 effect 의 의존성에서 뺀다.
  // 이 effect 가 먼저 선언돼야 같은 커밋에서 최신 콜백을 보게 된다.
  useEffect(() => {
    onCompleteRef.current = onComplete;
  });

  useEffect(() => {
    if (!enabled) return;
    if (code.length !== length) return;
    if (submittedRef.current === code) return;
    submittedRef.current = code;
    onCompleteRef.current();
  }, [code, length, enabled]);

  /** 자동 제출 기록을 지운다 — 재전송으로 서버 코드가 갈릴 때 호출한다. */
  const reset = useCallback(() => {
    submittedRef.current = null;
  }, []);

  return { reset };
}
