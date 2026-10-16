"use client";
import { ServerGuestQuoteResume } from "./ServerGuestQuoteResume";
import type { ServerGuestDraft } from "@/lib/guest-rfp/answers";
import { useState, type ComponentProps } from "react";
import Link from "next/link";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/primitives/Button";
import { RfpCreateWizard } from "./RfpCreateWizard";
import { RfpDraftProvider } from "@/lib/stores/rfp-draft-context";
import { useRfpDraftStore } from "@/lib/stores/rfp-draft";
import {
  bindGuestDraft,
  sameOwner,
  deleteGuestDraft,
  RESUME_KEY,
  type DraftOwner,
} from "@/lib/guest-rfp/draft";
import { guestFiles, prepareGuestFiles } from "@/lib/guest-rfp/files";
import { uploadAttachment } from "@/lib/attachments/upload-client";
import { verifyDraftFilesAction } from "@/lib/server/actions/rfp";
import { DRAFT_OWNER_ID } from "@/lib/server/storage/constants";
import { useGuestDraft } from "./useGuestDraft";
import { GuestAttachments } from "./GuestAttachments";
type Props = ComponentProps<typeof RfpCreateWizard> & { actor: DraftOwner };
export function GuestQuoteResume({ serverDrafts = [], ...props }: Props & { serverDrafts?: ServerGuestDraft[] }) {
 const [local, setLocal] = useState(false);
 return serverDrafts.length && !local ? <ServerGuestQuoteResume {...props} drafts={serverDrafts} onLocal={() => setLocal(true)} /> : <LocalGuestQuoteResume {...props} />;
}
function LocalGuestQuoteResume({ actor, ...props }: Props) {
  const { session, error, setError } = useGuestDraft(false);
  const [choice, setChoice] = useState<"guest" | "member" | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const member = useRfpDraftStore();
  const prepare = async () => {
    if (!session) throw new Error("초안을 다시 불러와요.");
    bindGuestDraft(session.draft, actor);
    const uploadedIds = session.draft.files.flatMap((f) =>
      f.uploaded ? [f.uploaded.id] : [],
    );
    if (uploadedIds.length) {
      const { validIds } = await verifyDraftFilesAction(
        uploadedIds,
        session.store.getState().matchingRequestKey ?? undefined,
      );
      session.invalidateUploads(validIds);
    }
    await prepareGuestFiles(
      session.draft,
      guestFiles.get,
      (file) =>
        uploadAttachment(file, {
          ownerKind: "rfp",
          ownerId: DRAFT_OWNER_ID,
          expectedActor: actor,
        }),
      () => session.save(),
    );
    const files = session.draft.files.map((file) => file.uploaded!);
    session.store.getState().setField("rfpFiles", files);
    session.save();
    return files;
  };
  const start = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await prepare();
      localStorage.removeItem(RESUME_KEY);
      setChoice("guest");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "초안을 복원하지 못했어요. 다시 시도해요.",
      );
    } finally {
      setBusy(false);
    }
  };
  const clear = async () => {
    if (!session) return;
    deleteGuestDraft(session.draft);
    session.stop();
    await Promise.all(session.draft.files.map((f) => guestFiles.remove(f.id)));
  };
  if (choice === "member") return <RfpCreateWizard {...props} />;
  if (session?.draft.owner && !sameOwner(session.draft.owner, actor))
    return (
      <div role="alert" className="space-y-3">
        <p>
          이 초안은 다른 계정 또는 워크스페이스에서 이어 쓰고 있어요. 원래
          계정으로 전환해요.
        </p>
        <Link href="/rfp-create">현재 계정에서 새 견적을 작성해요</Link>
      </div>
    );
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {error && (
        <p role="alert" className="text-[var(--md-sys-color-error)]">
          {error}
        </p>
      )}
      {!session ? (
        <Link href="/rfp-create">견적 작성을 시작해요</Link>
      ) : choice === "guest" ? (
        <RfpDraftProvider value={session.store}>
          <RfpCreateWizard
            {...props}
            resumedAnswers
            expectedActor={actor}
            prepareAttachments={() =>
              prepare().catch((e) => {
                setError(
                  e instanceof Error
                    ? e.message
                    : "첨부를 확인하지 못했어요. 다시 시도해요.",
                );
                throw e;
              })
            }
            attachmentEditor={
              <GuestAttachments
                session={session}
                busy={busy}
                setBusy={setBusy}
                onError={setError}
              />
            }
            attachmentsBusy={busy}
            onCreated={clear}
          />
        </RfpDraftProvider>
      ) : (
        <div className="space-y-4">
          <h2 className="text-[length:var(--md-typescale-title-large-size)] font-[number:var(--md-typescale-title-large-weight)] leading-[var(--md-typescale-title-large-line-height)] tracking-[var(--md-typescale-title-large-tracking)]">이어 쓸 견적을 골라요</h2>
          <p>로그인 전 초안: {session.draft.data.title || "작성 중인 견적"}</p>
          <Button disabled={busy} onClick={() => void start()}>
            로그인 전 초안을 이어 써요
          </Button>
          {(member.title ||
            member.websiteUrl ||
            member.rfpFiles.length > 0) && (
            <div className="space-y-2">
              <p>기존 회원 초안: {member.title || "작성 중인 견적"}</p>
              <Button
                variant="outlined"
                onClick={() => {
                  localStorage.removeItem(RESUME_KEY);
                  setChoice("member");
                }}
              >
                기존 회원 초안을 이어 써요
              </Button>
              <p className="text-[14px]">
                선택하지 않은 초안도 그대로 보관해요.
              </p>
            </div>
          )}
          {busy && (
            <p role="status">첨부를 업로드하고 초안을 복원하는 중이에요…</p>
          )}
          {session.draft.files.length > 0 && (
            <GuestAttachments
              session={session}
              busy={busy}
              setBusy={setBusy}
              onError={setError}
            />
          )}
          <Button
            variant="text"
            disabled={busy}
            onClick={() => setDeleteOpen(true)}
          >
            로그인 전 초안을 삭제해요
          </Button>
        </div>
      )}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="로그인 전 초안을 삭제할까요?"
        description="이 브라우저에 보관한 로그인 전 초안과 첨부를 삭제해요. 기존 회원 초안은 그대로 보관해요."
        confirmLabel="삭제해요"
        variant="danger"
        loading={busy}
        loadingLabel="삭제 중…"
        onConfirm={async () => {
          if (busy) return;
          setBusy(true);
          try {
            await clear();
            setDeleteOpen(false);
            setChoice("member");
          } catch {
            setDeleteOpen(false);
            setError("첨부 정리를 완료하지 못했어요.");
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}
