import type { Storage } from '@/lib/server/storage/types';
import { sha256Hex } from './hash';

/** 스트림을 남김없이 소진해 하나의 버퍼로 모은다(첫 청크만 읽으면 조용히 틀린 해시가 나온다). */
async function drain(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/**
 * 저장된 계약 PDF 가 발급 시점 그대로인지 확인한다.
 *
 * 기대 해시와 다르면 `intact:false` 와 **실제 해시**를 함께 돌려준다 — 감사
 * 기록에 "무엇으로 바뀌었는지"를 남길 수 있어야 하기 때문.
 *
 * 객체가 아예 없으면 storage 의 `ENOENT` 를 그대로 던진다(삼키지 않는다):
 * 파일 부재와 내용 변조는 성격이 다른 사건이므로 호출자가 구분해 다뤄야 한다.
 */
export async function verifyStoredPdf(
  storage: Storage,
  key: string,
  expectedSha256: string,
): Promise<{ intact: boolean; computed: string }> {
  const { stream } = await storage.read(key);
  const computed = sha256Hex(await drain(stream));
  return { intact: computed === expectedSha256, computed };
}
