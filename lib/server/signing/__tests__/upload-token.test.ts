import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { signUploadToken, verifyUploadToken, UPLOAD_TOKEN_TTL_MS } from '../upload-token';

const WS_A = 'ws-aaaaaaaa';
const WS_B = 'ws-bbbbbbbb';
const UPLOAD = 'upl_cec40d1b7ff14390b1c85e62631c508a';
const NOW = 1_800_000_000_000;

beforeEach(() => {
  process.env.AUTH_SECRET = 'test-secret-for-upload-token';
});
afterEach(() => {
  delete process.env.AUTH_SECRET;
});

describe('업로드 세션 소유 바인딩 토큰', () => {
  it('같은 워크스페이스면 uploadId 를 돌려준다', () => {
    const t = signUploadToken(UPLOAD, WS_A, NOW);
    expect(verifyUploadToken(t, WS_A, NOW + 1000)).toEqual({ ok: true, uploadId: UPLOAD });
  });

  // 이 테스트가 이 모듈의 존재 이유다. 업로드 세션은 **조직(API 키) 공유**라
  // 다른 PG 의 `upl_…` 을 알아낸 워크스페이스가 그 PDF 로 자기 템플릿을 만들 수 있었다.
  it('다른 워크스페이스는 거부한다 — 크로스-테넌트 클레임 차단', () => {
    const t = signUploadToken(UPLOAD, WS_A, NOW);
    expect(verifyUploadToken(t, WS_B, NOW + 1000)).toEqual({ ok: false, error: 'FORBIDDEN' });
  });

  // 스노우싸인 업로드 세션 자체가 10분 TTL 이다 — 토큰이 그보다 오래 살면
  // 죽은 세션을 가리키는 유효 토큰이 남는다.
  it('만료된 토큰은 거부한다', () => {
    const t = signUploadToken(UPLOAD, WS_A, NOW);
    expect(verifyUploadToken(t, WS_A, NOW + UPLOAD_TOKEN_TTL_MS + 1)).toEqual({
      ok: false,
      error: 'UPLOAD_SESSION_EXPIRED',
    });
  });

  it('uploadId 를 바꿔치기하면 서명이 깨져 거부된다', () => {
    const t = signUploadToken(UPLOAD, WS_A, NOW);
    const [, exp, sig] = t.split('.');
    const forged = `${Buffer.from('upl_someone_elses').toString('base64url')}.${exp}.${sig}`;
    expect(verifyUploadToken(forged, WS_A, NOW + 1000)).toEqual({ ok: false, error: 'FORBIDDEN' });
  });

  it('형태가 깨진 토큰에 throw 하지 않는다', () => {
    for (const bad of ['', 'a', 'a.b', 'a.b.c.d', 'a.notanumber.c']) {
      expect(verifyUploadToken(bad, WS_A, NOW)).toEqual({ ok: false, error: 'FORBIDDEN' });
    }
  });

  // 시크릿이 없으면 서명이 무의미하다 — 조용히 통과시키면 게이트가 꺼진 채로 돈다.
  it('AUTH_SECRET 이 없으면 fail-closed', () => {
    const t = signUploadToken(UPLOAD, WS_A, NOW);
    delete process.env.AUTH_SECRET;
    expect(() => signUploadToken(UPLOAD, WS_A, NOW)).toThrow();
    expect(verifyUploadToken(t, WS_A, NOW + 1000)).toEqual({ ok: false, error: 'FORBIDDEN' });
  });
});
