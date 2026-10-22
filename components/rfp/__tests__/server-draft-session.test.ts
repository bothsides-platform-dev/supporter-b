import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { clearServerDraftBackup, createServerDraftSession } from '@/lib/guest-rfp/server-draft-session';
import type { ServerGuestDraft } from '@/lib/guest-rfp/answers';
import { GUEST_DRAFT_TTL_MS } from '@/lib/guest-rfp/draft';

const actor = { userId: 'user-a', workspaceId: 'workspace-a' };
const original: ServerGuestDraft = { id: 'draft-a', revision: 3, answers: { title: '서버 답변' }, requestKey: 'request-key', files: [], resumePending: false };
type Session = ReturnType<typeof createServerDraftSession>;
const sessions: Session[] = [];
function open(options: Partial<Parameters<typeof createServerDraftSession>[0]> = {}) {
  const session = createServerDraftSession({
    draft: structuredClone(original), actor, onError: () => {},
    save: async input => ({ ok: true, revision: input.revision + 1 }),
    refresh: async () => structuredClone(original),
    ...options,
  });
  sessions.push(session);
  return session;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); });
afterEach(() => { sessions.splice(0).forEach(session => session.stop()); vi.useRealTimers(); });

it('keeps an edit made immediately before dispose for the same owner, draft, and server revision', () => {
  const first = open();
  first.store.getState().setField('title', '아직 저장하지 않은 답변');
  first.stop();
  expect(open().store.getState().title).toBe('아직 저장하지 않은 답변');
});

it.each([
  { actor: { ...actor, userId: 'user-b' } },
  { actor: { ...actor, workspaceId: 'workspace-b' } },
  { draft: { ...original, id: 'draft-b' } },
])('does not recover another owner or draft: %j', options => {
  const first = open();
  first.store.getState().setField('title', '다른 소유자의 답변');
  first.stop();
  expect(open(options).store.getState().title).toBe('서버 답변');
});

it('requires an explicit choice when the server revision changed and preserves the local preview', async () => {
  const first = open();
  first.store.getState().setField('title', '로컬 수정본');
  first.stop();
  const latest = { ...original, revision: 4, answers: { title: '새 서버 답변' } };
  let saved = false;
  const next = open({ draft: latest, save: async () => { saved = true; return { ok: true, revision: 5 }; } });
  expect(next.conflicted).toBe(true);
  expect(next.store.getState().title).toBe('로컬 수정본');
  await expect(next.flush()).rejects.toThrow('GUEST_DRAFT_CHANGED');
  await vi.advanceTimersByTimeAsync(1000);
  expect(saved).toBe(false);
  next.stop();
  expect(open({ draft: latest }).store.getState().title).toBe('로컬 수정본');
});

it('rebases a deliberately selected local edit on a freshly fetched revision', async () => {
  const first = open();
  first.store.getState().setField('title', '로컬 수정본'); first.stop();
  const next = open({
    draft: { ...original, revision: 4 },
    refresh: async () => ({ ...original, revision: 5 }),
    save: async input => input.revision === 5 && input.answers.title === '로컬 수정본'
      ? { ok: true, revision: 6 } : { ok: false, error: 'GUEST_DRAFT_CHANGED' },
  });
  await next.resolveConflict('local');
  expect(next.conflicted).toBe(false);
  await expect(next.flush()).resolves.toEqual({ id: 'draft-a', revision: 6 });
});

it('discards the local edit only after explicitly selecting the latest server copy', async () => {
  const first = open(); first.store.getState().setField('title', '로컬 수정본'); first.stop();
  const latest = { ...original, revision: 5, answers: { title: '사용자가 고른 서버본' } };
  const next = open({ draft: { ...original, revision: 4 }, refresh: async () => latest });
  await next.resolveConflict('server');
  expect(next.store.getState().title).toBe('사용자가 고른 서버본');
  next.stop();
  expect(open({ draft: latest }).store.getState().title).toBe('사용자가 고른 서버본');
});

it('allows new edits after explicitly discarding a recovery copy written by another tab', async () => {
  const first = open();
  const second = open();
  first.store.getState().setField('title', '다른 탭 수정본');
  second.store.getState().setField('title', '이 탭 수정본');
  expect(second.conflicted).toBe(true);
  await second.resolveConflict('server');
  second.store.getState().setField('title', '서버본에서 새로 수정');
  expect(second.conflicted).toBe(false);
  first.complete();
  second.stop();
  expect(open().store.getState().title).toBe('서버본에서 새로 수정');
});

it('serializes saves and advances revision before the final flush', async () => {
  const firstSave = deferred<{ ok: true; revision: number }>();
  const inputs: { revision: number; title?: string }[] = [];
  const session = open({ save: async input => {
    inputs.push({ revision: input.revision, title: input.answers.title });
    return inputs.length === 1 ? firstSave.promise : { ok: true, revision: 5 };
  } });
  session.store.getState().setField('title', '첫 편집');
  await vi.advanceTimersByTimeAsync(400);
  session.store.getState().setField('title', '최종 편집');
  const flushed = session.flush();
  expect(inputs).toEqual([{ revision: 3, title: '첫 편집' }]);
  firstSave.resolve({ ok: true, revision: 4 });
  await expect(flushed).resolves.toEqual({ id: 'draft-a', revision: 5 });
  expect(inputs).toEqual([{ revision: 3, title: '첫 편집' }, { revision: 4, title: '최종 편집' }]);
});

it('keeps newer edits recoverable when an older in-flight save succeeds after disposal', async () => {
  const firstSave = deferred<{ ok: true; revision: number }>();
  const first = open({ save: () => firstSave.promise });
  first.store.getState().setField('title', '저장 중인 답변');
  await vi.advanceTimersByTimeAsync(400);
  first.store.getState().setField('title', '더 새로운 답변');
  first.stop();
  firstSave.resolve({ ok: true, revision: 4 });
  await vi.advanceTimersByTimeAsync(0);
  const next = open({ draft: { ...original, revision: 4, answers: { title: '저장 중인 답변' } } });
  expect(next.conflicted).toBe(false);
  expect(next.store.getState().title).toBe('더 새로운 답변');
});

it('does not erase a replacement session backup when an earlier save response arrives', async () => {
  const response = deferred<{ ok: true; revision: number }>();
  const first = open({ save: () => response.promise });
  first.store.getState().setField('title', '이전 답변');
  await vi.advanceTimersByTimeAsync(400);
  first.stop();
  const replacement = open();
  replacement.store.getState().setField('title', '새 세션 답변');
  replacement.stop();
  response.resolve({ ok: true, revision: 4 });
  await vi.advanceTimersByTimeAsync(0);
  expect(open().store.getState().title).toBe('새 세션 답변');
});

it('keeps the conflict visible when an old save succeeds after another session replaces newer edits', async () => {
  const response = deferred<{ ok: true; revision: number }>();
  const errors: string[] = [];
  const first = open({ save: () => response.promise, onError: code => errors.push(code) });
  first.store.getState().setField('title', '저장 중인 답변');
  await vi.advanceTimersByTimeAsync(400);
  first.store.getState().setField('title', '이 탭의 새 편집');
  const other = open();
  other.store.getState().setField('title', '다른 탭의 새 편집');
  other.stop();
  response.resolve({ ok: true, revision: 4 });
  await vi.advanceTimersByTimeAsync(0);
  expect(first.conflicted).toBe(true);
  expect(errors.at(-1)).toBe('GUEST_DRAFT_CHANGED');
  await expect(first.flush()).rejects.toThrow('GUEST_DRAFT_CHANGED');
});

it('retains unsaved answers across a failed save and permits a successful retry', async () => {
  let available = false;
  const session = open({ save: async input => available ? { ok: true, revision: input.revision + 1 } : { ok: false, error: 'SAVE_FAILED' } });
  session.store.getState().setField('title', '재시도할 답변');
  await expect(session.flush()).rejects.toThrow('SAVE_FAILED');
  available = true;
  await expect(session.flush()).resolves.toEqual({ id: 'draft-a', revision: 4 });
  session.stop();
  expect(open().store.getState().title).toBe('서버 답변');
});

it('removes only its own backup after successful completion and ignores reset writes', () => {
  const session = open(); session.store.getState().setField('title', '완료할 답변');
  session.complete(); session.store.getState().reset();
  expect(open().store.getState().title).toBe('서버 답변');
});

it('expires local recovery data after the existing guest-draft retention period', () => {
  const session = open(); session.store.getState().setField('title', '오래된 답변'); session.stop();
  vi.setSystemTime(Date.now() + GUEST_DRAFT_TTL_MS);
  expect(open().store.getState().title).toBe('서버 답변');
});

it('does not extend recovery retention just because the user views the draft again', () => {
  const first = open(); first.store.getState().setField('title', '만료할 답변'); first.stop();
  vi.setSystemTime(Date.now() + GUEST_DRAFT_TTL_MS / 2);
  open().stop();
  vi.setSystemTime(Date.now() + GUEST_DRAFT_TTL_MS / 2);
  expect(open().store.getState().title).toBe('서버 답변');
});

it('settles an in-flight save before refreshing the revision for a conflict choice', async () => {
  const response = deferred<{ ok: true; revision: number }>();
  let refreshed = false;
  const first = open({ save: () => response.promise, refresh: async () => { refreshed = true; return { ...original, revision: 4 }; } });
  first.store.getState().setField('title', '이전 요청');
  await vi.advanceTimersByTimeAsync(400);
  open().stop(); // A replacement session claims the old recovery copy.
  first.store.getState().setField('title', '선택할 수정본');
  const resolution = first.resolveConflict('local');
  expect(refreshed).toBe(false);
  response.resolve({ ok: true, revision: 4 });
  await resolution;
  expect(refreshed).toBe(true);
  expect(first.conflicted).toBe(false);
  expect(first.store.getState().title).toBe('선택할 수정본');
});

it('does not restart a disposed session after a conflict refresh finishes', async () => {
  const response = deferred<ServerGuestDraft>();
  const first = open(); first.store.getState().setField('title', '남겨둘 수정본'); first.stop();
  const next = open({ draft: { ...original, revision: 4 }, refresh: () => response.promise });
  const resolution = next.resolveConflict('server');
  next.stop();
  response.resolve({ ...original, revision: 4, answers: { title: '새 서버본' } });
  await expect(resolution).rejects.toThrow('GUEST_SESSION_CLOSED');
  expect(open().store.getState().title).toBe('남겨둘 수정본');
});

it('deletes the selected owner and draft recovery without touching another workspace', () => {
  const first = open(); first.store.getState().setField('title', '삭제할 답변'); first.stop();
  const other = { ...actor, workspaceId: 'other-workspace' };
  const second = open({ actor: other }); second.store.getState().setField('title', '다른 공간 답변'); second.stop();
  clearServerDraftBackup(actor, original.id);
  expect(open().store.getState().title).toBe('서버 답변');
  expect(open({ actor: other }).store.getState().title).toBe('다른 공간 답변');
});

it('refuses a recovery copy whose embedded owner does not match its storage key', () => {
  const first = open(); first.store.getState().setField('title', '다른 사람 답변'); first.stop();
  const key = Object.keys(localStorage).find(key => key.startsWith('support-b-server-guest-draft-v1:'))!;
  const record = JSON.parse(localStorage.getItem(key)!);
  record.owner.userId = 'someone-else';
  localStorage.setItem(key, JSON.stringify(record));
  expect(open().store.getState().title).toBe('서버 답변');
});

it('reports unavailable browser storage while still allowing a confirmed server save', async () => {
  const errors: string[] = [];
  const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
  try {
    const session = open({ onError: code => errors.push(code) });
    session.store.getState().setField('title', '서버에 저장할 답변');
    expect(errors).toContain('GUEST_BACKUP_UNAVAILABLE');
    await expect(session.flush()).resolves.toEqual({ id: 'draft-a', revision: 4 });
  } finally { setItem.mockRestore(); }
});
