import { INSTANT_CONSULT_KEY, INSTANT_RESUME_KEY, loadGuestDraft, deleteGuestDraft } from './draft';
import { inputSchema, type InstantInput } from '@/lib/rfp/instant-quote';
import type { BusinessConfirmation } from './business-confirmation';

const inputKey = (id: string) => 'instant-quote-input:' + id;
export function readInstantResume(id: string, business?: BusinessConfirmation) {
  try {
    if (!business || sessionStorage.getItem(INSTANT_RESUME_KEY) !== id) return;
    const value = inputSchema.safeParse(
      JSON.parse(sessionStorage.getItem(inputKey(id)) ?? 'null'),
    ).data;
    if (
      value?.business.bizNo === business.bizNo &&
      value.business.website === business.website
    )
      return value;
  } catch {
    /* A blocked or expired browser store can start a fresh preview. */
  }
}
export function rememberInstantInput(id: string, input: InstantInput) {
  try {
    sessionStorage.setItem(inputKey(id), JSON.stringify(input));
    sessionStorage.setItem(INSTANT_RESUME_KEY, id);
  } catch {
    /* The current preview remains usable. */
  }
}
// 초안 스키마는 서버·이전 빌드와 공유하고 strict라서, 상담 선택은 초안 밖에 초안 ID로만 남긴다.
export function rememberConsult(id: string) {
  try {
    localStorage.setItem(INSTANT_CONSULT_KEY, id);
  } catch {
    /* The current page still continues the consultation. */
  }
}
export function choseConsult(id: string) {
  try {
    return localStorage.getItem(INSTANT_CONSULT_KEY) === id;
  } catch {
    return false;
  }
}
export function clearInstantResume(id: string, completed = false) {
  try {
    if (sessionStorage.getItem(INSTANT_RESUME_KEY) === id)
      sessionStorage.removeItem(INSTANT_RESUME_KEY);
    sessionStorage.removeItem(inputKey(id));
    if (completed) {
      const draft = loadGuestDraft();
      if (draft?.id === id && !draft.files.length) deleteGuestDraft(draft);
    }
  } catch {
    /* The server already owns the confirmed application. */
  }
}
