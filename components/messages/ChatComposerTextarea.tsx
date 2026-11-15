'use client';

import { cn } from '@/lib/utils';

// 채팅 컴포저 공용 입력 — 자동 높이 증가 + IME 안전 Enter 전송.
// onChange 는 평문 값만 돌려준다(호출처가 setDraft·타이핑 신호 등을 처리). 자동 높이와
// Enter 처리는 이 컴포넌트가 소유한다. 멘션 등 onKeyDown/onChange 가 결합된
// 컴포저(TeamThreadView)는 대상이 아니다.
//
// 자동 높이는 CSS `field-sizing: content` 다. 내용에 맞춰 늘고 `max-h-40`(160px)에서
// 멈춰 스크롤되며, 전송 후 value 가 비면 저절로 한 줄로 돌아온다. `w-full min-w-0` 은
// 폭을 내용이 아니라 컨테이너에 고정한다(가로로 늘었다 줄었다 하지 않게). 미지원
// 브라우저는 `rows={1}` 한 줄 높이에 내부 스크롤로 동작한다.
const AUTO_GROW_CLASS = 'field-sizing-content max-h-40 w-full min-w-0';

export function ChatComposerTextarea({
  value,
  onChange,
  onSubmit,
  disabled,
  placeholder,
  maxLength,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
  className?: string;
}) {
  return (
    <textarea
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      maxLength={maxLength}
      rows={1}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          // 한글 IME 조합 확정 Enter(keyCode 229)는 전송이 아니다 — 조합 중 전송되면
          // 글자가 잘리거나 이중 전송된다.
          if (e.nativeEvent.isComposing) return;
          e.preventDefault();
          onSubmit();
        }
      }}
      className={cn(AUTO_GROW_CLASS, className)}
    />
  );
}
