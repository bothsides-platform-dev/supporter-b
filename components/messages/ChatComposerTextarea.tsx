'use client';

import { useAutoGrowTextarea } from './useAutoGrowTextarea';

// 채팅 컴포저 공용 입력 — 자동 높이 증가 + IME 안전 Enter 전송.
// onChange 는 평문 값만 돌려준다(호출처가 setDraft·타이핑 신호 등을 처리). 자동 높이와
// Enter 처리는 이 컴포넌트가 소유한다. value 가 빈 문자열로 바뀌면(전송 후 초기화) 높이를
// 자동으로 리셋한다. 멘션 등 onKeyDown/onChange 가 결합된 컴포저(TeamThreadView)는
// 대상이 아니다.
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
  const { ref, resize } = useAutoGrowTextarea(value);

  return (
    <textarea
      ref={ref}
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      maxLength={maxLength}
      rows={1}
      onChange={(e) => {
        onChange(e.target.value);
        resize();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          // 한글 IME 조합 확정 Enter(keyCode 229)는 전송이 아니다 — 조합 중 전송되면
          // 글자가 잘리거나 이중 전송된다.
          if (e.nativeEvent.isComposing) return;
          e.preventDefault();
          onSubmit();
        }
      }}
      className={className}
    />
  );
}
