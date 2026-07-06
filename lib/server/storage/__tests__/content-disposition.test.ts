// contentDispositionHeader() — RFC 5987 / 6266 Content-Disposition value
// builder. Extracted from app/api/files/[id]/route.ts so the presigned-GET
// path (R2Storage.presignGet) can share the exact same filename-encoding
// behaviour instead of duplicating it (curly-quote / CJK filenames must
// come out byte-identical on both paths).
import { describe, expect, it } from 'vitest';

import { contentDispositionHeader } from '../content-disposition';

describe('contentDispositionHeader', () => {
  it('defaults to inline with a plain ASCII filename', () => {
    const header = contentDispositionHeader('rfp.pdf');
    expect(header).toBe(`inline; filename="rfp.pdf"; filename*=UTF-8''rfp.pdf`);
  });

  it('supports attachment disposition', () => {
    const header = contentDispositionHeader('rfp.pdf', 'attachment');
    expect(header).toBe(
      `attachment; filename="rfp.pdf"; filename*=UTF-8''rfp.pdf`,
    );
  });

  it('encodes a Korean filename: ASCII fallback is underscored, filename* carries percent-encoded UTF-8', () => {
    const header = contentDispositionHeader('견적서.pdf');
    expect(header).toBe(
      `inline; filename="___.pdf"; filename*=UTF-8''${encodeURIComponent('견적서.pdf')}`,
    );
  });

  it('strips control chars and quotes/backslashes from the filename', () => {
    const header = contentDispositionHeader('evil"\\name\x00.pdf');
    const match = /filename="([^"]*)"/.exec(header);
    // Neither a literal quote nor a backslash reaches the ascii= value.
    expect(match?.[1]).not.toMatch(/[\\"]/);
    expect(match?.[1]).toBe('evilname.pdf');
  });

  it('truncates very long filenames to 200 chars', () => {
    const long = `${'a'.repeat(250)}.pdf`;
    const header = contentDispositionHeader(long);
    const match = /filename="([^"]*)"/.exec(header);
    expect(match?.[1].length).toBeLessThanOrEqual(200);
  });

  it('falls back to "file" for an empty/blank name', () => {
    const header = contentDispositionHeader('');
    expect(header).toBe(`inline; filename="file"; filename*=UTF-8''file`);
  });
});
