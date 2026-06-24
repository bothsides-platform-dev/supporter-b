'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ComposeIcon } from '@/components/icons';
import { sendChatMessageAction } from '@/lib/server/actions/chat/sendChatMessageAction';
import { FieldError } from '@/components/primitives/FieldError';

// 간단 이메일 검증 — 액션이 권위 있는 검증을 한 번 더 하므로 여기선 빈 호출만 막는다.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 액션 에러코드 → 사용자 문구(해요체). 모르는 코드는 일반 문구로.
function errorMessage(code: string): string {
  switch (code) {
    case 'COUNTERPARTY_NOT_FOUND':
      return '해당 이메일로 연결된 상대를 찾지 못했어요.';
    case 'INVALID_COUNTERPARTY':
      return '같은 유형의 워크스페이스에는 메시지를 보낼 수 없어요.';
    case 'INVALID_INPUT':
      return '입력을 다시 확인해 주세요.';
    default:
      return '메시지를 보내지 못했어요. 잠시 후 다시 시도해 주세요.';
  }
}

/**
 * 새 대화 시작 진입점 — 인박스 상단 버튼 → 우측 Sheet.
 *
 * (a) RFP로 연결된 상대 목록 선택 / (b) 이메일 직접 입력(콜드 컨택).
 * 현재는 (b) 이메일 경로만 구현 — 연결된 상대 목록을 돌려주는 로더가 아직
 * 없으므로(conversationLoaders 에 listConversationsForViewer/loadConversationThread
 * 만 존재) 후속 TODO: RFP 연결 상대 풀 로더 추가 후 선택 UI를 이 Sheet에 합친다.
 * 선택/입력 후 첫 메시지를 sendChatMessageAction(counterpartyEmail) 으로 전송한다.
 */
export function NewConversationSheet() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  function reset() {
    setEmail('');
    setBody('');
    setError(null);
    setSending(false);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  async function handleSend() {
    setError(null);
    const trimmedEmail = email.trim();
    const trimmedBody = body.trim();

    if (!EMAIL_RE.test(trimmedEmail)) {
      setError('올바른 이메일 주소를 입력하세요.');
      return;
    }
    if (trimmedBody.length === 0) {
      setError('보낼 메시지를 입력하세요.');
      return;
    }

    setSending(true);
    const result = await sendChatMessageAction({
      counterpartyEmail: trimmedEmail,
      body: trimmedBody,
    });
    setSending(false);

    if (result.ok) {
      handleOpenChange(false);
      router.refresh();
      return;
    }
    setError(errorMessage(result.error));
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <ComposeIcon size={14} />새 대화
      </Button>

      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>새 대화 시작</SheetTitle>
            <SheetDescription>
              상대 이메일을 입력하고 첫 메시지를 보내 대화를 시작하세요.
            </SheetDescription>
          </SheetHeader>

          <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="new-conv-email"
                className="text-[12px] font-medium text-[var(--md-sys-color-on-surface-variant)]"
              >
                상대 이메일
              </label>
              <Input
                id="new-conv-email"
                type="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="partner@example.com"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="new-conv-body"
                className="text-[12px] font-medium text-[var(--md-sys-color-on-surface-variant)]"
              >
                메시지
              </label>
              <textarea
                id="new-conv-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="상대에게 보낼 메시지를 입력하세요"
                rows={6}
                className="w-full resize-none rounded-[var(--md-sys-shape-medium)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] px-3 py-2.5 text-[13px] text-[var(--md-sys-color-on-surface)] outline-none placeholder:text-[var(--md-sys-color-on-surface-variant)] focus-visible:border-[var(--md-sys-color-primary)]"
              />
            </div>

            <FieldError error={error ?? undefined} />
          </div>

          <div className="flex justify-end gap-2 border-t border-[var(--md-sys-color-outline-variant)] p-4">
            <Button variant="ghost" size="sm" onClick={() => handleOpenChange(false)}>
              취소
            </Button>
            <Button size="sm" disabled={sending} onClick={handleSend}>
              보내기
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
