import { dismissServerGuestResumeAction, resumeServerGuestDraftAction, saveServerGuestDraftAction } from '@/lib/server/actions/guest-drafts';
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
    prepareGuestDraft,
    onCreated,
  }: {
    prepareAttachments?: () => Promise<unknown>;
    prepareGuestDraft?: () => Promise<unknown>;
    onCreated?: () => Promise<void>;
  }) => (
    <>
      <p>작성 중: {useRfpDraft((s) => s.title)}</p>
      <DraftTitleInput />
      <button onClick={() => void prepareAttachments?.().catch(() => {})}>
        첨부 다시 확인
      </button>
      <button onClick={() => void onCreated?.().catch(() => {})}>
        발송 후 정리
      </button>
      <button onClick={() => void prepareGuestDraft?.().catch(() => {})}>발송 준비</button>
    </>
  ),
}));
function DraftTitleInput() {
  const draft = useRfpDraft();
  return <input aria-label="견적 제목" value={draft.title} onChange={event => draft.setField('title', event.target.value)} />;
}
vi.mock("@/lib/server/actions/rfp", () => ({
  verifyDraftFilesAction: vi.fn(async () => ({ validIds: [] as string[] })),
}));
vi.mock("@/lib/guest-rfp/files", () => ({
  guestFiles: { get: vi.fn(), remove: vi.fn() },
  prepareGuestFiles: vi.fn(async () => {}),
}));
beforeEach(() => {
  localStorage.clear();
  vi.mocked(saveServerGuestDraftAction).mockReset().mockImplementation(async input => ({ ok: true, revision: input.revision + 1 }));
  vi.mocked(prepareGuestFiles).mockReset().mockResolvedValue();
  vi.mocked(verifyDraftFilesAction)
    .mockReset()
    .mockResolvedValue({ validIds: [] });
  useRfpDraftStore.getState().reset();
  const d = createGuestDraft();
  d.data.title = "공개 초안";
  saveGuestDraft(d);
});

it('recovers an unsaved server-draft edit after leaving before the debounce runs', async () => {
 const server = { id: 'server-id', revision: 3, answers: { title: '서버 초안' }, requestKey: 'key', files: [], resumePending: true };
 vi.mocked(resumeServerGuestDraftAction).mockImplementation(async () => ({ ok: true, draft: structuredClone(server) }));
 const first = render(<GuestQuoteResume actor={actor} pgList={[]} serverDrafts={[server]} />);
 fireEvent.click(await screen.findByRole('button', { name: '계정에 보관한 초안을 이어 써요' }));
 await screen.findByText('작성 중: 서버 초안');
 fireEvent.change(screen.getByRole('textbox', { name: '견적 제목' }), { target: { value: '떠나기 직전 답변' } });
 first.unmount();
 expect(saveServerGuestDraftAction).not.toHaveBeenCalled();
 render(<GuestQuoteResume actor={actor} pgList={[]} serverDrafts={[server]} />);
 fireEvent.click(await screen.findByRole('button', { name: '계정에 보관한 초안을 이어 써요' }));
 expect(await screen.findByRole('textbox', { name: '견적 제목' })).toHaveValue('떠나기 직전 답변');
});

it('blocks saving changed-revision recovery until the user confirms which answers to keep', async () => {
 const server = { id: 'server-id', revision: 3, answers: { title: '서버 초안' }, requestKey: 'key', files: [], resumePending: true };
 vi.mocked(resumeServerGuestDraftAction).mockImplementation(async () => ({ ok: true, draft: structuredClone(server) }));
 const first = render(<GuestQuoteResume actor={actor} pgList={[]} serverDrafts={[server]} />);
 fireEvent.click(await screen.findByRole('button', { name: '계정에 보관한 초안을 이어 써요' }));
 fireEvent.change(await screen.findByRole('textbox', { name: '견적 제목' }), { target: { value: '브라우저 수정본' } });
 first.unmount();
 server.revision = 4; server.answers.title = '다른 곳에서 저장한 답변';
 render(<GuestQuoteResume actor={actor} pgList={[]} serverDrafts={[server]} />);
 fireEvent.click(await screen.findByRole('button', { name: '계정에 보관한 초안을 이어 써요' }));
 expect(await screen.findByRole('textbox', { name: '견적 제목' })).toHaveValue('브라우저 수정본');
 fireEvent.click(screen.getByRole('button', { name: '발송 준비' }));
 expect(saveServerGuestDraftAction).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button', { name: '이 수정 내용으로 이어 써요' }));
 expect(await screen.findByRole('dialog')).toHaveTextContent('계정에 저장한 답변을 이 브라우저의 수정 내용으로 바꿔요');
 fireEvent.click(screen.getByRole('button', { name: '수정 내용으로 이어 써요' }));
 await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
 fireEvent.click(screen.getByRole('button', { name: '발송 준비' }));
 await waitFor(() => expect(saveServerGuestDraftAction).toHaveBeenCalledWith(expect.objectContaining({ revision: 4, answers: expect.objectContaining({ title: '브라우저 수정본' }) }), actor));
});

it('does not show the previous actor session after the account or workspace changes', async () => {
 const first = { id: 'first-draft', revision: 3, answers: { title: '이전 계정 답변' }, requestKey: 'first-key', files: [], resumePending: true };
 const second = { ...first, id: 'second-draft', answers: { title: '다른 계정 답변' }, requestKey: 'second-key' };
 vi.mocked(resumeServerGuestDraftAction).mockImplementation(async id => ({ ok: true, draft: structuredClone(id === first.id ? first : second) }));
 const page = render(<GuestQuoteResume actor={actor} pgList={[]} serverDrafts={[first]} />);
 fireEvent.click(await screen.findByRole('button', { name: '계정에 보관한 초안을 이어 써요' }));
 expect(await screen.findByRole('textbox', { name: '견적 제목' })).toHaveValue('이전 계정 답변');
 fireEvent.change(screen.getByRole('textbox', { name: '견적 제목' }), { target: { value: '이전 계정 미저장 답변' } });
 page.rerender(<GuestQuoteResume actor={{ userId: 'other-user', workspaceId: 'other-workspace' }} pgList={[]} serverDrafts={[second]} />);
 expect(screen.queryByText('작성 중: 이전 계정 미저장 답변')).toBeNull();
 fireEvent.click(await screen.findByRole('button', { name: '계정에 보관한 초안을 이어 써요' }));
 expect(await screen.findByRole('textbox', { name: '견적 제목' })).toHaveValue('다른 계정 답변');
});

it('does not start recovery autosave when the resume response arrives after leaving', async () => {
 const server = { id: 'server-id', revision: 3, answers: { title: '서버 초안' }, requestKey: 'key', files: [], resumePending: true };
 vi.mocked(resumeServerGuestDraftAction).mockImplementation(async () => ({ ok: true, draft: structuredClone(server) }));
 const first = render(<GuestQuoteResume actor={actor} pgList={[]} serverDrafts={[server]} />);
 fireEvent.click(screen.getByRole('button', { name: '계정에 보관한 초안을 이어 써요' }));
 fireEvent.change(await screen.findByRole('textbox', { name: '견적 제목' }), { target: { value: '보관할 답변' } });
 first.unmount();
 vi.useFakeTimers();
 try {
   let finish!: (result: Awaited<ReturnType<typeof resumeServerGuestDraftAction>>) => void;
   vi.mocked(resumeServerGuestDraftAction).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
   const second = render(<GuestQuoteResume actor={actor} pgList={[]} serverDrafts={[server]} />);
   fireEvent.click(screen.getByRole('button', { name: '계정에 보관한 초안을 이어 써요' }));
   second.unmount();
   await act(async () => finish({ ok: true, draft: structuredClone(server) }));
   await act(async () => vi.advanceTimersByTimeAsync(500));
   expect(saveServerGuestDraftAction).not.toHaveBeenCalled();
 } finally { vi.useRealTimers(); }
});

it('blocks a recovered missing attachment instead of submitting an incomplete draft', async () => {
 const server = { id: 'server-id', revision: 3, answers: { title: '첨부 초안' }, requestKey: 'key', files: [{ id: 'missing-file', name: 'a.pdf', size: 8 }], resumePending: true };
 vi.mocked(resumeServerGuestDraftAction).mockImplementation(async () => ({ ok: true, draft: structuredClone(server) }));
 render(<GuestQuoteResume actor={actor} pgList={[]} serverDrafts={[server]} />);
 fireEvent.click(await screen.findByRole('button', { name: '계정에 보관한 초안을 이어 써요' }));
 fireEvent.click(await screen.findByRole('button', { name: '발송 준비' }));
 expect(await screen.findByRole('alert')).toHaveTextContent('첨부를 다시 확인해요');
 expect(saveServerGuestDraftAction).not.toHaveBeenCalled();
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
