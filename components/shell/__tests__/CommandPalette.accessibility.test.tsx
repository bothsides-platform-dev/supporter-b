import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SearchResults } from '@/lib/server/actions/search/searchEntitiesAction';

const { searchEntitiesMock, pushMock } = vi.hoisted(() => ({
  searchEntitiesMock: vi.fn(),
  pushMock: vi.fn(),
}));
vi.mock('@/lib/server/actions/search/searchEntitiesAction', () => ({
  searchEntitiesAction: (query: string) => searchEntitiesMock(query),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));
vi.mock('@/lib/features/open-board', () => ({ OPEN_BOARD_ENABLED: false }));

import { CommandPalette } from '../CommandPalette';
import { useUIStore } from '@/lib/stores/ui';

const EMPTY: SearchResults = { rfps: [], bids: [], opportunities: [] };
function resultsFor(title: string): SearchResults {
  return {
    ...EMPTY,
    rfps: [{ code: title, title, memo: '', status: 'sent', href: `/rfp/${title}` }],
  };
}
function deferredResults() {
  let resolve!: (result: SearchResults) => void;
  const promise = new Promise<SearchResults>((done) => { resolve = done; });
  return { promise, resolve };
}
function Harness() {
  return (
    <>
      <button onClick={() => useUIStore.getState().openCommandPalette()}>검색 열기</button>
      <button>배경 동작</button>
      <CommandPalette workspaceType="buyer" />
    </>
  );
}

beforeEach(() => {
  searchEntitiesMock.mockReset().mockResolvedValue(EMPTY);
  pushMock.mockReset();
  useUIStore.setState({ commandPaletteOpen: false });
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  Element.prototype.scrollIntoView = vi.fn();
  // Base UI feature-detects focus({ preventScroll }) before returning focus
  // after a pointer dismissal. jsdom does not read that option; browsers do.
  const focus = HTMLElement.prototype.focus;
  vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (this: HTMLElement, options?: FocusOptions) {
    void options?.preventScroll;
    focus.call(this, options);
  });
});
afterEach(() => {
  cleanup();
  useUIStore.setState({ commandPaletteOpen: false });
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function openPalette() {
  const user = userEvent.setup();
  render(<Harness />);
  const trigger = screen.getByRole('button', { name: '검색 열기' });
  await user.click(trigger);
  const input = screen.getByRole('combobox', { name: '검색어' });
  await waitFor(() => expect(input).toHaveFocus());
  return { user, trigger, input };
}

function enterQuery(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

describe('CommandPalette — modal keyboard behavior', () => {
  it('names the dialog, traps Tab in both directions, and restores focus after Escape', async () => {
    const { user, trigger, input } = await openPalette();
    const dialog = screen.getByRole('dialog', { name: '검색' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('listbox', { name: '검색 결과' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '배경 동작' })).not.toBeInTheDocument();

    const close = screen.getByRole('button', { name: '닫기' });
    await user.tab();
    expect(close).toHaveFocus();
    await user.tab();
    await waitFor(() => expect(input).toHaveFocus());
    await user.tab({ shift: true });
    await waitFor(() => expect(close).toHaveFocus());
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('keeps the palette open when Escape cancels IME composition', async () => {
    const { user, input, trigger } = await openPalette();
    fireEvent.compositionStart(input);
    fireEvent.keyDown(input, { key: 'Escape', isComposing: true });
    expect(screen.getByRole('dialog', { name: '검색' })).toBeInTheDocument();
    fireEvent.compositionEnd(input);
    await user.keyboard('{Escape}');
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Enter on the close control closes without selecting a command', async () => {
    const { user, trigger } = await openPalette();
    await user.tab();
    expect(screen.getByRole('button', { name: '닫기' })).toHaveFocus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(pushMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes on the scrim and restores the launcher', async () => {
    const { user, trigger } = await openPalette();
    const overlay = document.querySelector('[data-slot="dialog-overlay"]');
    expect(overlay).not.toBeNull();
    await user.click(overlay!);
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it.each(['ctrlKey', 'metaKey'] as const)('%s+K can close and immediately reopen without a deferred close/reset', async (modifier) => {
    const { trigger, input } = await openPalette();
    fireEvent.keyDown(input, { key: 'k', [modifier]: true });
    expect(useUIStore.getState().commandPaletteOpen).toBe(false);
    fireEvent.keyDown(trigger, { key: 'k', [modifier]: true });
    await waitFor(() => expect(screen.getByRole('combobox', { name: '검색어' })).toHaveFocus());
    expect(useUIStore.getState().commandPaletteOpen).toBe(true);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });
});

describe('CommandPalette — current-query search feedback', () => {
  it('hides old results during debounce, reports a failure, and retries the current query', async () => {
    searchEntitiesMock
      .mockResolvedValueOnce(resultsFor('alpha result'))
      .mockRejectedValueOnce(new Error('unavailable'))
      .mockResolvedValueOnce(resultsFor('beta result'));
    const { user, input } = await openPalette();
    enterQuery(input, 'alpha');
    expect(await screen.findByRole('option', { name: 'alpha result' })).toBeInTheDocument();

    enterQuery(input, 'beta');
    expect(screen.queryByRole('option', { name: 'alpha result' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('불러오는 중이에요…');
    expect(screen.getByRole('listbox')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('결과 없음')).not.toBeInTheDocument();

    const retry = await screen.findByRole('button', { name: '다시 시도' });
    expect(screen.getByRole('status')).toHaveTextContent('검색 결과를 불러오지 못했어요.');
    expect(screen.getByRole('listbox')).toHaveAttribute('aria-busy', 'false');
    expect(screen.queryByText('결과 없음')).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'alpha result' })).not.toBeInTheDocument();

    await user.click(retry);
    expect(input).toHaveFocus();
    expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument();
    expect(await screen.findByRole('option', { name: 'beta result' })).toBeInTheDocument();
    expect(searchEntitiesMock.mock.calls.map(([query]) => query)).toEqual(['alpha', 'beta', 'beta']);
  });

  it('Enter on retry runs the search instead of a matching navigation command', async () => {
    searchEntitiesMock.mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce(EMPTY);
    const { user, input } = await openPalette();
    enterQuery(input, '설정');
    const retry = await screen.findByRole('button', { name: '다시 시도' });
    expect(screen.getByRole('option', { name: '설정' })).toBeInTheDocument();
    await user.tab();
    await user.tab();
    expect(retry).toHaveFocus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(searchEntitiesMock).toHaveBeenCalledTimes(2));
    expect(pushMock).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: '검색' })).toBeInTheDocument();
    expect(input).toHaveFocus();
  });

  it('shows the empty state only after a successful search finishes', async () => {
    const pending = deferredResults();
    searchEntitiesMock.mockReturnValueOnce(pending.promise);
    const { input } = await openPalette();
    enterQuery(input, 'no-matches');
    await waitFor(() => expect(searchEntitiesMock).toHaveBeenCalledWith('no-matches'));
    expect(screen.queryByText('결과 없음')).not.toBeInTheDocument();
    await act(async () => pending.resolve(EMPTY));
    expect(await screen.findByText('결과 없음')).toBeInTheDocument();
    expect(screen.getByRole('listbox')).toHaveAttribute('aria-busy', 'false');
  });

  it('ignores an older response that completes after the current search', async () => {
    const old = deferredResults();
    searchEntitiesMock.mockReturnValueOnce(old.promise).mockResolvedValueOnce(resultsFor('beta result'));
    const { input } = await openPalette();
    enterQuery(input, 'alpha');
    await waitFor(() => expect(searchEntitiesMock).toHaveBeenCalledWith('alpha'));
    enterQuery(input, 'beta');
    expect(await screen.findByRole('option', { name: 'beta result' })).toBeInTheDocument();
    await act(async () => old.resolve(resultsFor('alpha result')));
    expect(screen.queryByRole('option', { name: 'alpha result' })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'beta result' })).toBeInTheDocument();
  });

  it('ignores an in-flight response after closing and reopening', async () => {
    const old = deferredResults();
    searchEntitiesMock.mockReturnValueOnce(old.promise);
    const { user, input, trigger } = await openPalette();
    enterQuery(input, 'alpha');
    await waitFor(() => expect(searchEntitiesMock).toHaveBeenCalledWith('alpha'));
    await user.keyboard('{Escape}');
    await waitFor(() => expect(trigger).toHaveFocus());
    await user.click(trigger);
    await act(async () => old.resolve(resultsFor('alpha result')));
    expect(screen.getByRole('combobox', { name: '검색어' })).toHaveValue('');
    expect(screen.queryByRole('option', { name: 'alpha result' })).not.toBeInTheDocument();
    expect(searchEntitiesMock).toHaveBeenCalledTimes(1);
  });

  it('ignores a pending response when the logout confirmation takes over', async () => {
    const old = deferredResults();
    searchEntitiesMock.mockReturnValueOnce(old.promise);
    const { user, input } = await openPalette();
    enterQuery(input, '로그아웃');
    await waitFor(() => expect(searchEntitiesMock).toHaveBeenCalledWith('로그아웃'));
    await user.click(screen.getByRole('option', { name: '로그아웃' }));
    await act(async () => old.resolve(resultsFor('obsolete result')));
    expect(screen.getByText('로그아웃할까요?')).toBeInTheDocument();
    expect(screen.queryByText('obsolete result')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(searchEntitiesMock).toHaveBeenCalledTimes(1);
  });
});
