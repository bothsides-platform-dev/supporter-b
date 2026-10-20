import { dismissServerGuestResumeAction, resumeServerGuestDraftAction } from '@/lib/server/actions/guest-drafts';
const bindJourney = vi.hoisted(() => vi.fn(async () => true));
vi.mock('@/lib/guest-rfp/journey-client', () => ({ guestJourney: { bind: bindJourney, track: vi.fn(), clear: vi.fn(), complete: vi.fn(), flush: vi.fn() } }));
vi.mock('@/lib/server/actions/guest-drafts', () => ({ dismissServerGuestResumeAction: vi.fn(), resumeServerGuestDraftAction: vi.fn(), saveServerGuestDraftAction: vi.fn(), deleteServerGuestDraftAction: vi.fn() }));
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { GuestQuoteResume } from "../GuestQuoteResume";
import {
  createGuestDraft,
  loadGuestDraft,
  saveGuestDraft,
  GUEST_DRAFT_KEY,
  RESUME_KEY,
} from "@/lib/guest-rfp/draft";
import { useRfpDraft } from "@/lib/stores/rfp-draft-context";
import { guestFiles, prepareGuestFiles } from "@/lib/guest-rfp/files";
import { useRfpDraftStore } from "@/lib/stores/rfp-draft";
import { verifyDraftFilesAction } from "@/lib/server/actions/rfp";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("../RfpCreateWizard", () => ({
  RfpCreateWizard: ({
    prepareAttachments,
    onCreated,
  }: {
    prepareAttachments?: () => Promise<unknown>;
    onCreated?: () => Promise<void>;
  }) => (
    <>
      <p>작성 중: {useRfpDraft((s) => s.title)}</p>
      <button onClick={() => void prepareAttachments?.().catch(() => {})}>
        첨부 다시 확인
      </button>
      <button onClick={() => void onCreated?.().catch(() => {})}>
        발송 후 정리
      </button>
    </>
  ),
}));
vi.mock("@/lib/server/actions/rfp", () => ({
  verifyDraftFilesAction: vi.fn(async () => ({ validIds: [] as string[] })),
}));
vi.mock("@/lib/guest-rfp/files", () => ({
  guestFiles: { get: vi.fn(), remove: vi.fn() },
  prepareGuestFiles: vi.fn(async () => {}),
}));
beforeEach(() => {
  localStorage.clear();
  vi.mocked(prepareGuestFiles).mockReset().mockResolvedValue();
  vi.mocked(verifyDraftFilesAction)
    .mockReset()
    .mockResolvedValue({ validIds: [] });
  useRfpDraftStore.getState().reset();
  const d = createGuestDraft();
  d.data.title = "공개 초안";
  saveGuestDraft(d);
});
const actor = { userId: "u", workspaceId: "w" };
it("keeps already-committed attachment IDs when resuming a successful request whose response was lost", async () => {
  const d = loadGuestDraft()!;
  d.data.matchingRequestKey = "request-key";
  d.files = [
    {
      id: "local-file",
      name: "contract.pdf",
      size: 10,
      type: "application/pdf",
      uploaded: {
        id: "committed-file",
        name: "contract.pdf",
        size: 10,
      },
    },
  ];
  saveGuestDraft(d);
  vi.mocked(verifyDraftFilesAction).mockImplementation(async (_, key) => ({
    validIds: key === "request-key" ? ["committed-file"] : [],
  }));
  render(<GuestQuoteResume actor={actor} pgList={[]} industryGroups={[]} />);
  fireEvent.click(
    await screen.findByRole("button", { name: "로그인 전 초안을 이어 써요" }),
  );
  await screen.findByText("작성 중: 공개 초안");
  expect(loadGuestDraft()?.files[0].uploaded?.id).toBe("committed-file");
});
it("preserves both drafts and uses only the selected public draft", async () => {
  vi.stubEnv('NEXT_PUBLIC_GUEST_RFP_SLACK_THREADS_ENABLED', 'true');
  const id = loadGuestDraft()!.id;
  localStorage.setItem(RESUME_KEY, "1");
  useRfpDraftStore.getState().setField("title", "기존 초안");
  render(<GuestQuoteResume actor={actor} pgList={[]} industryGroups={[]} />);
  fireEvent.click(
    await screen.findByRole("button", { name: "로그인 전 초안을 이어 써요" }),
  );
  expect(await screen.findByText("작성 중: 공개 초안")).toBeInTheDocument();
  expect(useRfpDraftStore.getState().title).toBe("기존 초안");
  expect(loadGuestDraft()?.owner).toEqual(actor);
  expect(localStorage.getItem(RESUME_KEY)).toBeNull();
  expect(bindJourney).toHaveBeenCalledWith(id, actor);
  vi.unstubAllEnvs();
});
it("allows selecting the member draft without overwriting the public draft", async () => {
  useRfpDraftStore.getState().setField("title", "기존 초안");
  render(<GuestQuoteResume actor={actor} pgList={[]} industryGroups={[]} />);
  fireEvent.click(
    await screen.findByRole("button", { name: "기존 회원 초안을 이어 써요" }),
  );
  expect(await screen.findByText("작성 중: 기존 초안")).toBeInTheDocument();
  expect(loadGuestDraft()?.data.title).toBe("공개 초안");
});
it("refuses automatic import into another account or workspace", async () => {
  const d = loadGuestDraft()!;
  d.owner = { userId: "other", workspaceId: "w" };
  saveGuestDraft(d);
  render(<GuestQuoteResume actor={actor} pgList={[]} industryGroups={[]} />);
  expect(
    await screen.findByText(/다른 계정 또는 워크스페이스/),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "로그인 전 초안을 이어 써요" }),
  ).toBeNull();
});

it("shows the specific attachment failure when final preparation fails", async () => {
  render(<GuestQuoteResume actor={actor} pgList={[]} industryGroups={[]} />);
  fireEvent.click(
    await screen.findByRole("button", { name: "로그인 전 초안을 이어 써요" }),
  );
  await screen.findByText("작성 중: 공개 초안");
  vi.mocked(prepareGuestFiles).mockRejectedValueOnce(
    new Error("계약.pdf 원본을 찾지 못했어요."),
  );
  fireEvent.click(screen.getByRole("button", { name: "첨부 다시 확인" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "계약.pdf 원본을 찾지 못했어요.",
  );
});

it.each([false, true])(
  "keeps a newer draft and its resume marker after old cleanup (same identity: %s)",
  async (sameIdentity) => {
    render(<GuestQuoteResume actor={actor} pgList={[]} industryGroups={[]} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "로그인 전 초안을 이어 써요" }),
    );
    await screen.findByText("작성 중: 공개 초안");
    const replacement = sameIdentity ? loadGuestDraft()! : createGuestDraft();
    if (!sameIdentity) localStorage.removeItem(GUEST_DRAFT_KEY);
    replacement.data.title = "다른 탭의 새 초안";
    saveGuestDraft(replacement);
    localStorage.setItem(RESUME_KEY, "1");
    fireEvent.click(screen.getByRole("button", { name: "발송 후 정리" }));
    expect(loadGuestDraft()?.id).toBe(replacement.id);
    expect(loadGuestDraft()?.data.title).toBe("다른 탭의 새 초안");
    expect(localStorage.getItem(RESUME_KEY)).toBe("1");
  },
);

it("keeps both drafts when the delete confirmation is closed", async () => {
  useRfpDraftStore.getState().setField("title", "회원 초안");
  render(<GuestQuoteResume actor={actor} pgList={[]} industryGroups={[]} />);
  fireEvent.click(await screen.findByRole("button", { name: "로그인 전 초안을 삭제해요" }));
  await screen.findByRole("dialog", { name: "로그인 전 초안을 삭제할까요?" });
  fireEvent.click(screen.getByRole("button", { name: "닫기" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(loadGuestDraft()?.data.title).toBe("공개 초안");
  expect(useRfpDraftStore.getState().title).toBe("회원 초안");
});
it("locks the delete dialog during attachment cleanup, then opens the preserved member draft", async () => {
  useRfpDraftStore.getState().setField("title", "회원 초안");
  const draft = loadGuestDraft()!;
  draft.files = [{ id: "file", name: "contract.pdf", size: 10, type: "application/pdf" }];
  saveGuestDraft(draft);
  let finish!: () => void;
  vi.mocked(guestFiles.remove).mockImplementationOnce(() => new Promise<undefined>((resolve) => { finish = () => resolve(undefined); }));
  render(<GuestQuoteResume actor={actor} pgList={[]} industryGroups={[]} />);
  fireEvent.click(await screen.findByRole("button", { name: "로그인 전 초안을 삭제해요" }));
  await screen.findByRole("dialog", { name: "로그인 전 초안을 삭제할까요?" });
  fireEvent.click(screen.getByRole("button", { name: "삭제해요" }));
  expect(await screen.findByRole("button", { name: "삭제 중…" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "닫기" })).toBeDisabled();
  await act(async () => finish());
  expect(await screen.findByText("작성 중: 회원 초안")).toBeInTheDocument();
  expect(loadGuestDraft()).toBeNull();
});

it('restores a server draft after browser storage was cleared and leaves the member draft intact', async () => {
 localStorage.clear(); useRfpDraftStore.getState().setField('title', '회원 초안');
 const server = { id: 'server-id', revision: 3, answers: { title: '서버 초안' }, requestKey: 'key', files: [{ id: 'file', name: 'a.pdf', size: 8 }], resumePending: true };
 vi.mocked(resumeServerGuestDraftAction).mockResolvedValue({ ok: true, draft: { ...server, resumePending: false } });
 render(<GuestQuoteResume actor={actor} pgList={[]} industryGroups={[]} serverDrafts={[server]} />);
 fireEvent.click(await screen.findByRole('button', { name: '계정에 보관한 초안을 이어 써요' }));
 expect(await screen.findByText('작성 중: 서버 초안')).toBeInTheDocument();
 expect(useRfpDraftStore.getState().title).toBe('회원 초안');
 expect(prepareGuestFiles).not.toHaveBeenCalled();
});

it('retires the matching browser copy once the durable server draft is selected', async () => {
 const local = loadGuestDraft()!;
 const server = { id: local.id, revision: 1, answers: { title: '서버 초안' }, requestKey: 'key', files: [], resumePending: true };
 vi.mocked(resumeServerGuestDraftAction).mockResolvedValue({ ok: true, draft: { ...server, resumePending: false } });
 render(<GuestQuoteResume actor={actor} pgList={[]} industryGroups={[]} serverDrafts={[server]} />);
 fireEvent.click(await screen.findByRole('button', { name: '계정에 보관한 초안을 이어 써요' }));
 await screen.findByText('작성 중: 서버 초안');
 expect(loadGuestDraft()).toBeNull();
});

it('consumes automatic return when choosing the existing member draft', async () => {
 useRfpDraftStore.getState().setField('title', '회원 초안');
 vi.mocked(dismissServerGuestResumeAction).mockResolvedValue({ ok: true });
 const server = { id: 'server-id', revision: 1, answers: { title: '서버 초안' }, requestKey: 'key', files: [], resumePending: true };
 render(<GuestQuoteResume actor={actor} pgList={[]} industryGroups={[]} serverDrafts={[server]} />);
 fireEvent.click(await screen.findByRole('button', { name: '기존 회원 초안을 이어 써요' }));
 expect(await screen.findByText('작성 중: 회원 초안')).toBeInTheDocument();
 expect(dismissServerGuestResumeAction).toHaveBeenCalledWith(actor);
});
