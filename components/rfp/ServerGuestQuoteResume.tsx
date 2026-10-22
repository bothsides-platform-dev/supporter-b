"use client";
import { useEffect, useRef, useState, type ComponentProps } from "react";
import { RfpCreateWizard } from "./RfpCreateWizard";
import { RfpDraftProvider } from "@/lib/stores/rfp-draft-context";
import { useRfpDraftStore } from "@/lib/stores/rfp-draft";
import { clearServerDraftBackup, createServerDraftSession, type ServerDraftSession } from '@/lib/guest-rfp/server-draft-session';
import { verifyDraftFilesAction } from '@/lib/server/actions/rfp';
import {
  loadGuestDraft,
  deleteGuestDraft,
  sameOwner,
  RESUME_KEY,
  type DraftOwner,
} from "@/lib/guest-rfp/draft";
import { guestFiles } from "@/lib/guest-rfp/files";
import {
  type ServerGuestDraft,
} from "@/lib/guest-rfp/answers";
import {
  dismissServerGuestResumeAction,
  resumeServerGuestDraftAction,
  saveServerGuestDraftAction,
  deleteServerGuestDraftAction,
} from "@/lib/server/actions/guest-drafts";
import { Button } from "@/components/primitives/Button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { guestJourney } from '@/lib/guest-rfp/journey-client';

type Props = ComponentProps<typeof RfpCreateWizard> & {
  actor: DraftOwner;
  drafts: ServerGuestDraft[];
  onLocal: () => void;
};
function errorText(code: string) {
  if (!code) return '';
  if (code === 'GUEST_BACKUP_UNAVAILABLE') return '이 브라우저에 수정 내용을 보관하지 못했어요. 다시 저장한 뒤 화면을 이동해요.';
  if (code === 'GUEST_FILES_NOT_READY') return '첨부를 다시 확인해요. 사라진 파일을 삭제하거나 다시 올린 뒤 저장해요.';
  return code === "GUEST_DRAFT_CHANGED"
    ? "다른 곳에서 초안을 수정했어요. 이 브라우저의 답변을 확인하고 이어 쓸 내용을 골라요."
    : code === "WORKSPACE_CHANGED"
      ? "워크스페이스가 바뀌었어요. 원래 워크스페이스에서 다시 열어요."
      : "초안을 저장하지 못했어요. 입력한 내용은 유지했으니 다시 시도해요.";
}
export function ServerGuestQuoteResume({
  actor,
  drafts,
  onLocal,
  ...props
}: Props) {
  const [items, setItems] = useState(drafts);
  const [session, setSession] = useState<ServerDraftSession | null>(null);
  const [memberChosen, setMemberChosen] = useState(false);
  const [hasLocal, setHasLocal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<ServerGuestDraft | null>(null);
  const [conflictChoice, setConflictChoice] = useState<'local' | 'server' | null>(null);
  const mounted = useRef(false);
  const activeSession = useRef<ServerDraftSession | null>(null);
  const member = useRfpDraftStore();
  useEffect(() => {
    // Hydrate browser-only storage after the server render, as useGuestDraft does.
    const hydrate = () => {
      try {
        const local = loadGuestDraft();
        setHasLocal(
          !!local &&
            !drafts.some((draft) => draft.id === local.id) &&
            (!local.owner || sameOwner(local.owner, actor)),
        );
      } catch {
        /* Server drafts remain available when browser storage is blocked. */
      }
    };
    hydrate();
  }, [drafts, actor]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      activeSession.current?.stop();
    };
  }, []);
  const clearMatchingLocal = async (id: string) => {
    try {
      const local = loadGuestDraft();
      if (local?.id === id && (!local.owner || sameOwner(local.owner, actor))) {
        deleteGuestDraft(local);
        await Promise.all(
          local.files.map((file) => guestFiles.remove(file.id)),
        );
      }
    } catch {
      /* Server completion is already durable. */
    }
  };
  const start = async (selected: ServerGuestDraft) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await resumeServerGuestDraftAction(selected.id, actor);
      if (!mounted.current) return;
      if (!result.ok) throw new Error(errorText(result.error));
      const draft = result.draft;
      if (process.env.NEXT_PUBLIC_GUEST_RFP_SLACK_THREADS_ENABLED === 'true') {
        void guestJourney.bind(draft.id, actor).then(ok => {
          if (ok) guestJourney.track('funnel_step_view', { funnel_id: 'acquisition', step_id: 'member_return' });
        });
      }
      await clearMatchingLocal(draft.id);
      if (!mounted.current) return;
      const nextSession = createServerDraftSession({
        draft,
        actor,
        save: async (input, expected) => {
          if (input.files.length) {
            const { validIds } = await verifyDraftFilesAction(input.files, draft.requestKey);
            if (input.files.some(id => !validIds.includes(id))) return { ok: false, error: 'GUEST_FILES_NOT_READY' };
          }
          return saveServerGuestDraftAction(input, expected);
        },
        refresh: async () => {
          const latest = await resumeServerGuestDraftAction(draft.id, actor);
          if (!latest.ok) throw new Error(latest.error);
          return latest.draft;
        },
        onError: code => setError(errorText(code)),
      });
      try {
        localStorage.removeItem(RESUME_KEY);
      } catch {
        /* No local storage required. */
      }
      activeSession.current = nextSession;
      setSession(nextSession);
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : "초안을 다시 불러와요.");
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const chooseOther = async (choose: () => void) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await dismissServerGuestResumeAction(actor);
      if (!result.ok) throw new Error(errorText(result.error));
      try {
        localStorage.removeItem(RESUME_KEY);
      } catch {
        /* Server marker is consumed. */
      }
      choose();
      guestJourney.clear();
    } catch (e) {
      setError(e instanceof Error ? e.message : "초안을 다시 불러와요.");
    } finally {
      setBusy(false);
    }
  };
  if (memberChosen) return <RfpCreateWizard {...props} />;
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {error && (
        <div role="alert" className="text-[var(--md-sys-color-error)]">
          {error}
          {session && !session.conflicted && (
            <Button
              variant="text"
              onClick={() =>
                void session.flush().catch((e) => setError(errorText(e.message)))
              }
            >
              다시 저장해요
            </Button>
          )}
        </div>
      )}
      {session?.conflicted && (
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => setConflictChoice('local')}>이 수정 내용으로 이어 써요</Button>
          <Button variant="outlined" disabled={busy} onClick={() => setConflictChoice('server')}>계정에 저장한 내용으로 이어 써요</Button>
        </div>
      )}
      {session ? (
        <RfpDraftProvider value={session.store}>
          <RfpCreateWizard
            {...props}
            resumedAnswers
            expectedActor={actor}
            prepareGuestDraft={session.flush}
            attachmentsBusy={session.conflicted || busy || props.attachmentsBusy}
            onCreated={async () => {
              guestJourney.complete();
              void guestJourney.flush();
              session.complete();
              await clearMatchingLocal(session.draft.id);
            }}
          />
        </RfpDraftProvider>
      ) : (
        <div className="space-y-4">
          <h2 className="text-[20px] font-semibold">이어 쓸 견적을 골라요</h2>
          {items.map((draft) => (
            <div key={draft.id} className="space-y-2">
              <p>{draft.answers.title || "작성 중인 견적"}</p>
              <Button disabled={busy} onClick={() => void start(draft)}>
                계정에 보관한 초안을 이어 써요
              </Button>
              <Button
                variant="text"
                disabled={busy}
                onClick={() => setDeleting(draft)}
              >
                로그인 전 초안을 삭제해요
              </Button>
            </div>
          ))}
          {(member.title ||
            member.websiteUrl ||
            member.rfpFiles.length > 0) && (
            <div className="space-y-2">
              <p>기존 회원 초안: {member.title || "작성 중인 견적"}</p>
              <Button
                variant="outlined"
                disabled={busy}
                onClick={() => void chooseOther(() => setMemberChosen(true))}
              >
                기존 회원 초안을 이어 써요
              </Button>
            </div>
          )}
          {hasLocal && (
            <Button
              variant="outlined"
              disabled={busy}
              onClick={() => void chooseOther(onLocal)}
            >
              이 브라우저의 다른 초안을 이어 써요
            </Button>
          )}
          <p>선택하지 않은 초안도 그대로 보관해요.</p>
          {busy && <p role="status">초안을 불러오는 중이에요…</p>}
        </div>
      )}
      <ConfirmDialog
        open={!!conflictChoice}
        onOpenChange={open => { if (!open) setConflictChoice(null); }}
        title={conflictChoice === 'local' ? '이 수정 내용으로 이어 쓸까요?' : '계정에 저장한 내용으로 이어 쓸까요?'}
        description={conflictChoice === 'local'
          ? '계정에 저장한 답변을 이 브라우저의 수정 내용으로 바꿔요. 첨부를 확인한 뒤 저장해요.'
          : '이 브라우저에 보관한 미저장 수정 내용을 지우고 계정에 저장한 최신 답변을 이어 써요. 다른 탭에서 보관한 수정 내용도 함께 지워요.'}
        confirmLabel={conflictChoice === 'local' ? '수정 내용으로 이어 써요' : '미저장 내용을 지우고 이어 써요'}
        loading={busy}
        loadingLabel="초안을 확인하는 중…"
        onConfirm={async () => {
          if (!session || !conflictChoice || busy) return;
          setBusy(true);
          try {
            await session.resolveConflict(conflictChoice);
            setConflictChoice(null);
          } catch (e) {
            setError(errorText(e instanceof Error ? e.message : 'SAVE_FAILED'));
          } finally { setBusy(false); }
        }}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="로그인 전 초안을 삭제할까요?"
        description="계정에 보관한 답변과 첨부를 삭제해요. 기존 회원 초안은 그대로 보관해요."
        confirmLabel="삭제해요"
        variant="danger"
        loading={busy}
        loadingLabel="삭제 중…"
        onConfirm={async () => {
          if (!deleting || busy) return;
          setBusy(true);
          try {
            const result = await deleteServerGuestDraftAction(
              { id: deleting.id, revision: deleting.revision },
              actor,
            );
            if (!result.ok) throw new Error(errorText(result.error));
            clearServerDraftBackup(actor, deleting.id);
            await clearMatchingLocal(deleting.id);
            setItems(items.filter((item) => item.id !== deleting.id));
            setDeleting(null);
          } catch (e) {
            setError(e instanceof Error ? e.message : "삭제를 다시 시도해요.");
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}
