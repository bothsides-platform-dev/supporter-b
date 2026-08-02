'use client';

/**
 * SigningSendEmbed — 딜룸 계약 탭의 스노우싸인 발송 임베드 패널.
 *
 * PG 가 이 iframe 안에서 자사 계약서 PDF 를 올리고 서명칸을 배치해 바로 발송한다.
 * 앱은 PDF 도 좌표도 저장하지 않는다 — 전부 스노우싸인 안에서 일어난다.
 *
 * **신뢰 경계**: 여기서 오는 postMessage 는 "계약이 만들어진 것 같다"는 힌트일 뿐이다.
 * 오리진을 정확히 대조하고(파싱 실패 시 fail-closed) 이벤트 형태를 검사한 뒤에도,
 * 실제 소유·상태 검증은 서버(`attachProviderContract`)가 재조회로 다시 한다.
 * 이 프레임은 앱 콘텐츠 영역의 대부분을 그리는 서드파티 오리진이므로 sandbox 로 가둔다.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';

import { Button } from '@/components/primitives/Button';
import { Skeleton } from '@/components/ui/skeleton';
import { extractContractId, isEmbedCompletionEvent } from '@/lib/signing/embed-events';

const dim = 'text-[var(--md-sys-color-on-surface-variant)]';

/**
 * 임베드가 실제로 요구하는 최소 권한. 스크립트·폼·업로드 다이얼로그·팝업(간편인증)이
 * 필요하고, same-origin 은 스노우싸인이 자기 세션 스토리지를 읽기 위해 필요하다.
 * top-navigation 은 주지 않는다 — 서드파티 프레임이 우리 페이지를 통째로 다른 곳으로
 * 보낼 수 있으면 피싱 벡터가 된다.
 */
/** 이 시간 안에 로드되지 않으면 실패로 본다(서드파티 화면이라 넉넉히 잡는다). */
const EMBED_LOAD_TIMEOUT_MS = 15_000;

const SANDBOX = [
  'allow-scripts',
  'allow-same-origin',
  'allow-forms',
  'allow-popups',
  'allow-popups-to-escape-sandbox',
  'allow-downloads',
  'allow-modals',
].join(' ');

export function SigningSendEmbed({
  iframeUrl,
  buyerSigner,
  onComplete,
  onReload,
  onClose,
}: {
  iframeUrl: string;
  /** 구매사 서명 담당자 — PG 가 임베드 안에서 수신자로 직접 입력해야 한다. */
  buyerSigner?: { name: string; email: string } | null;
  /** 임베드가 계약 생성을 알렸다. 인자는 아직 검증되지 않은 provider 계약 id. */
  /**
   * 임베드가 알린 provider 계약 id — **아직 검증되지 않은 값**이다(브라우저에서 왔다).
   * 진짜 게이트는 서버의 attachProviderContract 다.
   *
   * 바인딩에 성공하면 true. false 면 완료 1회 가드를 풀어 재시도를 받는다.
   */
  onComplete: (providerContractId: string) => Promise<boolean>;
  /** 로드에 실패했을 때 세션을 새로 발급받아 다시 열기. 없으면 재시도 버튼을 숨긴다. */
  onReload?: () => void;
  onClose: () => void;
}) {
  // iframe 의 오리진이 유일한 신뢰 기준이다. 파싱에 실패하면 빈 문자열이 아니라
  // null 로 두어, 아래 가드가 **모든** 메시지를 거부하도록 한다(fail-closed).
  const trustedOrigin = useMemo(() => {
    try {
      return new URL(iframeUrl).origin;
    } catch {
      return null;
    }
  }, [iframeUrl]);

  // 완료는 한 번만 보고한다. 임베드가 같은 이벤트를 여러 번 보내거나 리마운트 없이
  // 재전송해도 attach 가 중복 호출되지 않는다(서버도 멱등이지만 여기서 먼저 막는다).
  //
  // 다만 **성공했을 때만** 잠근다. 실패에도 잠가버리면 계약은 스노우싸인에서 실제로
  // 발송됐는데(메일이 이미 나갔다) 우리는 그 id 를 영영 못 받는다 — 자동 복구 경로가
  // 없어서(SNOWSIGN_SANDBOX Q3) 고아가 확정된다. 재시도를 받아야 한다.
  // loading → ready(onLoad) | failed(타임아웃 또는 onError).
  //
  // 타임아웃이 주 판정이고 `onError` 는 덤이다 — 실제로 "영영 안 뜨는" 경우(세션 만료,
  // 차단, 응답 없는 연결)는 error 이벤트를 아예 안 주는 쪽이 흔하다. 이벤트만 믿으면
  // 사용자는 빈 화면을 무한정 본다.
  //
  // url 이 바뀌면 상태를 되돌리는 대신 **부모가 `key={url}` 로 새로 마운트한다** —
  // 세션이 바뀌면 iframe 도 어차피 새것이라 초기화가 곧 재마운트다.
  const [phase, setPhase] = useState<'loading' | 'ready' | 'failed'>('loading');
  useEffect(() => {
    const t = setTimeout(() => {
      setPhase((p) => (p === 'loading' ? 'failed' : p));
    }, EMBED_LOAD_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, []);

  const doneRef = useRef(false);
  // 리스너를 재구독하지 않고도 최신 콜백을 부르기 위한 ref. 렌더 중에 쓰면
  // concurrent 렌더에서 버려질 렌더의 값이 남을 수 있어 커밋 후에만 갱신한다.
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    doneRef.current = false;
    function onMessage(e: MessageEvent) {
      if (!trustedOrigin || e.origin !== trustedOrigin) return;
      if (doneRef.current) return;
      if (!isEmbedCompletionEvent(e.data)) return;
      const contractId = extractContractId(e.data);
      if (!contractId) return;
      doneRef.current = true;
      void onCompleteRef.current(contractId).then((ok) => {
        if (!ok) doneRef.current = false;
      });
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [trustedOrigin]);

  return (
    <div className="border-t border-[var(--md-sys-color-outline-variant)]">
      <div className="flex flex-wrap items-start gap-2 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium">계약서를 올리고 서명칸을 배치해 주세요</p>
          <p className={'mt-0.5 text-[12.5px] ' + dim}>
            아래 화면은 스노우싸인이에요. 발송까지 마치면 이 딜룸에 서명 진행 상태가 나타나요.
          </p>
        </div>
        <Button variant="text" size="sm" onClick={onClose} aria-label="닫기">
          <X className="size-[15px]" aria-hidden />
          닫기
        </Button>
      </div>

      {buyerSigner && (
        // 임베드는 참여자 프리필을 지원하지 않아 PG 가 수신자를 직접 타이핑한다.
        // 오타 하나로 엉뚱한 사람에게 계약이 나가므로 정확한 값을 눈앞에 둔다.
        <div className="mx-4 mb-3 rounded-md border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] px-3 py-2">
          <p className={'text-[12px] ' + dim}>구매사 서명 담당자 — 수신자로 이 주소를 넣어 주세요</p>
          <p className="mt-0.5 text-[13px]">
            <span className="font-medium">{buyerSigner.name}</span>{' '}
            <span className="md-numeric">{buyerSigner.email}</span>
          </p>
        </div>
      )}

      {/* 서드파티 화면이라 로드까지 시간이 걸리고, 세션 만료·차단이면 영영 안 뜬다.
          아무 표시가 없으면 빈 영역이 '앱이 멈췄다'와 구분되지 않는다. */}
      <div className="relative">
        {phase === 'loading' && (
          <div
            role="status"
            aria-label="계약서 화면을 불러오는 중"
            className="absolute inset-0 grid place-items-center bg-[var(--md-sys-color-surface-container-lowest)]"
          >
            <div className="w-full max-w-[420px] space-y-2.5 px-6">
              <Skeleton className="h-3 w-2/5" />
              <Skeleton className="h-[220px] w-full rounded-md" />
              <Skeleton className="h-3 w-3/5" />
            </div>
          </div>
        )}
        {phase === 'failed' && (
          <div className="absolute inset-0 grid place-items-center bg-[var(--md-sys-color-surface-container-lowest)] px-6">
            <div className="text-center">
              <p className="text-[13px] font-medium">계약서 화면을 불러오지 못했어요</p>
              <p className={'mt-1 text-[12.5px] ' + dim}>
                네트워크를 확인하고 다시 열어보세요. 계속 안 되면 문의해 주세요.
              </p>
              {onReload && (
                <Button variant="outlined" size="sm" className="mt-3" onClick={onReload}>
                  다시 열기
                </Button>
              )}
            </div>
          </div>
        )}
        <iframe
          title="스노우싸인 계약서 발송"
          src={iframeUrl}
          sandbox={SANDBOX}
          referrerPolicy="no-referrer"
          allow="camera; clipboard-write"
          onLoad={() => setPhase('ready')}
          onError={() => setPhase('failed')}
          className="h-[min(72dvh,760px)] min-h-[420px] w-full border-0"
        />
      </div>
    </div>
  );
}
