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

  // 인코딩 변형본이 같은 권한으로 통과하면 토큰 문자열이 신원이 못 된다. 지금은
  // 인가가 깨지지 않지만(변형본도 원본 권한만 얻는다), 토큰을 키로 쓰는 것이 하나라도
  // 생기면(레이트리밋·멱등키·감사) 그날 깨진다 — 정규형만 받는다.
  it('정규 인코딩이 아닌 변형본은 거부한다 (같은 권한으로 통과하지 않는다)', () => {
    const t = signUploadToken(UPLOAD, WS_A, NOW);
    const [rawId, exp, sig] = t.split('.') as [string, string, string];

    // 주의: 스노우싸인 uploadId 는 `upl_` + hex 라 base64 와 base64url 이 **같은
    // 문자열**이다(+/ 가 나오지 않는다). 그래서 그 축은 여기서 변형본이 아니다 —
    // 실제로 갈리는 것은 패딩과 숫자 표기다.
    const variants = [
      `${rawId}==.${exp}.${sig}`,
      // Number() 가 받아주는 exp 표기 변형
      `${rawId}. ${exp}.${sig}`,
      `${rawId}.0x${Number(exp).toString(16)}.${sig}`,
    ];
    for (const v of variants) {
      expect(verifyUploadToken(v, WS_A, NOW + 1000)).toEqual({ ok: false, error: 'FORBIDDEN' });
    }
    // 원본은 여전히 통과한다.
    expect(verifyUploadToken(t, WS_A, NOW + 1000)).toEqual({ ok: true, uploadId: UPLOAD });
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
