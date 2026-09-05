import { afterEach, describe, expect, it, vi } from 'vitest';

import { runPresignedUpload } from '@/lib/presigned-upload/client';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('presigned upload client', () => {
  it('runs presign, raw PUT, and complete in order', async () => {
    const events: string[] = [];
    const file = new File([new Uint8Array(4)], 'contract.pdf', {
      type: 'application/pdf',
    });
    const presign = vi.fn(async () => {
      events.push('presign');
      return { id: 'upload-1', uploadUrl: 'https://uploads.example/put' };
    });
    const put = vi.fn(async () => {
      events.push('put');
      return new Response(null, { status: 200 });
    });
    vi.stubGlobal('fetch', put);
    const complete = vi.fn(async () => {
      events.push('complete');
      return { id: 'upload-1', ready: true };
    });

    await expect(
      runPresignedUpload({ file, contentType: 'application/pdf', presign, complete }),
    ).resolves.toEqual({ id: 'upload-1', ready: true });
    expect(put).toHaveBeenCalledWith('https://uploads.example/put', {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': 'application/pdf' },
    });
    expect(complete).toHaveBeenCalledWith('upload-1');
    expect(events).toEqual(['presign', 'put', 'complete']);
  });

  it('does not complete an upload whose direct PUT failed', async () => {
    const file = new File([new Uint8Array(4)], 'contract.pdf', {
      type: 'application/pdf',
    });
    const complete = vi.fn();
    vi.stubGlobal('fetch', async () => new Response(null, { status: 503 }));

    await expect(
      runPresignedUpload({
        file,
        contentType: 'application/pdf',
        presign: async () => ({ id: 'upload-2', uploadUrl: 'https://uploads.example/put' }),
        complete,
      }),
    ).rejects.toThrow('UPLOAD_TRANSFER_FAILED');
    expect(complete).not.toHaveBeenCalled();
  });
});
