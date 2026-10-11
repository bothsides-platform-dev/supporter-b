"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/primitives/Button";
import { RfpDraftProvider } from "@/lib/stores/rfp-draft-context";
import type { PublicIndustry } from "@/lib/types/pg-recommendation";
import {
  RESUME_KEY,
  RESUME_PATH,
  GUEST_DRAFT_KEY,
  deleteGuestDraft,
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
  const [done, setDone] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const questionChange = useCallback(() => {}, []);
  const complete = async () => {
    if (!session || busy) return;
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
        if (!(await guestFiles.get(file.id)))
          throw new Error(
            `${file.name} 저장을 완료해요. 다시 저장하거나 파일을 제거할 수 있어요.`,
          );
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
      setBusy(false);
    }
  };
  const discard = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (session) {
        deleteGuestDraft(session.draft);
        session.stop();
        for (const file of session.draft.files)
          await guestFiles.remove(file.id);
      } else {
        localStorage.removeItem(GUEST_DRAFT_KEY);
        localStorage.removeItem(RESUME_KEY);
      }
      setDeleteOpen(false);
      window.location.reload();
    } catch (e) {
      setDeleteOpen(false);
      setError(
        e instanceof Error
          ? e.message
          : "초안을 삭제하지 못했어요. 다시 시도해요.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 py-6">
      <div className="px-4">
        <h1
          className="text-[length:var(--md-typescale-title-large-size)] font-[number:var(--md-typescale-title-large-weight)] leading-[var(--md-typescale-title-large-line-height)] tracking-[var(--md-typescale-title-large-tracking)]"
        >
          맞춤 PG 견적을 준비해요
        </h1>
        <p className="mt-2 text-[14px] text-[var(--md-sys-color-on-surface-variant)]">
          홈페이지 답변과 전체 작성이 끝나면 작성 진행과 홈페이지·업종·제목·계약
          유형·첨부 개수를 운영팀에 전달해요. 견적 요청은 로그인 후 직접
          확인하고 보내요.
        </p>
        <p className="mt-2 text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
          같은 브라우저에서 이어 쓸 수 있어요. 브라우저 저장 데이터를 지우면
          초안을 복원할 수 없어요.
        </p>
      </div>
      {error && (
        <div role="alert" className="px-4 text-[var(--md-sys-color-error)]">
          {error}
          <Button
            variant="text"
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
      {!session ? (
        <p>초안을 불러오는 중이에요…</p>
      ) : session.draft.owner ? (
        <div className="px-4">
          <p>
            로그인한 계정에 연결된 초안이에요. 해당 계정에서 이어 쓸 수 있어요.
          </p>
          <Link
            className="inline-flex min-h-8 items-center justify-center rounded-[var(--md-sys-shape-small)] px-3 font-medium text-[length:var(--md-typescale-label-large-size)] tracking-[var(--md-typescale-label-large-tracking)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]/50 bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] hover:bg-[color-mix(in_srgb,var(--md-sys-color-on-primary)_10%,var(--md-sys-color-primary))]"
            href={`/login?next=${encodeURIComponent(RESUME_PATH)}`}
          >
            로그인하고 이어 쓸게요
          </Link>
        </div>
      ) : done ? (
        <div className="space-y-4 px-4">
          <h2
          className="text-[length:var(--md-typescale-title-large-size)] font-[number:var(--md-typescale-title-large-weight)] leading-[var(--md-typescale-title-large-line-height)] tracking-[var(--md-typescale-title-large-tracking)]"
        >
          작성 내용을 보관했어요
        </h2>
          <p>로그인한 뒤 사업자 정보를 확인하고 PG사에 요청해요.</p>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              className="inline-flex min-h-8 items-center justify-center rounded-[var(--md-sys-shape-small)] px-3 font-medium text-[length:var(--md-typescale-label-large-size)] tracking-[var(--md-typescale-label-large-tracking)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]/50 bg-[var(--md-sys-color-primary)] text-[var(--md-sys-color-on-primary)] hover:bg-[color-mix(in_srgb,var(--md-sys-color-on-primary)_10%,var(--md-sys-color-primary))]"
              href={`/login?next=${encodeURIComponent(RESUME_PATH)}`}
            >
              로그인하고 이어 쓸게요
            </Link>
            <Link
              className="inline-flex min-h-8 items-center justify-center rounded-[var(--md-sys-shape-small)] px-3 font-medium text-[length:var(--md-typescale-label-large-size)] tracking-[var(--md-typescale-label-large-tracking)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-sys-color-primary)]/50 border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-primary)] hover:bg-[var(--md-sys-color-surface-container)]"
              href={`/signup/buyer?next=${encodeURIComponent(RESUME_PATH)}`}
            >
              가입하고 이어 쓸게요
            </Link>
            <Button variant="text" onClick={() => setDone(false)}>
              내용을 수정해요
            </Button>
          </div>
        </div>
      ) : (
        <RfpDraftProvider value={session.store}>
          <fieldset disabled={busy} className="min-w-0 px-4">
            <RfpQuestionFlow
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
                  onError={setError}
                />
              }
            />
          </fieldset>
        </RfpDraftProvider>
      )}
      <div className="px-4">
        <Button variant="text" disabled={busy} onClick={() => setDeleteOpen(true)}>
          임시 초안을 삭제해요
        </Button>
      </div>
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="임시 초안을 삭제할까요?"
        description="이 브라우저에 보관한 로그인 전 초안과 첨부를 삭제해요. 삭제한 내용은 복원할 수 없어요."
        confirmLabel="삭제해요"
        variant="danger"
        loading={busy}
        loadingLabel="삭제 중…"
        onConfirm={discard}
      />
    </div>
  );
}
