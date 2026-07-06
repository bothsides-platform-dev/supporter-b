// uploadAttachment — 클라이언트 3-step presigned 업로드 헬퍼.
// ① POST /api/files/presign (JSON) → {id, uploadUrl}
// ② PUT uploadUrl (raw fetch, Content-Type=mime, body=file)
// ③ POST /api/files/{id}/complete → {id,name,size,mimeType}

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HTTPError } from 'ky';
import type { NormalizedOptions, ResponsePromise } from 'ky';

const post = vi.fn();
vi.mock('@/lib/http', () => ({ http: { post: (...a: unknown[]) => post(...a) } }));

import { uploadAttachment } from '../upload-client';

function jsonRes(body: unknown) {
  return { json: () => Promise.resolve(body) } as unknown as ResponsePromise;
}

const pdf = (name = 'a.pdf', size = 4) =>
  new File([new Uint8Array(size)], name, { type: 'application/pdf' });

beforeEach(() => {
  post.mockReset();
  vi.unstubAllGlobals();
});

describe('uploadAttachment', () => {
  it('presign → PUT → complete in order, with correct payloads', async () => {
    const file = pdf('a.pdf', 4);
    post.mockImplementationOnce(() => jsonRes({ id: 'att-1', uploadUrl: 'https://r2.example/att-1?sig=x' }));
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
    post.mockImplementationOnce(() =>
      jsonRes({ id: 'att-1', name: 'a.pdf', size: 4, mimeType: 'application/pdf' }),
    );

    const result = await uploadAttachment(file, { ownerKind: 'rfp', ownerId: 'draft-1' });

    expect(result).toEqual({ id: 'att-1', name: 'a.pdf', size: 4, mimeType: 'application/pdf' });

    // ① presign payload
    expect(post).toHaveBeenNthCalledWith(1, '/api/files/presign', {
      json: { ownerKind: 'rfp', ownerId: 'draft-1', name: 'a.pdf', size: 4, mime: 'application/pdf' },
    });

    // ② PUT to the presigned url, raw fetch (not ky), correct headers/body
    expect(fetchMock).toHaveBeenCalledWith('https://r2.example/att-1?sig=x', {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': 'application/pdf' },
    });

    // ③ complete call
    expect(post).toHaveBeenNthCalledWith(2, '/api/files/att-1/complete');
  });

  it('throws when the PUT transfer fails, and never calls complete', async () => {
    const file = pdf();
    post.mockImplementationOnce(() => jsonRes({ id: 'att-2', uploadUrl: 'https://r2.example/att-2' }));
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadAttachment(file, { ownerKind: 'rfp', ownerId: 'draft-1' })).rejects.toThrow(
      'UPLOAD_TRANSFER_FAILED',
    );

    expect(post).toHaveBeenCalledTimes(1); // presign only — complete never called
  });

  it('propagates an HTTPError thrown by the presign call', async () => {
    const err413 = new HTTPError(
      new Response('', { status: 413 }),
      new Request('http://localhost/api/files/presign'),
      {} as unknown as NormalizedOptions,
    );
    post.mockImplementationOnce(() => ({ json: () => Promise.reject(err413) }));
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(uploadAttachment(pdf(), { ownerKind: 'rfp', ownerId: 'draft-1' })).rejects.toBe(err413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('propagates an HTTPError thrown by the complete call', async () => {
    post.mockImplementationOnce(() => jsonRes({ id: 'att-3', uploadUrl: 'https://r2.example/att-3' }));
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
    const err415 = new HTTPError(
      new Response('', { status: 415 }),
      new Request('http://localhost/api/files/att-3/complete'),
      {} as unknown as NormalizedOptions,
    );
    post.mockImplementationOnce(() => ({ json: () => Promise.reject(err415) }));

    await expect(uploadAttachment(pdf(), { ownerKind: 'rfp', ownerId: 'draft-1' })).rejects.toBe(err415);
  });
});
