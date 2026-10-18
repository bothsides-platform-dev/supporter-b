/** Public ingress: bound both allocated bytes and time spent waiting on chunks. */
export async function readBoundedBody(request: Request): Promise<string | 408 | 413> {
  if (Number(request.headers.get('content-length')) > 65536) return 413;
  const reader = request.body?.getReader();
  if (!reader) return '';
  let expired = false;
  const timer = setTimeout(() => {
    expired = true;
    void reader.cancel().catch(() => {});
  }, 3000);
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (expired) return 408;
      if (done) return Buffer.concat(chunks).toString('utf8');
      bytes += value.byteLength;
      if (bytes > 65536) {
        void reader.cancel().catch(() => {});
        return 413;
      }
      chunks.push(value);
    }
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}
