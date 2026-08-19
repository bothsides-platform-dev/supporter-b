// 서버에서 공급자 presigned 폼으로 PDF 바이트를 올린다.
//
// 오늘까지 바이트를 올리는 쪽은 **브라우저뿐**이었다(템플릿 에디터). 조항형 발송은
// 서버가 렌더한 PDF 를 서버가 올려야 하므로 이 경로가 새로 생긴다. 규칙은 실측으로
// 확정된 것이고(SNOWSIGN_SANDBOX T2), 어기면 S3 가 403/400 으로 조용히 거절한다:
//
//   ① 서명에 포함된 fields 를 하나도 빠뜨리지 않는다
//   ② `file` 은 **반드시 마지막** (S3 는 file 뒤의 필드를 무시한다)
//   ③ Content-Type 요청 헤더를 직접 넣지 않는다 (fields 안에 이미 있고, 직접 넣으면
//      multipart boundary 가 깨진다)

import { describe, it, expect, vi, afterEach } from 'vitest';
import { uploadPdfBytes } from '../upload-bytes';

const SESSION = {
  uploadUrl: 'https://s3.example.com/bucket',
  fields: { key: 'uploads/abc', 'Content-Type': 'application/pdf', policy: 'p', signature: 's' },
};

const BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF

function captureFetch(status = 204) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fake = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(null, { status });
  });
  vi.stubGlobal('fetch', fake);
  return { calls, fake };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('uploadPdfBytes', () => {
  it('presigned URL 로 POST 한다', async () => {
    const { calls } = captureFetch();
    await uploadPdfBytes(SESSION, BYTES, '계약서.pdf');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(SESSION.uploadUrl);
    expect(calls[0].init.method).toBe('POST');
  });

  it('서명 fields 를 하나도 빠뜨리지 않는다', async () => {
    const { calls } = captureFetch();
    await uploadPdfBytes(SESSION, BYTES, '계약서.pdf');
    const form = calls[0].init.body as FormData;
    for (const [k, v] of Object.entries(SESSION.fields)) {
      expect(form.get(k), `누락된 서명 필드: ${k}`).toBe(v);
    }
  });

  // S3 는 `file` 뒤에 오는 필드를 **무시한다** — 순서가 곧 정합성이다.
  it('file 을 맨 마지막에 붙인다', async () => {
    const { calls } = captureFetch();
    await uploadPdfBytes(SESSION, BYTES, '계약서.pdf');
    const form = calls[0].init.body as FormData;
    const keys = [...form.keys()];
    expect(keys[keys.length - 1]).toBe('file');
  });

  // 헤더를 직접 넣으면 fetch 가 boundary 를 붙이지 못해 multipart 가 깨진다.
  it('Content-Type 요청 헤더를 직접 넣지 않는다', async () => {
    const { calls } = captureFetch();
    await uploadPdfBytes(SESSION, BYTES, '계약서.pdf');
    const headers = calls[0].init.headers;
    // 헤더 자체를 안 넘기는 것이 정답 — 예전에는 여기서 early-return 했는데, 그러면
    // 통과 경로가 단언을 **하나도** 실행하지 않으면서 초록으로 보고됐다.
    if (headers === undefined) {
      expect(headers).toBeUndefined();
      return;
    }
    const asRecord = new Headers(headers as HeadersInit);
    expect(asRecord.get('content-type')).toBeNull();
  });

  // 60초 데드라인은 사용자 대기 화면 뒤에서 도는 업로드가 **영영 안 끝나는** 것을
  // 막는 유일한 장치다. 이 단언이 없으면 signal 을 지워도 전부 green 이다.
  it('중단 신호(데드라인)를 건다', async () => {
    const { calls } = captureFetch();
    await uploadPdfBytes(SESSION, BYTES, '계약서.pdf');
    expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);
  });

  it('비 2xx 응답은 실패로 올린다 — 조용히 성공으로 넘기지 않는다', async () => {
    captureFetch(403);
    await expect(uploadPdfBytes(SESSION, BYTES, '계약서.pdf')).rejects.toThrow(/403/);
  });

  it('네트워크 오류를 그대로 전파한다', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('network down');
      }),
    );
    await expect(uploadPdfBytes(SESSION, BYTES, '계약서.pdf')).rejects.toThrow();
  });

  // 사람이 나중에 공급자 콘솔에서 파일을 알아볼 수 있어야 한다.
  it('파일명을 함께 보낸다', async () => {
    const { calls } = captureFetch();
    await uploadPdfBytes(SESSION, BYTES, '견적-계약서.pdf');
    const form = calls[0].init.body as FormData;
    const file = form.get('file');
    expect(file).toBeInstanceOf(File);
    expect((file as File).name).toBe('견적-계약서.pdf');
  });
});
