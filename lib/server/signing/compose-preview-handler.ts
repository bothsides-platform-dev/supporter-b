// 조항형 계약서 미리보기 — 편집 중인(저장 안 된) 문서를 PDF 로 렌더해 돌려준다.
//
// **저장된 id 로 GET 하지 않고 문서를 POST 로 싣는다.** 미리보기가 보여줘야 하는 것은
// 지금 화면의 편집 상태이고, GET-by-id 면 "저장해야 미리보기"가 되어 편집 흐름이 끊긴다.
//
// 미리보기 바이트는 **발송 때 올라가는 바이트와 같은 렌더러**가 만든다. 그래서 "본
// 대로 서명된다"가 구조적 보장이지 노력 목표가 아니다(변수 값이 자리표시자라 줄 수는
// 달라질 수 있다 — 화면이 그 사실을 함께 알린다).
//
// pdf.js 를 쓰지 않는다 — 소비자는 `<iframe>` 이다. 뷰어를 얹으면 500KB 청크와
// `ssr-boundary/pdfjs` 경계 확장을 사는 대신 크롬 일관성만 얻는데, 그 업그레이드는
// 같은 라우트로 나중에 순수 클라이언트 변경으로 할 수 있다.

import { auth } from '@/auth';
import { isEmailUnverified, isSessionRevoked } from '@/lib/auth/session';
import { isPgMembershipBlocked } from '@/lib/auth/pg-membership-gate';
import { ContractDocSchema } from '@/lib/contract-doc/schema';
import { exceedsDocumentByteLimit } from '@/lib/contract-doc/limits';
import { previewContractDoc } from '@/lib/contract-doc/variables';
import { renderContractPdf } from '@/lib/contract-doc/render-pdf';
import { logger } from '@/lib/observability/logger';
import { consumePreviewRenderBudget } from './preview-rate-limit';

/** 표가 어떻게 보이는지 판단할 수 있을 만큼의 예시 — 실제 요율이 아니다. */
const SAMPLE_FEE_ROWS = [
  { label: '카드', value: '영세 0.50% · 중소1 1.10% · 일반 2.50%' },
  { label: '계좌이체', value: '1.30%' },
  { label: '가상계좌', value: '건당 300원' },
];

const SAMPLE_PARTIES = {
  buyer: { company: '〔구매사 상호〕', bizNo: undefined },
  pg: { company: '〔PG사 상호〕', bizNo: undefined },
};

export async function handleComposePreview(request: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) return new Response('Unauthorized', { status: 401 });
  if (await isSessionRevoked(session)) return new Response('Unauthorized', { status: 401 });
  if (await isEmailUnverified(session)) return new Response('Forbidden', { status: 403 });
  // PG 승인 서버 데이터 경계 — `/api` 는 프록시 매처 밖이라 이 인라인 게이트가
  // 유일한 게이트다(마스터 면제는 isPgMembershipBlocked 내부).
  if (await isPgMembershipBlocked(session)) return new Response('Forbidden', { status: 403 });

  const user = session.user as { workspaceId?: string; workspaceType?: string };
  if (!user.workspaceId) return new Response('Forbidden', { status: 403 });
  // 조항형 서식은 PG 전용 표면이다.
  if (user.workspaceType !== 'pg') return new Response('Forbidden', { status: 403 });

  // 렌더 예산 — 크기 상한이 문서 **하나**의 비용을 막는다면, 이쪽은 **횟수**를 막는다.
  // 에디터가 700ms 디바운스로 자동 발사하므로 증폭이 정상 사용 루프 안에 있다.
  const budget = consumePreviewRenderBudget(session.user.id);
  if (budget !== 'ok') {
    logger.warn('signing.compose_preview_throttled', { reason: budget });
    return new Response('Too Many Requests', { status: 429 });
  }

  const raw = await request.text();
  // 렌더는 단일 PM2 fork 의 CPU 를 쓴다 — 파싱 전에 크기부터 자른다.
  // 바이트로 잰다: `raw.length` 는 UTF-16 코드 단위라 한글 문서가 상한의 3배까지 샌다.
  if (exceedsDocumentByteLimit(raw)) return new Response('Payload Too Large', { status: 400 });

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(raw);
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  const input = (parsedBody as { document?: unknown } | null)?.document;
  const doc = ContractDocSchema.safeParse(input);
  if (!doc.success) return new Response('Bad Request', { status: 400 });

  // 미등록 토큰은 저장에서도 막지만, 미리보기에서 먼저 알려주는 편이 친절하다 —
  // 사용자는 방금 친 오타를 바로 본다.
  const resolved = previewContractDoc(doc.data);
  if (!resolved.ok) {
    return new Response(`Unknown tokens: ${resolved.unknownTokens.join(', ')}`, { status: 400 });
  }

  try {
    const rendered = await renderContractPdf({
      doc: resolved.doc,
      feeRows: SAMPLE_FEE_ROWS,
      parties: SAMPLE_PARTIES,
    });
    return new Response(rendered.bytes as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        // 편집 중 문서다 — 어디에도 남기지 않는다.
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e) {
    logger.error('signing.compose_preview_render_failed', { err: String(e) });
    return new Response('Render failed', { status: 500 });
  }
}
