import { beforeEach, expect, it } from "vitest";
import {
  createGuestDraft,
  loadGuestDraft,
  saveGuestDraft,
  bindGuestDraft,
  validateGuestFile,
  guestResumeTarget,
  GUEST_DRAFT_KEY,
  RESUME_KEY,
} from "@/lib/guest-rfp/draft";
import { useRfpDraftStore } from "@/lib/stores/rfp-draft";
beforeEach(() => localStorage.clear());
it("round trips all answers and progress separately from the member draft", () => {
  useRfpDraftStore.getState().setField("title", "회원 초안");
  const draft = createGuestDraft();
  draft.data.title = "공개 초안";
  draft.data.contentQuestion = "attachments";
  draft.data.memo = "상담 메모";
  saveGuestDraft(draft);
  expect(loadGuestDraft()?.data).toEqual(draft.data);
  expect(useRfpDraftStore.getState().title).toBe("회원 초안");
});
it("binds once to both account and workspace and rejects other actors", () => {
  const d = createGuestDraft();
  saveGuestDraft(d);
  const owner = { userId: "u", workspaceId: "w" };
  expect(bindGuestDraft(d, owner).owner).toEqual(owner);
  expect(() => bindGuestDraft(d, { ...owner, userId: "other" })).toThrow();
  expect(() => bindGuestDraft(d, { ...owner, workspaceId: "other" })).toThrow();
  expect(bindGuestDraft(d, owner).owner).toEqual(owner);
});
it("does not swallow storage errors or corrupted drafts", () => {
  localStorage.setItem(GUEST_DRAFT_KEY, "{");
  expect(() => loadGuestDraft()).toThrow();
});
it("accepts only nonempty PDF/PNG/JPEG up to 20MB and five files", () => {
  expect(validateGuestFile({ type: "application/pdf", size: 1 }, 4)).toBeNull();
  for (const file of [
    { type: "text/html", size: 1 },
    { type: "image/png", size: 0 },
    { type: "image/jpeg", size: 20 * 1024 * 1024 + 1 },
  ])
    expect(validateGuestFile(file, 0)).not.toBeNull();
  expect(validateGuestFile({ type: "image/png", size: 1 }, 5)).not.toBeNull();
});
it("resume marker has a fixed internal destination and survives authentication gates", () => {
  expect(guestResumeTarget()).toBe("/home");
  localStorage.setItem(RESUME_KEY, "1");
  expect(guestResumeTarget()).toBe("/rfp-create?resume=guest");
  localStorage.setItem(RESUME_KEY, "https://evil.test");
  expect(guestResumeTarget()).toBe("/home");
});

it("rejects malformed saved field types instead of crashing the question renderer", () => {
  const draft = createGuestDraft();
  localStorage.setItem(
    GUEST_DRAFT_KEY,
    JSON.stringify({
      ...draft,
      data: { ...draft.data, requiredPaymentMethods: null },
    }),
  );
  expect(() => loadGuestDraft()).toThrow();
});
it("rejects a stale tab without overwriting newer answers or binding", () => {
  const d = createGuestDraft();
  saveGuestDraft(d);
  const stale = loadGuestDraft()!;
  d.data.title = "새로운 답변";
  saveGuestDraft(d);
  stale.data.title = "오래된 답변";
  expect(() => saveGuestDraft(stale)).toThrow("다른 탭");
  expect(loadGuestDraft()?.data.title).toBe("새로운 답변");
});

it("does not resurrect a persisted draft after another tab deletes it", () => {
  const draft = createGuestDraft();
  saveGuestDraft(draft);
  const stale = loadGuestDraft()!;
  localStorage.removeItem(GUEST_DRAFT_KEY);
  stale.data.memo = "삭제 뒤 오래된 탭의 입력";
  expect(() => saveGuestDraft(stale)).toThrow("다른 탭");
  expect(loadGuestDraft()).toBeNull();
});


it('기존 PG를 새로고침·계정 연결 뒤에도 보존하고 손상된 목록은 거부한다', () => {
  const d = createGuestDraft();
  d.data.currentPgs = [{ pgWorkspaceId: null, name: 'External PG' }];
  saveGuestDraft(d);
  const restored = loadGuestDraft()!;
  expect(restored.data.currentPgs).toEqual(d.data.currentPgs);
  bindGuestDraft(restored, { userId: 'buyer', workspaceId: 'workspace' });
  expect(loadGuestDraft()?.data.currentPgs).toEqual(d.data.currentPgs);
  localStorage.setItem(GUEST_DRAFT_KEY, JSON.stringify({ ...restored, data: { ...restored.data, currentPgs: null } }));
  expect(() => loadGuestDraft()).toThrow();
});


it.each([9, 11])('구버전 %s 회원 갱신 초안은 기존 PG 질문에서 다시 입력한다', async version => {
  useRfpDraftStore.getState().reset();
  localStorage.setItem('support-b-rfp-draft', JSON.stringify({ version, state: { contractType: 'renewal', contentQuestion: 'attachments', title: '보존' } }));
  await useRfpDraftStore.persist.rehydrate();
  expect(useRfpDraftStore.getState().contentQuestion).toBe('current-pgs');
  expect(useRfpDraftStore.getState().currentPgs).toEqual([]);
  expect(useRfpDraftStore.getState().title).toBe('보존');
});

it("returns automatic requests to their waiting screen after authentication", () => {
  localStorage.setItem("support-b-auto-request", crypto.randomUUID());
  localStorage.setItem(RESUME_KEY, "1");
  expect(guestResumeTarget()).toBe("/quote-start");
});
