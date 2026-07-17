'use server';

import { z } from 'zod';

import { requireActiveWorkspace } from '@/lib/server/actions/_session';
import { getContractService } from '@/lib/server/services/contract';
import { CONTRACT_SIGNATURE_IMAGE_MAX_BYTES } from '@/lib/types/contract-doc';
import { getRequestMeta } from './_request-meta';
import type { ContractActionResult } from './_shared';

// dataURL 이 반드시 이 prefix 로 시작해야 한다 — canvas.toDataURL('image/png')의
// 실제 산출물(components/contracts/SignaturePad.tsx)과 정확히 일치.
const IMAGE_DATA_URL_PREFIX = 'data:image/png;base64,';
// PNG 매직바이트 8종 전체(간인 대체 감사추적 확인서에 실리는 서명 이미지의
// 형식 신뢰 경계) — lib/server/storage/sniff.ts 의 4바이트 sniff 와 별개로,
// 서명 이미지는 더 엄격한 8바이트 서명을 요구한다.
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const Input = z
  .object({
    docId: z.string().uuid(),
    // base64 인코딩은 원본 대비 ~4/3 배 팽창 — 512KB 디코드 상한을 감안한 넉넉한
    // 상한(서버액션 바디 1MB 이내 방어, CONTRACT_SIGNATURE_IMAGE_MAX_BYTES 주석 참조).
    imageDataUrl: z.string().min(1).max(1_000_000),
    method: z.enum(['draw', 'type']),
  })
  .strict();

export type SignContractInput = z.input<typeof Input>;
export type SignContractResult = ContractActionResult<{ completed: boolean }>;

/** `data:image/png;base64,...` → 검증된 PNG Buffer. 실패하면 null. */
function parseSignatureImage(imageDataUrl: string): Buffer | null {
  if (!imageDataUrl.startsWith(IMAGE_DATA_URL_PREFIX)) return null;
  const buf = Buffer.from(imageDataUrl.slice(IMAGE_DATA_URL_PREFIX.length), 'base64');
  if (buf.length === 0 || buf.length > CONTRACT_SIGNATURE_IMAGE_MAX_BYTES) return null;
  if (!buf.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) return null;
  return buf;
}

/**
 * 활성 워크스페이스 서명자가 서명 이미지를 제출. imageDataUrl 파싱(prefix→base64
 * decode→크기 상한→PNG 매직바이트)이 핵심 검증 — 실패 시 INVALID_SIGNATURE_IMAGE.
 * 통과분만 Buffer로 ContractService.sign 위임.
 */
export async function signContractAction(input: SignContractInput): Promise<SignContractResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const ws = await requireActiveWorkspace();
  if (!ws.ok) return ws;

  const imagePng = parseSignatureImage(parsed.data.imageDataUrl);
  if (!imagePng) return { ok: false, error: 'INVALID_SIGNATURE_IMAGE' };

  const meta = await getRequestMeta();
  const service = await getContractService();
  return service.sign(
    parsed.data.docId,
    { imagePng, method: parsed.data.method },
    { userId: ws.userId, workspaceId: ws.workspaceId },
    meta,
  );
}
