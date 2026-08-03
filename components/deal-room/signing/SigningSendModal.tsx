'use client';

/**
 * SigningSendModal — 계약서 보내기 전체화면 모달.
 *
 * PG 가 스노우싸인 임베드에서 자사 계약서 PDF 를 올리고 서명칸을 배치해 발송하는
 * 작업은 되돌리기 어렵고(발송 = 양측에 서명 요청 메일) 화면 면적을 많이 먹는다.
 * 딜룸 카드 안 인라인 패널 대신 딜룸 위를 덮는 모달로 띄워 면적과 집중을 함께 준다.
 *
 * **이탈은 반드시 확인을 거친다.** 작업물(PDF·서명칸 좌표)은 스노우싸인 안에만 있고
 * 우리는 사본이 없다 — iframe 이 언마운트되면 그대로 사라진다. 모달은 백드롭 클릭과
 * Escape 라는 실수하기 쉬운 이탈 경로를 기본으로 달고 오므로, 세 경로(백드롭·Escape·
 * 닫기)를 모두 확인 다이얼로그로 수렴시킨다. Dialog 는 controlled 이므로 여기서
 * `open` 을 내리지 않는 한 닫히지 않는다.
 *
 * 확인은 **무조건** 뜬다. iframe 은 서드파티 오리진이라 진행 상태를 읽을 수 없어
 * "아직 아무것도 안 했으니 그냥 닫아도 된다"를 판별할 방법이 없다.
 *
 * 리스·하트비트·이어받기·서버 액션은 SigningTab 이 소유한다 — 이 컴포넌트는 표현과
 * 이탈만 책임진다. 언마운트에서 onClose 를 부르지 않는 것도 그래서다(반납은 저쪽 일).
 */
import { useState } from 'react';
import { X } from 'lucide-react';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';

import { Button } from '@/components/primitives/Button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { SigningSendEmbed } from './SigningSendEmbed';

const dim = 'text-[var(--md-sys-color-on-surface-variant)]';

export function SigningSendModal({
  iframeUrl,
  buyerSigner,
  onComplete,
  onReload,
  onClose,
}: {
  iframeUrl: string;
  /** 구매사 서명 담당자 — PG 가 임베드 안에서 수신자로 직접 입력해야 한다. */
  buyerSigner?: { name: string; email: string } | null;
  /** 임베드가 알린 provider 계약 id. 진짜 게이트는 서버의 attachProviderContract 다. */
  onComplete: (providerContractId: string) => Promise<boolean>;
  /** 로드에 실패했을 때 세션을 새로 발급받아 다시 열기. */
  onReload?: () => void;
  /** 확인을 통과했을 때만 불린다 — 부모가 리스를 반납하고 모달을 언마운트한다. */
  onClose: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <DialogPrimitive.Root
      open
      // 백드롭(outside-press)과 Escape(escape-key)가 여기로 온다. 어느 쪽이든 `open` 을
      // 내리지 않고 확인창만 띄운다 — controlled 라 이것만으로 닫히지 않는다.
      // (닫기 버튼은 아래에서 직접 setConfirmOpen 을 부른다.)
      onOpenChange={(next) => {
        if (!next) setConfirmOpen(true);
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          data-testid="signing-send-backdrop"
          className="fixed inset-0 z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 dark:bg-white/10"
        />
        <DialogPrimitive.Popup
          data-testid="signing-send-modal"
          className="fixed top-1/2 left-1/2 z-50 flex h-[calc(100dvh-2rem)] w-[min(1400px,100dvw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[var(--md-sys-shape-extra-large)] bg-[var(--md-sys-color-surface)] shadow-[var(--md-sys-elevation-4)] ring-1 ring-[var(--md-sys-color-outline-variant)] outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95"
        >
          <header className="flex shrink-0 items-center gap-3 border-b border-[var(--md-sys-color-outline-variant)] px-4 py-2.5">
            <DialogPrimitive.Title className="shrink-0 text-[13.5px] font-semibold">
              계약서 보내기
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className={'min-w-0 flex-1 truncate text-[12.5px] ' + dim}>
              {buyerSigner ? (
                <>
                  수신자{' '}
                  <span className="font-medium text-[var(--md-sys-color-on-surface)]">
                    {buyerSigner.name}
                  </span>{' '}
                  <span className="md-numeric">{buyerSigner.email}</span>
                </>
              ) : (
                '계약서를 올리고 서명칸을 배치하면 바로 발송돼요'
              )}
            </DialogPrimitive.Description>
            {/* base-ui 의 Dialog.Close 를 쓰지 않는다 — primitives/Button 은 children 이
                필수라 `render={<Button />}`(children 없는 엘리먼트)이 tsc 에서 깨진다.
                평범한 onClick 으로 같은 곳(확인창)에 도착한다. */}
            <Button variant="text" size="sm" onClick={() => setConfirmOpen(true)}>
              <X className="size-[15px]" aria-hidden />
              닫기
            </Button>
          </header>

          {/* min-h-0 이 없으면 flex 자식이 콘텐츠 높이로 부풀어 헤더를 밀어낸다. */}
          <div className="min-h-0 flex-1">
            <SigningSendEmbed iframeUrl={iframeUrl} onComplete={onComplete} onReload={onReload} />
          </div>

          {/* Popup 안에 두어야 base-ui 가 중첩 관계를 인식하고, 확인창이 열려도 위
              임베드가 언마운트되지 않는다(형제 노드). SigningTab 의 취소·이어받기
              확인창이 딜룸 모달 안에 놓이는 것과 같은 배치다. */}
          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title="계약서 작성을 그만둘까요?"
            description="작성 중인 계약서와 배치한 서명칸은 저장되지 않아요. 다시 열면 처음부터 올려야 해요."
            confirmLabel="그만두기"
            cancelLabel="계속 작성하기"
            variant="danger"
            onConfirm={() => {
              setConfirmOpen(false);
              onClose();
            }}
          />
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
