// 조항형 계약서 미리보기 — 편집 중인(저장 안 된) 문서를 PDF 로 렌더해 돌려준다.
//
// **게이트가 이 파일의 핵심이다.** `/api` 는 프록시 매처 밖이라 여기 인라인 게이트가
// 유일한 게이트다(`template-pdf-handler` 와 같은 규율). 렌더는 단일 PM2 fork 의 CPU 를
// 쓰므로 입력 상한도 게이트다 — 무제한 문서는 자해 DoS 다.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({
  isSessionRevoked: vi.fn(async () => false),
  isEmailUnverified: vi.fn(async () => false),
}));
vi.mock('@/lib/auth/pg-membership-gate', () => ({
  isPgMembershipBlocked: vi.fn(async () => false),
}));

import { auth } from '@/auth';
import { isSessionRevoked, isEmailUnverified } from '@/lib/auth/session';
import { isPgMembershipBlocked } from '@/lib/auth/pg-membership-gate';
import { handleComposePreview } from '../compose-preview-handler';
import {
  PREVIEW_RENDER_LIMIT_PER_USER,
  __resetPreviewRateLimitForTest,
} from '../preview-rate-limit';

const PG_SESSION = {
  user: { id: 'u1', workspaceId: 'ws1', workspaceType: 'pg' },
};

const DOC = {
  _v: 1,
  title: '전자결제 서비스 이용계약서',
  preamble: '갑과 을은 다음과 같이 계약을 체결한다.',
  clauses: [{ id: 'c1', kind: 'text', heading: '목적', body: '본 계약은 목적을 정한다.' }],
  closing: '각 1부씩 보관한다.',
};

function req(body: unknown): Request {
  return new Request('https://example.com/api/signing/templates/preview', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.mocked(auth).mockResolvedValue(PG_SESSION as never);
  vi.mocked(isSessionRevoked).mockResolvedValue(false);
  vi.mocked(isEmailUnverified).mockResolvedValue(false);
  vi.mocked(isPgMembershipBlocked).mockResolvedValue(false);
  // 리미터는 모듈 수준 상태다 — 리셋하지 않으면 앞 테스트가 쓴 예산이 뒤 테스트를 429 로
  // 떨어뜨리고, 실패가 파일 안 순서에 의존하게 된다.
  __resetPreviewRateLimitForTest();
});

describe('handleComposePreview — 게이트', () => {
  it('비인증은 401', async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    expect((await handleComposePreview(req({ document: DOC }))).status).toBe(401);
  });

  it('폐기된 세션은 401', async () => {
    vi.mocked(isSessionRevoked).mockResolvedValue(true);
    expect((await handleComposePreview(req({ document: DOC }))).status).toBe(401);
  });

  it('이메일 미인증은 403', async () => {
    vi.mocked(isEmailUnverified).mockResolvedValue(true);
    expect((await handleComposePreview(req({ document: DOC }))).status).toBe(403);
  });

  // PG 승인 서버 데이터 경계 — /api 는 프록시 매처 밖이라 이 인라인 게이트가 유일하다.
  it('승인 대기 PG 멤버는 403', async () => {
    vi.mocked(isPgMembershipBlocked).mockResolvedValue(true);
    expect((await handleComposePreview(req({ document: DOC }))).status).toBe(403);
  });

  it('구매사 워크스페이스는 403 — PG 전용 표면이다', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'u1', workspaceId: 'ws1', workspaceType: 'buyer' },
    } as never);
    expect((await handleComposePreview(req({ document: DOC }))).status).toBe(403);
  });
});

describe('handleComposePreview — 입력 검증', () => {
  it('본문이 JSON 이 아니면 400', async () => {
    const bad = new Request('https://example.com/x', { method: 'POST', body: 'not json' });
    expect((await handleComposePreview(bad)).status).toBe(400);
  });

  it('문서 모양이 어긋나면 400', async () => {
    expect((await handleComposePreview(req({ document: { title: 1 } }))).status).toBe(400);
  });

  // 렌더는 단일 PM2 fork 의 CPU 다 — 상한이 없으면 문서 하나로 서버를 묶을 수 있다.
  it('조항 수 상한을 넘으면 400', async () => {
    const many = {
      ...DOC,
      clauses: Array.from({ length: 200 }, (_, i) => ({
        id: `c${i}`,
        kind: 'text',
        heading: '조',
        body: '본문',
      })),
    };
    expect((await handleComposePreview(req({ document: many }))).status).toBe(400);
  });

  it('본문 길이 상한을 넘으면 400', async () => {
    const huge = {
      ...DOC,
      clauses: [{ id: 'c1', kind: 'text', heading: '조', body: 'ㄱ'.repeat(50_000) }],
    };
    expect((await handleComposePreview(req({ document: huge }))).status).toBe(400);
  });

  // ⚠️ 위 두 테스트는 **zod 상한**에 걸려 400 이 된다(직렬화 크기가 각각 11KB·50KB 라
  // 바이트 게이트에 닿지도 않는다). 바이트 게이트를 따로 시험하려면 **스키마는 지키면서**
  // 총량만 큰 문서가 필요하다 — 그리고 한글이어야 한다: 상한 이름은 `_BYTES` 인데
  // 재던 값이 UTF-16 코드 단위라, 한글 문서는 선언한 128KB 의 3배까지 통과했다.
  it('스키마를 지키면서 전체 크기가 상한을 넘으면 400 (한글 = UTF-8 바이트로 잰다)', async () => {
    const doc = {
      ...DOC,
      clauses: Array.from({ length: 60 }, (_, i) => ({
        id: `c${i}`,
        kind: 'text',
        heading: '조',
        body: '가'.repeat(2_000),
      })),
    };
    // 문자 수로는 상한 아래(12만 < 131072)지만 UTF-8 로는 3배다.
    expect(JSON.stringify({ document: doc }).length).toBeLessThan(131_072);
    expect((await handleComposePreview(req({ document: doc }))).status).toBe(400);
  });

  // 미등록 토큰은 저장에서도 막지만, 미리보기에서 먼저 알려주는 편이 친절하다.
  it('미등록 토큰이 있으면 400', async () => {
    const bad = { ...DOC, preamble: '{{없는토큰}}' };
    expect((await handleComposePreview(req({ document: bad }))).status).toBe(400);
  });
});

describe('handleComposePreview — 렌더 예산', () => {
  it('사용자 창을 넘기면 429 (렌더까지 가지 않는다)', async () => {
    for (let i = 0; i < PREVIEW_RENDER_LIMIT_PER_USER; i += 1) {
      expect((await handleComposePreview(req({ document: DOC }))).status).toBe(200);
    }
    expect((await handleComposePreview(req({ document: DOC }))).status).toBe(429);
  });
});

describe('handleComposePreview — 정상', () => {
  it('PDF 를 돌려주고 캐시하지 않는다', async () => {
    const res = await handleComposePreview(req({ document: DOC }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('cache-control')).toContain('no-store');
    const bytes = new Uint8Array(await res.arrayBuffer());
    // %PDF 매직넘버
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x25, 0x50, 0x44, 0x46]);
  });

  // 작성 시점에는 딜이 없다 — 변수는 눈에 띄는 자리표시자로 그린다.
  it('변수는 자리표시자로 그려지고 실패하지 않는다', async () => {
    const withVars = {
      ...DOC,
      preamble: '{{구매사.상호}}와 {{PG사.상호}}는 {{정산주기}} 로 정산한다.',
    };
    const res = await handleComposePreview(req({ document: withVars }));
    expect(res.status).toBe(200);
  });
});
