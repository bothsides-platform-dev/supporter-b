import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * 템플릿 PDF 업로드 세션의 **소유 바인딩 토큰**.
 *
 * 왜 필요한가: 스노우싸인 업로드 세션은 워크스페이스가 아니라 **API 키(=조직 전체
 * 공유)** 단위다. 그래서 `POST /v1/uploads` 가 준 `upl_…` id 를 클라이언트가 그대로
 * 돌려주는 구조에서는, 다른 PG 의 진행 중 업로드 id 를 알아낸 워크스페이스가 **그
 * 워크스페이스의 PDF 로 자기 템플릿을 만들 수 있다.** 우리 서버가 소유를 기억하지
 * 않으니 구분할 방법이 없었다(TODOS: "템플릿 업로드 세션에 소유 바인딩이 없다").
 *
 * 왜 DB 가 아니라 서명인가: 바인딩은 **10분짜리 수명**이라(스노우싸인 세션 TTL) 테이블을
 * 두면 만료 청소까지 딸려온다. 서명 토큰이면 상태가 없어 프로세스 재시작에도 견디고,
 * 만료가 토큰 안에 들어 있어 정리할 것이 없다.
 *
 * 워크스페이스 id 는 토큰 **본문에 넣지 않는다** — 검증할 때 호출자의 세션에서 온 값으로
 * HMAC 을 다시 계산한다. 남의 토큰을 가져와도 자기 워크스페이스로는 서명이 맞지 않는다.
 */

/** 스노우싸인 업로드 세션 자체가 10분이다 — 그보다 오래 사는 토큰은 죽은 세션을 가리킨다. */
export const UPLOAD_TOKEN_TTL_MS = 10 * 60 * 1000;

type VerifyResult =
  | { ok: true; uploadId: string }
  | { ok: false; error: 'FORBIDDEN' | 'UPLOAD_SESSION_EXPIRED' };

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error('AUTH_SECRET is required to sign upload tokens');
  return s;
}

function mac(uploadId: string, workspaceId: string, exp: number, key: string): string {
  return createHmac('sha256', key).update(`${uploadId}:${workspaceId}:${exp}`).digest('hex');
}

/** `<b64url(uploadId)>.<expMs>.<hmac>` */
export function signUploadToken(uploadId: string, workspaceId: string, now: number): string {
  const exp = now + UPLOAD_TOKEN_TTL_MS;
  const sig = mac(uploadId, workspaceId, exp, secret());
  return `${Buffer.from(uploadId).toString('base64url')}.${exp}.${sig}`;
}

export function verifyUploadToken(
  token: string,
  workspaceId: string,
  now: number,
): VerifyResult {
  // 어떤 형태 오류도 던지지 않는다 — 이 값은 클라이언트에서 온다.
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, error: 'FORBIDDEN' };
  const [rawId, rawExp, sig] = parts as [string, string, string];

  const exp = Number(rawExp);
  if (!Number.isSafeInteger(exp)) return { ok: false, error: 'FORBIDDEN' };

  let uploadId: string;
  try {
    uploadId = Buffer.from(rawId, 'base64url').toString('utf8');
  } catch {
    return { ok: false, error: 'FORBIDDEN' };
  }
  if (uploadId === '') return { ok: false, error: 'FORBIDDEN' };

  // 서명을 **먼저** 본다. 만료 판정을 앞에 두면 위조 토큰에도 '만료됐다'고 답해
  // 서명 검증을 통과했다는 정보를 흘린다.
  let expected: string;
  try {
    expected = mac(uploadId, workspaceId, exp, secret());
  } catch {
    return { ok: false, error: 'FORBIDDEN' }; // 시크릿 부재 = fail-closed
  }
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, error: 'FORBIDDEN' };

  if (now > exp) return { ok: false, error: 'UPLOAD_SESSION_EXPIRED' };
  return { ok: true, uploadId };
}
