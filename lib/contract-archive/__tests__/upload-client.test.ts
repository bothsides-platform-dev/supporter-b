import { beforeEach, describe, expect, it, vi } from 'vitest';

import { uploadContractArchive } from '../upload-client';

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('uploadContractArchive', () => {
  it('preserves archive metadata and completes only after the direct PDF PUT', async () => {
    const events: string[] = [];
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async (_url: string, init: RequestInit) => {
        events.push('presign');
        expect(JSON.parse(String(init.body))).toEqual({
          name: 'signed.pdf',
          size: 8,
          title: '결제대행 계약',
          counterpartyName: '파트너사',
          contractedAt: '2026-09-05',
        });
        return new Response(
          JSON.stringify({ id: 'archive-1', uploadUrl: 'https://uploads.example/archive-1' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      })
      .mockImplementationOnce(async (_url: string, init: RequestInit) => {
        events.push('put');
        expect(init.headers).toEqual({ 'Content-Type': 'application/pdf' });
        return new Response(null, { status: 200 });
      })
      .mockImplementationOnce(async () => {
        events.push('complete');
        return new Response(JSON.stringify({ id: 'archive-1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });
    vi.stubGlobal('fetch', fetchMock);
    const file = new File(['%PDF-1.7'], 'signed.pdf', { type: 'application/pdf' });

    await expect(
      uploadContractArchive(file, {
        title: '결제대행 계약',
        counterpartyName: '파트너사',
        contractedAt: '2026-09-05',
      }),
    ).resolves.toEqual({ id: 'archive-1' });
    expect(events).toEqual(['presign', 'put', 'complete']);
  });

  it.each([
    {
      stage: 'presign',
      responses: [
        new Response(JSON.stringify({ error: 'UPLOAD_LIMIT' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        }),
      ],
      error: 'UPLOAD_LIMIT',
    },
    {
      stage: 'presign fallback',
      responses: [new Response('unavailable', { status: 503 })],
      error: 'PRESIGN_FAILED_503',
    },
    {
      stage: 'complete',
      responses: [
        new Response(
          JSON.stringify({ id: 'archive-1', uploadUrl: 'https://uploads.example/archive-1' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
        new Response(null, { status: 200 }),
        new Response(JSON.stringify({ error: 'MIME_MISMATCH' }), {
          status: 415,
          headers: { 'Content-Type': 'application/json' },
        }),
      ],
      error: 'MIME_MISMATCH',
    },
    {
      stage: 'complete fallback',
      responses: [
        new Response(
          JSON.stringify({ id: 'archive-1', uploadUrl: 'https://uploads.example/archive-1' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
        new Response(null, { status: 200 }),
        new Response('unavailable', { status: 502 }),
      ],
      error: 'COMPLETE_FAILED_502',
    },
  ])('preserves the archive adapter error semantics for $stage failures', async ({
    responses,
    error,
  }) => {
    const fetchMock = vi.fn();
    for (const response of responses) {
      fetchMock.mockImplementationOnce(async () => response);
    }
    vi.stubGlobal('fetch', fetchMock);
    const file = new File(['%PDF-1.7'], 'signed.pdf', { type: 'application/pdf' });

    await expect(uploadContractArchive(file, { title: '계약서' })).rejects.toThrow(error);
  });
});
