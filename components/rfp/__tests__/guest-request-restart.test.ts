import { beforeEach, it, expect } from "vitest";
import { GuestSession } from "../useGuestDraft";
import { createGuestDraft, loadGuestDraft } from "@/lib/guest-rfp/draft";
beforeEach(() => localStorage.clear());
it("starts a fresh public draft after cancellation without losing answers or local attachment references", () => {
  const draft = createGuestDraft();
  draft.data.title = "보존할 답변";
  draft.files = [
    { id: "file", name: "원본.pdf", size: 10, type: "application/pdf" },
  ];
  draft.serverRevision = 4;
  const oldId = draft.id;
  const session = new GuestSession(draft, () => {});
  session.save();
  session.restartAfterCancellation();
  expect(loadGuestDraft()).toMatchObject({
    data: { title: "보존할 답변" },
    files: [{ id: "file" }],
  });
  expect(loadGuestDraft()?.id).not.toBe(oldId);
  expect(loadGuestDraft()?.serverRevision).toBeUndefined();
});
