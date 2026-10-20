import { selectGuestAnswers } from "./answers";
import type { GuestDraft } from "./draft";
import { guestFiles } from "./files";
import { withGuestProof } from "./proof-client";
export const GUEST_SIGNUP_DRAFT_KEY = "support-b-guest-signup-draft";
export function signupGuestDraftId(): string | undefined {
  try {
    return sessionStorage.getItem(GUEST_SIGNUP_DRAFT_KEY) || undefined;
  } catch {
    return undefined;
  }
}
export async function publicDraftRequest<T>(input: unknown): Promise<T> {
  const issueProof = typeof input === "object" && input !== null && "op" in input && input.op === "session";
  return issueProof
    ? withGuestProof(() => sendPublicDraftRequest<T>(input))
    : sendPublicDraftRequest<T>(input);
}
async function sendPublicDraftRequest<T>(input: unknown): Promise<T> {
  const response = await fetch("/api/guest-rfp/drafts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(
      result.error === "GUEST_DRAFT_CHANGED"
        ? "다른 탭에서 초안을 변경했어요. 새로고침 후 이어서 작성해요."
        : "서버에 저장하지 못했어요. 입력한 내용은 유지했으니 다시 시도해요.",
    );
  }
  return response.json();
}
export async function saveGuestForSignup(
  draft: GuestDraft,
  persist: () => void,
) {
  await publicDraftRequest({ op: "session" });
  const saved = await publicDraftRequest<{ id: string; revision: number }>({
    op: "save",
    id: draft.id,
    revision: draft.serverRevision ?? 0,
    answers: selectGuestAnswers(draft.data),
    files: draft.files.map((file) => file.id),
  });
  draft.serverRevision = saved.revision;
  persist();
  for (const file of draft.files) {
    try {
      const reserved = await publicDraftRequest<{
        id: string;
        ready?: boolean;
        uploadUrl?: string;
      }>({
        op: "file",
        id: draft.id,
        file: {
          clientId: file.id,
          name: file.name,
          size: file.size,
          mime: file.type,
        },
      });
      if (reserved.ready) continue;
      const original = await guestFiles.get(file.id);
      if (!original) throw new Error("원본을 다시 선택해요.");
      const upload = await fetch(reserved.uploadUrl!, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: original,
      });
      if (!upload.ok) throw new Error("업로드를 다시 시도해요.");
      await publicDraftRequest({
        op: "complete",
        id: draft.id,
        fileId: reserved.id,
      });
    } catch {
      throw new Error(
        `${file.name} 저장을 완료하지 못했어요. ‘이 정보로 맞춤 견적 받기’를 눌러 다시 시도하거나 전체 수정에서 파일을 제거해요.`,
      );
    }
  }
  await publicDraftRequest({
    op: "finish",
    id: draft.id,
    revision: draft.serverRevision,
  });
  sessionStorage.setItem(GUEST_SIGNUP_DRAFT_KEY, draft.id);
}
