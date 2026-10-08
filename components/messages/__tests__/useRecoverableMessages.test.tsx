import { act, cleanup, renderHook } from '@testing-library/react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRecoverableMessages } from '../useRecoverableMessages';
import type { Attachment } from '@/lib/types/common';

type Message = {
  id: string;
  body: string;
  createdAt: string;
  attachments: Attachment[];
  rfpId?: string | null;
  unconfirmed?: boolean;
  pending?: boolean;
  failed?: boolean;
  localKey?: string;
};

const key = 'chat-failed:viewer:workspace:conversation';
const empty: Message[] = [];
const a: Message = {
  id: 'pending-a', body: '첫 메시지', createdAt: '2026-10-08T01:00:00.000Z',
  attachments: [], rfpId: 'rfp-original', failed: true,
};
const b: Message = {
  id: 'pending-b', body: '다른 메시지', createdAt: '2026-10-08T01:01:00.000Z',
  attachments: [], failed: true,
};
const restore = (message: Message): Message => ({ ...message, failed: true, localKey: message.id });
const saved = (): Message[] => JSON.parse(localStorage.getItem(key) ?? '[]');
const savedIds = () => saved().map((message) => message.id).sort();

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useRecoverableMessages', () => {
  it('preserves failures saved by another mounted view when this view saves its own failure', () => {
    const first = renderHook(() => useRecoverableMessages(key, empty, restore));
    const second = renderHook(() => useRecoverableMessages(key, empty, restore));
    act(() => first.result.current[1]([a]));
    act(() => second.result.current[1]([b]));
    expect(savedIds()).toEqual(['pending-a', 'pending-b']);
  });

  it('does not erase another view\'s failure when a failure-free view receives a server refresh', () => {
    const first = renderHook(() => useRecoverableMessages(key, empty, restore));
    const second = renderHook(({ messages }) => useRecoverableMessages(key, messages, restore), {
      initialProps: { messages: empty },
    });
    act(() => first.result.current[1]([a]));
    second.rerender({ messages: [{ ...b, id: 'server-b', failed: false }] });
    expect(savedIds()).toEqual(['pending-a']);
  });

  it('clears a confirmed failure in other mounted views so later changes cannot resurrect it', () => {
    localStorage.setItem(key, JSON.stringify([a]));
    const first = renderHook(() => useRecoverableMessages(key, empty, restore));
    const stale = renderHook(() => useRecoverableMessages(key, empty, restore));
    act(() => {
      first.result.current[2]('pending-a');
      first.result.current[1]([{ ...a, id: 'server-a', failed: false, localKey: 'pending-a' }]);
    });
    act(() => stale.result.current[1]((current) => [...current, b]));
    expect(stale.result.current[0].map((message) => message.id)).toEqual(['pending-b']);
    expect(savedIds()).toEqual(['pending-b']);
  });

  it('lets the confirming view promote its pending retry to the real server message', () => {
    localStorage.setItem(key, JSON.stringify([a]));
    const view = renderHook(() => useRecoverableMessages(key, empty, restore));
    act(() => view.result.current[1]((current) => current.map((message) => ({ ...message, pending: true, failed: false }))));
    act(() => {
      view.result.current[2]('pending-a');
      view.result.current[1]((current) => current.map((message) => message.id === 'pending-a'
        ? { ...message, id: 'server-a', pending: false, failed: false } : message));
    });
    expect(view.result.current[0]).toMatchObject([{ id: 'server-a', pending: false, failed: false }]);
    expect(savedIds()).toEqual([]);
  });

  it('applies other-tab additions and confirmations from storage events', () => {
    localStorage.setItem(key, JSON.stringify([a]));
    const view = renderHook(() => useRecoverableMessages(key, empty, restore));
    const oldValue = localStorage.getItem(key);
    const newValue = JSON.stringify([b]);
    act(() => {
      localStorage.setItem(key, newValue);
      window.dispatchEvent(new StorageEvent('storage', { key, oldValue, newValue, storageArea: localStorage }));
    });
    expect(view.result.current[0].map((message) => message.id)).toEqual(['pending-b']);
    expect(savedIds()).toEqual(['pending-b']);
  });

  it('retains a pending retry and its snapshot when refreshed server messages arrive', () => {
    localStorage.setItem(key, JSON.stringify([{ ...a, unconfirmed: true }]));
    const view = renderHook(({ messages }) => useRecoverableMessages(key, messages, restore), {
      initialProps: { messages: empty },
    });
    act(() => view.result.current[1]((current) => current.map((message) => ({ ...message, failed: false, pending: true }))));
    view.rerender({ messages: [{ ...b, id: 'server-b', failed: false }] });
    expect(view.result.current[0].map((message) => message.id)).toEqual(['pending-a', 'server-b']);
    expect(view.result.current[0][0]).toMatchObject({ pending: true, failed: false, unconfirmed: true });
    expect(saved()[0]).toMatchObject({ id: 'pending-a', rfpId: 'rfp-original', unconfirmed: true });
  });

  it('keeps both views recoverable after getItem succeeds but setItem fails during a retry', () => {
    const first = renderHook(() => useRecoverableMessages(key, empty, restore));
    const second = renderHook(() => useRecoverableMessages(key, empty, restore));
    act(() => first.result.current[1]([a]));
    const failingWrite = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    act(() => second.result.current[1]([b]));
    expect(savedIds()).toEqual(['pending-a']);
    expect(second.result.current[0].find((message) => message.id === 'pending-b')).toMatchObject({ failed: true });
    failingWrite.mockRestore();
    act(() => second.result.current[1]((current) => current.map((message) => message.id === 'pending-b'
      ? { ...message, failed: false, pending: true } : message)));
    expect(savedIds()).toEqual(['pending-a', 'pending-b']);
  });

  it('clears confirmed failures from mounted views even when removeItem fails after a successful read', () => {
    localStorage.setItem(key, JSON.stringify([a]));
    const first = renderHook(() => useRecoverableMessages(key, empty, restore));
    const stale = renderHook(() => useRecoverableMessages(key, empty, restore));
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('storage disabled'); });
    act(() => first.result.current[2]('pending-a'));
    expect(first.result.current[0]).toEqual([]);
    expect(stale.result.current[0]).toEqual([]);
  });

  it('hydrates the server list before restoring browser failures without losing recovery records', async () => {
    function List() {
      const [messages] = useRecoverableMessages(key, empty, restore);
      return <ul>{messages.map((message) => <li key={message.id}>{message.body}</li>)}</ul>;
    }
    vi.stubGlobal('window', undefined);
    const html = renderToString(<List />);
    vi.unstubAllGlobals();
    localStorage.setItem(key, JSON.stringify([a]));
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);
    const hydrationErrors: unknown[] = [];
    let root: Root | undefined;
    try {
      await act(async () => {
        root = hydrateRoot(container, <List />, { onRecoverableError: (error) => hydrationErrors.push(error) });
      });
      expect(hydrationErrors).toEqual([]);
      expect(container.textContent).toBe('첫 메시지');
      expect(savedIds()).toEqual(['pending-a']);
    } finally {
      act(() => root?.unmount());
      container.remove();
    }
  });
});
