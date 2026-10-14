"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/primitives/Button";
import { RfpDraftProvider } from "@/lib/stores/rfp-draft-context";
import type { PublicIndustry } from "@/lib/types/pg-recommendation";
import {
  RESUME_KEY,
  RESUME_PATH,
} from "@/lib/guest-rfp/draft";
import { guestFiles } from "@/lib/guest-rfp/files";
import { sendGuestEvent } from "@/lib/guest-rfp/events";
import { RfpQuestionFlow } from "./RfpQuestionFlow";
import { contentQuestions } from "./content-questions";
import { useGuestDraft } from "./useGuestDraft";
import { GuestAttachments } from "./GuestAttachments";
export function GuestQuoteStart({
  industryGroups,
}: {
  industryGroups: PublicIndustry[];
}) {
  const router = useRouter();
  const { session, error, setError } = useGuestDraft(true);
  const [busy, setBusy] = useState(false);
  const completing = useRef(false);
  const [done, setDone] = useState(false);
  const [attachmentError, setAttachmentError] = useState('');
  const [fileStatus, setFileStatus] = useState<'empty' | 'checking' | 'saved' | 'error'>('empty');
  useEffect(() => {
    if (!session || busy || done) return;
    let active = true;
    const verify = async () => {
      if (!session.draft.files.length) {
        if (active) setFileStatus('empty');
        return;
      }
      setFileStatus('checking');
      try {
        const files = await Promise.all(session.draft.files.map(file => guestFiles.get(file.id)));
        if (!active) return;
        const saved = files.every(Boolean) && session.pendingFiles.size === 0;
        setFileStatus(saved ? 'saved' : 'error');
        if (!saved) setAttachmentError('첨부 파일의 저장을 확인해요. 첨부 질문에서 다시 저장하거나 파일을 제거하고 다시 선택해요.');
      } catch {
        if (active) {
          setFileStatus('error');
          setAttachmentError('첨부 파일을 읽지 못했어요. 첨부 질문에서 다시 확인해요.');
        }
      }
    };
    void verify();
    return () => { active = false; };
  }, [session, busy, done]);
  const questionChange = useCallback(() => {}, []);
  const complete = async () => {
    if (!session || busy || completing.current) return;
    completing.current = true;
    setBusy(true);
    try {
      const missing = contentQuestions(
        session.store.getState(),
        industryGroups,
      ).find((q) => !q.valid);
      if (missing) {
        session.store.getState().setField("contentQuestion", missing.id);
        return;
      }
      session.save();
      for (const file of session.draft.files)
        if (!(await guestFiles.get(file.id))) {
          setAttachmentError(`${file.name} 저장을 완료해요. 다시 저장하거나 파일을 제거할 수 있어요.`);
          setFileStatus('error');
          return;
        }
      setAttachmentError('');
      setFileStatus(session.draft.files.length ? 'saved' : 'empty');
      session.complete();
      localStorage.setItem(RESUME_KEY, "1");
      sendGuestEvent(session.draft, "completed", industryGroups);
      setDone(true);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "초안을 저장하지 못했어요. 저장 공간을 확인하고 다시 시도해요.",
      );
    } finally {
      completing.current = false;
      setBusy(false);
    }
  };
  return (
    <div className="mx-auto grid w-full max-w-[608px] gap-6 px-4 py-6 lg:max-w-[1120px] lg:grid-cols-[360px_minmax(0,576px)] lg:justify-center lg:gap-16 lg:py-12">
      <div className="min-w-0 space-y-3 lg:space-y-6">
        <h1 className="text-[length:var(--md-typescale-headline-medium-size)] font-[number:var(--md-typescale-headline-medium-weight)] leading-[var(--md-typescale-headline-medium-line-height)] tracking-[var(--md-typescale-headline-medium-tracking)]">맞춤 PG 견적을 준비해요</h1>
        <p className="hidden text-[16px] leading-normal lg:block">내용을 작성한 뒤 로그인하고, 사업자 정보를 확인해 견적을 요청해요.</p>
        <ol aria-label="견적 요청 순서" className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-[var(--md-sys-color-on-surface-variant)] lg:flex-col lg:items-start lg:gap-5 lg:border-l lg:border-[var(--md-sys-color-outline-variant)] lg:pl-5 lg:text-[16px]">
          <li className="font-medium text-[var(--md-sys-color-primary)]"><span className="md-numeric mr-3 hidden lg:inline">01</span>내용 작성</li>
          <li><span aria-hidden="true" className="mr-1.5 lg:hidden">→</span><span className="md-numeric mr-3 hidden lg:inline">02</span>로그인·사업자 확인</li>
          <li><span aria-hidden="true" className="mr-1.5 lg:hidden">→</span><span className="md-numeric mr-3 hidden lg:inline">03</span>PG 선택·요청</li>
        </ol>
        <div className="border-y border-[var(--md-sys-color-outline-variant)] py-3 text-[13px] leading-normal text-[var(--md-sys-color-on-surface-variant)] lg:py-5 lg:text-[14px]">
          <aside aria-label="작성 전 안내" className="space-y-2 lg:space-y-4">
            <p><strong className="font-medium text-[var(--md-sys-color-on-surface)]">운영팀 전달</strong><br />홈페이지 답변 후 다음으로 이동할 때와 작성을 마칠 때, 입력한 홈페이지·업종·제목·계약 유형·첨부 개수를 운영팀에 전달해요.</p>
            <p><strong className="font-medium text-[var(--md-sys-color-on-surface)]">브라우저 보관</strong><br />답변과 첨부 원본은 이 브라우저에만 보관해요. 브라우저 데이터를 지우거나 저장 공간이 정리되면 복원할 수 없어요.</p>
          </aside>
          <p className="mt-4 hidden lg:block">다른 기기에서는 이어 쓸 수 없어요. 계약 유형에 따라 질문 수가 달라져요. 로그인·사업자 확인 후 PG사를 선택하고 직접 요청해요.</p>
          <details className="mt-1 lg:hidden">
            <summary className="min-h-11 cursor-pointer py-3 font-medium text-[var(--md-sys-color-on-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]/50">전달·보관 안내 자세히 보기</summary>
            <p className="pb-2">다른 기기에서는 이어 쓸 수 없어요. 계약 유형에 따라 질문 수가 달라져요. 로그인·사업자 확인 후 PG사를 선택하고 직접 요청해요.</p>
          </details>
        </div>
      </div>
      <section className="min-w-0 space-y-6" aria-label="견적 작성">
        {!session ? (
          <p>초안을 불러오는 중이에요…</p>
        ) : session.draft.owner ? (
          <div>
            <p>
              로그인한 계정에 연결된 초안이에요. 해당 계정에서 이어 쓸 수 있어요.
            </p>
            <Link
              className="inline-flex min-h-11 lg:min-h-8 items-center justify-center rounded-[var(--md-sys-shape-small)] px-3 font-medium text-[length:var(--md-typescale-label-large-size)] tracking-[var(--md-typescale-label-large-tracking)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]/50 bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] hover:bg-[color-mix(in_srgb,var(--md-sys-color-on-primary)_10%,var(--md-sys-color-primary))]"
              href={`/login?next=${encodeURIComponent(RESUME_PATH)}`}
            >
              로그인하고 이어 쓸게요
            </Link>
          </div>
        ) : done ? (
          <div className="space-y-4">
            <h2
              className="text-[length:var(--md-typescale-title-large-size)] font-[number:var(--md-typescale-title-large-weight)] leading-[var(--md-typescale-title-large-line-height)] tracking-[var(--md-typescale-title-large-tracking)]"
            >
              작성 내용을 보관했어요
            </h2>
            <p>로그인한 뒤 사업자 정보를 확인하고 PG사에 요청해요.</p>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                className="inline-flex min-h-11 lg:min-h-8 items-center justify-center rounded-[var(--md-sys-shape-small)] px-3 font-medium text-[length:var(--md-typescale-label-large-size)] tracking-[var(--md-typescale-label-large-tracking)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]/50 bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] hover:bg-[color-mix(in_srgb,var(--md-sys-color-on-primary)_10%,var(--md-sys-color-primary))]"
                href={`/login?next=${encodeURIComponent(RESUME_PATH)}`}
              >
                로그인하고 이어 쓸게요
              </Link>
              <Link
                className="inline-flex min-h-11 lg:min-h-8 items-center justify-center rounded-[var(--md-sys-shape-small)] px-3 font-medium text-[length:var(--md-typescale-label-large-size)] tracking-[var(--md-typescale-label-large-tracking)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]/50 border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-primary)] hover:bg-[var(--md-sys-color-surface-container)]"
                href={`/signup/buyer?next=${encodeURIComponent(RESUME_PATH)}`}
              >
                가입하고 이어 쓸게요
              </Link>
              <Button className="min-h-11 lg:min-h-8" variant="text" onClick={() => setDone(false)}>
                내용을 수정해요
              </Button>
            </div>
          </div>
        ) : (
          <RfpDraftProvider value={session.store}>
            <fieldset disabled={busy} className="min-w-0">
              <RfpQuestionFlow
                presentation="public"
                saving={busy}
                industryGroups={industryGroups}
                onBack={() => {
                  router.push("/");
                }}
                onNext={() => void complete()}
                onQuestionChange={questionChange}
                onAnswered={(id) => {
                  if (id === "website") {
                    try {
                      session.save();
                      sendGuestEvent(session.draft, "started", industryGroups);
                    } catch {
                      setError("초안을 저장하지 못했어요. 다시 저장해요.");
                    }
                  }
                }}
                attachments={
                  <GuestAttachments
                    session={session}
                    busy={busy}
                    setBusy={setBusy}
                    onError={setAttachmentError}
                  />
                }
              />
            </fieldset>
          </RfpDraftProvider>
        )}
        {(error || attachmentError || fileStatus === 'error') && <div className="space-y-3 border-t border-[var(--md-sys-color-outline-variant)] pt-4 text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
          {error && (
            <div role="alert" className="text-[var(--md-sys-color-error)]">
              {error}
              <Button
                variant="text"
                className="min-h-11 lg:min-h-8"
                disabled={busy}
                onClick={() => {
                  try {
                    session?.save();
                  } catch {
                    setError("저장 공간을 확인하고 다시 시도해요.");
                  }
                }}
              >
                다시 저장해요
              </Button>
            </div>
          )}
          {attachmentError && <p role="alert" className="text-[var(--md-sys-color-error)]">{attachmentError}</p>}
          {fileStatus === 'error' && <p role="status">첨부 원본을 아직 보관하지 못했어요</p>}
          {fileStatus === 'checking' && <p role="status">첨부 원본의 저장 상태를 확인하고 있어요…</p>}
          {fileStatus === 'error' && session && <Button className="min-h-11 lg:min-h-8" variant="text" disabled={busy} onClick={() => {
            setDone(false);
            session.store.getState().setField('contentQuestion', 'attachments');
          }}>첨부 확인하기</Button>}
        </div>}
      </section>
    </div>
  );
}
