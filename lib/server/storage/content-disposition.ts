/**
 * contentDispositionHeader — RFC 5987 / 6266 Content-Disposition value
 * builder shared by the app-proxy download route
 * (`app/api/files/[id]/route.ts`) and the presigned-GET path
 * (`R2Storage.presignGet`, `response-content-disposition` query param).
 *
 * We always pair an ASCII fallback (`filename="..."`) with a
 * percent-encoded UTF-8 `filename*` so modern browsers display the
 * original name (including Korean/CJK). Without the `filename*` arm,
 * fetch's `Response` constructor throws `Cannot convert argument to a
 * ByteString` for any non-ASCII name — and R2's presigned URL would
 * likewise mangle it if we only sent the ASCII fallback.
 */
export type ContentDispositionType = 'inline' | 'attachment';

export function contentDispositionHeader(
  name: string,
  type: ContentDispositionType = 'inline',
): string {
  const safe = name.replace(/[\x00-\x1f"\\]/g, '').slice(0, 200) || 'file';
  const ascii = safe.replace(/[^\x20-\x7E]/g, '_');
  const utf8 = encodeURIComponent(safe);
  return `${type}; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}
