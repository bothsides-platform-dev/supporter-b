// 서버 → 공급자 presigned 폼으로 PDF 바이트 업로드.
//
// **오늘까지 바이트를 올리는 쪽은 브라우저뿐이었다** (템플릿 에디터의
// `postPresignedUpload`). 조항형 발송은 서버가 렌더한 PDF 를 서버가 올려야 하므로
// 이 경로가 새로 필요하다. Node 에는 CORS 가 없어 브라우저 왕복이 필요 없고,
// 진행률 표시도 필요 없으므로 XHR 대신 `fetch` 로 충분하다.
//
// 규칙 셋은 취향이 아니라 실측 결과다(`docs/SNOWSIGN_SANDBOX.md` T2 — raw PUT 은
// 403, presigned POST form 이 승자):
//
//   ① 서명에 포함된 `fields` 를 하나도 빠뜨리지 않는다.
//   ② `file` 은 **반드시 마지막**. S3 는 `file` 뒤에 오는 필드를 무시한다.
//   ③ `Content-Type` 요청 헤더를 직접 넣지 않는다. `fields` 안에 이미 있고,
//      직접 넣으면 fetch 가 multipart boundary 를 붙이지 못해 폼이 깨진다.

/** `createUploadSession` 이 돌려주는 것 중 업로드에 필요한 부분만. */
export type PresignedUploadTarget = {
  uploadUrl: string;
  fields: Record<string, string>;
};

/** 업로드가 매달리지 않도록 하는 상한 — 사람이 화면에서 기다리는 경로다. */
const UPLOAD_TIMEOUT_MS = 60_000;

/**
 * presigned 폼으로 PDF 를 올린다. 성공하면 조용히 반환하고, 실패는 던진다.
 *
 * 비 2xx 를 던지는 것이 중요하다 — 조용히 통과시키면 호출자가 없는 문서로 계약을
 * 만들고, 그 실패는 한참 뒤 공급자 400 으로 나타나 원인을 찾기 어려워진다.
 */
export async function uploadPdfBytes(
  target: PresignedUploadTarget,
  bytes: Uint8Array,
  filename: string,
): Promise<void> {
  const form = new FormData();
  // ① 서명 필드 전부 — ② 보다 먼저.
  for (const [key, value] of Object.entries(target.fields)) form.append(key, value);
  // ② file 은 마지막.
  form.append(
    'file',
    new File([new Uint8Array(bytes)], filename, { type: 'application/pdf' }),
  );

  // ③ headers 를 아예 넘기지 않는다.
  const res = await fetch(target.uploadUrl, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`presigned upload failed: HTTP ${res.status}`);
  }
}
