// useComposerAttachments — 컴포저 첨부 업로드 상태머신(ThreadView·TeamThreadView·
// MessageComposeSheet 공용). ownerKind/ownerId(=ACL)·dedupeByName·error 매퍼만 호출처가
// 주입하고 나머지(검증·스테이징·업로드·스왑)는 공유한다.

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { HTTPError } from 'ky';

const uploadAttachment = vi.fn();
vi.mock('@/lib/attachments/upload-client', () => ({
  uploadAttachment: (...a: unknown[]) => uploadAttachment(...a),
}));

vi.mock('@/lib/server/storage/constants', () => ({
  MAX_FILES: 2,
  MAX_BYTES: 1000,
  ACCEPTED_MIMES: new Set(['application/pdf', 'image/png']),
  ACCEPTED_EXTENSIONS: new Set(['.pdf', '.png']),
}));

import { useComposerAttachments, toReadyMessageAttachments } from '../useComposerAttachments';

const fileList = (...files: File[]) => files as unknown as FileList;
const pdf = (name = 'a.pdf', size = 100) =>
  new File([new Uint8Array(Math.min(size, 8))], name, { type: 'application/pdf' });

// NOTE: mock reset is done as the FIRST statement inside each `it` body
// (not in a shared `beforeEach`). Resetting a mock from `beforeEach` right
// before a test that routes a never-settling/rejecting promise through
// renderHook + act() makes Vitest misreport an unhandled-rejection/hang here
// (verified in isolation — the exact same reset call inline in the test body
// is fine; only the beforeEach-hook timing triggers it).

describe('useComposerAttachments', () => {
  it('addFiles stages an uploading row, calls uploadAttachment with ownerKind/ownerId, then swaps to ready', async () => {
    uploadAttachment.mockReset();
    uploadAttachment.mockResolvedValue({ id: 'att-1', name: 'a.pdf', size: 100, mimeType: 'application/pdf' });
    const { result } = renderHook(() =>
      useComposerAttachments({ ownerKind: 'chat', ownerId: 'rfp-9' }),
    );

    act(() => result.current.addFiles(fileList(pdf('a.pdf'))));
    expect(result.current.rows[0].status).toBe('uploading');

    await waitFor(() => expect(result.current.rows[0].status).toBe('ready'));
    expect(result.current.rows[0]).toMatchObject({ id: 'att-1', url: '/api/files/att-1', mimeType: 'application/pdf' });
    expect(result.current.readyRows).toHaveLength(1);

    // uploadAttachment carried the ACL params
    expect(uploadAttachment).toHaveBeenCalledWith(expect.any(File), { ownerKind: 'chat', ownerId: 'rfp-9' });
  });

  it('rejects an unsupported extension as an error row without uploading', () => {
    uploadAttachment.mockReset();
    const { result } = renderHook(() => useComposerAttachments({ ownerKind: 'chat', ownerId: 'x' }));
    const bad = new File([new Uint8Array([1])], 'a.exe', { type: '' });
    act(() => result.current.addFiles(fileList(bad)));
    expect(result.current.rows[0]).toMatchObject({ status: 'error' });
    expect(uploadAttachment).not.toHaveBeenCalled();
  });

  it('caps at MAX_FILES', () => {
    uploadAttachment.mockReset();
    uploadAttachment.mockResolvedValue({ id: 'x', name: 'x', size: 1, mimeType: 'application/pdf' });
    const { result } = renderHook(() => useComposerAttachments({ ownerKind: 'chat', ownerId: 'x' }));
    act(() => result.current.addFiles(fileList(pdf('1.pdf'), pdf('2.pdf'), pdf('3.pdf'))));
    expect(result.current.rows).toHaveLength(2);
  });

  it('dedupeByName skips a same-name file only when enabled', () => {
    uploadAttachment.mockReset();
    uploadAttachment.mockResolvedValue({ id: 'x', name: 'x', size: 1, mimeType: 'application/pdf' });
    const { result } = renderHook(() =>
      useComposerAttachments({ ownerKind: 'chat', ownerId: 'x', dedupeByName: true }),
    );
    act(() => result.current.addFiles(fileList(pdf('dup.pdf'))));
    act(() => result.current.addFiles(fileList(pdf('dup.pdf'))));
    expect(result.current.rows).toHaveLength(1);
  });

  it('removeRow and clear mutate the row set; anyUploading reflects state', () => {
    // never resolves → stays uploading. NOTE: use mockImplementation (not the
    // mockReturnValue/mockRejectedValue convenience methods) — with renderHook
    // + a fire-and-forget async call, those convenience methods produce a
    // Promise that trips Vitest's unhandled-rejection/hang detection here even
    // though the hook's own try/catch does consume it (verified in isolation:
    // swapping to a plain `vi.fn(() => new Promise(...))` implementation makes
    // it pass instantly).
    uploadAttachment.mockReset();
    uploadAttachment.mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useComposerAttachments({ ownerKind: 'chat', ownerId: 'x' }));
    act(() => result.current.addFiles(fileList(pdf('keep.pdf'))));
    expect(result.current.anyUploading).toBe(true);
    const id = result.current.rows[0].id;
    act(() => result.current.removeRow(id));
    expect(result.current.rows).toHaveLength(0);
    act(() => result.current.addFiles(fileList(pdf('z.pdf'))));
    act(() => result.current.clear());
    expect(result.current.rows).toHaveLength(0);
  });

  it('uses a caller-supplied mapUploadError on HTTP failure', async () => {
    const httpErr = Object.create(HTTPError.prototype);
    httpErr.response = { status: 413 };
    // See note above — mockImplementation avoids the renderHook interaction
    // that otherwise makes Vitest report this as an unhandled rejection.
    uploadAttachment.mockReset();
    uploadAttachment.mockImplementation(() => Promise.reject(httpErr));
    const { result } = renderHook(() =>
      useComposerAttachments({
        ownerKind: 'chat',
        ownerId: 'x',
        mapUploadError: (err) =>
          err instanceof HTTPError && err.response.status === 413 ? '파일이 너무 큽니다 (최대 20MB)' : 'fallback',
      }),
    );
    act(() => result.current.addFiles(fileList(pdf('big.pdf'))));
    await waitFor(() => expect(result.current.rows[0].status).toBe('error'));
    expect(result.current.rows[0].error).toBe('파일이 너무 큽니다 (최대 20MB)');
  });
});

describe('toReadyMessageAttachments', () => {
  it('keeps only ready rows with full meta (size+mimeType+url)', () => {
    const snap = toReadyMessageAttachments([
      { id: 'a', name: 'a.pdf', size: 10, mimeType: 'application/pdf', url: '/api/files/a', status: 'ready' },
      { id: 'b', name: 'b.pdf', status: 'uploading' },
    ]);
    expect(snap).toEqual([{ id: 'a', name: 'a.pdf', size: 10, mimeType: 'application/pdf', url: '/api/files/a' }]);
  });
});
