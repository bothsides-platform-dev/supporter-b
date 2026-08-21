// @vitest-environment node
//
// 운영 500 회귀 가드 — /contract-templates 는 서버(Node)에서 SSR 되므로 이 페이지의
// 클라이언트 모듈 그래프는 DOM 전역 없이 평가 가능해야 한다. pdfjs-dist(build/pdf.mjs)는
// 모듈 최상위에서 `new DOMMatrix()` 를 실행해 Node 에서 즉사한다 — 정적 import 로
// 서버 그래프에 들어오면 인증 통과한 GET 마다 500 이다.
//
// 서버 액션 모듈은 mock 한다: 실제 SSR 번들에서도 'use server' import 는 액션 레퍼런스
// 스텁으로 치환되므로(진짜 서버 그래프가 로드되는 게 아니다) mock 이 더 충실하다.
// ContractTemplateEditor / pdfjs-dist 는 절대 mock 하지 않는다 — 그게 검증 대상이다.
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/server/actions/signing/listSigningTemplatesAction', () => ({
  listSigningTemplatesAction: vi.fn(),
}));
vi.mock('@/lib/server/actions/signing/deleteSigningTemplateAction', () => ({
  deleteSigningTemplateAction: vi.fn(),
}));
vi.mock('@/lib/server/actions/signing/renameSigningTemplateAction', () => ({
  renameSigningTemplateAction: vi.fn(),
}));
vi.mock('@/lib/server/actions/signing/createSigningTemplateUploadSessionAction', () => ({
  createSigningTemplateUploadSessionAction: vi.fn(),
}));
vi.mock('@/lib/server/actions/signing/createSigningTemplateAction', () => ({
  createSigningTemplateAction: vi.fn(),
}));
vi.mock('@/lib/server/actions/signing/getSigningTemplateDetailAction', () => ({
  getSigningTemplateDetailAction: vi.fn(),
}));
vi.mock('@/lib/server/actions/signing/updateSigningTemplateAction', () => ({
  updateSigningTemplateAction: vi.fn(),
}));

describe('ContractTemplateList — SSR(Node) 모듈 그래프 안전성', () => {
  // 재는 것은 **DOM 전역 없이 평가되는가**이지 속도가 아니다. 이 import 는 조항형
  // 에디터까지 딸린 무거운 그래프를 콜드 트랜스폼하므로, 부하가 걸린 CI 에서
  // unit-jsdom 프로젝트의 기본 5초(vitest.config.ts 는 이 프로젝트에 testTimeout 을
  // 두지 않는다)를 넘겨 타임아웃했다. 시간은 이 성질과 무관하니 넉넉히 준다 —
  // 늘려도 검증력은 그대로다(DOMMatrix 가 유입되면 시간과 무관하게 reject 된다).
  it(
    'DOM 전역 없는 Node 에서 import 가 성공한다 (pdfjs-dist 서버 그래프 유입 금지)',
    async () => {
      await expect(import('../ContractTemplateList')).resolves.toHaveProperty(
        'ContractTemplateList',
      );
    },
    30_000,
  );
});
