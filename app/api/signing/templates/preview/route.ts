/**
 * POST /api/signing/templates/preview — 조항형 계약서 미리보기 PDF.
 *
 * 편집 중인(저장 안 된) 문서를 본문으로 받아 **발송 때와 같은 렌더러**로 그린다.
 * GET-by-id 가 아닌 이유: 미리보기는 지금 화면의 편집 상태를 보여줘야 하고,
 * id 조회면 "저장해야 미리보기"가 되어 편집 흐름이 끊긴다.
 * (핸들러 공유 — 게이트·검증·렌더는 lib/server/signing/compose-preview-handler.ts)
 */
import { handleComposePreview } from '@/lib/server/signing/compose-preview-handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  return handleComposePreview(req);
}
