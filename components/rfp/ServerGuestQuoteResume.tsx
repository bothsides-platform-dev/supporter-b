"use client";
import { useEffect, useState, type ComponentProps } from "react";
import { createStore, type StoreApi } from "zustand";
import { RfpCreateWizard } from "./RfpCreateWizard";
import { RfpDraftProvider } from "@/lib/stores/rfp-draft-context";
import { useRfpDraftStore, type RfpDraftStore } from "@/lib/stores/rfp-draft";
import {
  draftData,
  loadGuestDraft,
  deleteGuestDraft,
  sameOwner,
  RESUME_KEY,
  type DraftOwner,
} from "@/lib/guest-rfp/draft";
import { guestFiles } from "@/lib/guest-rfp/files";
import {
  selectGuestAnswers,
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

type Props = ComponentProps<typeof RfpCreateWizard> & {
  actor: DraftOwner;
  drafts: ServerGuestDraft[];
  onLocal: () => void;
};
type Session = {
  draft: ServerGuestDraft;
  store: StoreApi<RfpDraftStore>;
  flush: () => Promise<{ id: string; revision: number }>;
  stop: () => void;
};
function errorText(code: string) {
  return code === "GUEST_DRAFT_CHANGED"
    ? "다른 탭에서 초안을 변경했어요. 새로고침 후 최신 내용을 확인해요."
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
  const [session, setSession] = useState<Session | null>(null);
  const [memberChosen, setMemberChosen] = useState(false);
  const [hasLocal, setHasLocal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<ServerGuestDraft | null>(null);
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
  useEffect(() => () => session?.stop(), [session]);
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
      if (!result.ok) throw new Error(errorText(result.error));
      const draft = result.draft;
      await clearMatchingLocal(draft.id);
      const defaults = draftData(useRfpDraftStore.getInitialState());
      const store = createStore<RfpDraftStore>((set) => ({
        ...defaults,
        ...draft.answers,
        matchingRequestKey: draft.requestKey,
        rfpFiles: draft.files,
        setField: (key, value) => set({ [key]: value }),
        reset: () => set(defaults),
      }));
      let queue: Promise<void> = Promise.resolve();
      let timer: ReturnType<typeof setTimeout> | undefined;
      let stopped = false;
      const flush = async () => {
        clearTimeout(timer);
        const state = store.getState();
        const answers = selectGuestAnswers(state),
          files = state.rfpFiles.map((file) => file.id);
        queue = queue
          .catch(() => {})
          .then(async () => {
            if (stopped) return;
            const saved = await saveServerGuestDraftAction(
              { id: draft.id, revision: draft.revision, answers, files },
              actor,
            );
            if (!saved.ok) throw new Error(errorText(saved.error));
            draft.revision = saved.revision;
            setError("");
          });
        await queue;
        return { id: draft.id, revision: draft.revision };
      };
      const unsubscribe = store.subscribe(() => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          void flush().catch((e) => setError(e.message));
        }, 400);
      });
      try {
        localStorage.removeItem(RESUME_KEY);
      } catch {
        /* No local storage required. */
      }
      setSession({
        draft,
        store,
        flush,
        stop: () => {
          stopped = true;
          clearTimeout(timer);
          unsubscribe();
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "초안을 다시 불러와요.");
    } finally {
      setBusy(false);
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
          {session && (
            <Button
              variant="text"
              onClick={() =>
                void session.flush().catch((e) => setError(e.message))
              }
            >
              다시 저장해요
            </Button>
          )}
        </div>
      )}
      {session ? (
        <RfpDraftProvider value={session.store}>
          <RfpCreateWizard
            {...props}
            resumedAnswers
            expectedActor={actor}
            prepareGuestDraft={session.flush}
            onCreated={async () => {
              session.stop();
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
