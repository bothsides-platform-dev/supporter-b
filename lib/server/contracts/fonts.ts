import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * 계약 PDF 각인용 Pretendard 정적 TTF 로더.
 *
 * **서버 전용** — `node:fs` 를 정적 import 하므로 클라이언트 번들에 끌려오면
 * 빌드가 즉시 깨진다(즉 사실상의 server-only 가드). `import 'server-only'` 를
 * 쓰지 않는 이유: 이 레포는 `server-only` 를 직접 의존하지 않고(next 의 중첩
 * 의존일 뿐 pnpm strict 레이아웃에서 호이스팅되지 않음) Next 번들러 밖 —
 * vitest·tsc — 에서 모듈 해석에 실패한다. 실제로 검증함:
 *   Error: Cannot find package 'server-only'
 * 가드가 필요해지면 package.json 에 server-only 를 정식 의존으로 추가한 뒤
 * 이 주석과 함께 되살린다.
 *
 * 가변(Variable) 폰트 대신 정적 TTF 를 쓴다 — harfbuzz 서브셋 + pdf-lib 임베드
 * 경로에서 정적 TTF 가 가장 예측 가능하기 때문(가변 축 처리 불필요).
 */

const FONT_DIR = path.join('public', 'fonts', 'static');

export type ContractFontBytes = { regular: Buffer; semibold: Buffer };

let cached: Promise<ContractFontBytes> | null = null;

/**
 * 폰트 바이트를 읽어 모듈 레벨로 캐시한다(수 MB × 2 — 요청마다 읽지 않는다).
 *
 * 프로미스 자체를 캐시해 동시 호출을 한 번의 읽기로 합류시키되, **실패한
 * 프로미스는 캐시에서 지운다** — 일시적 fs 오류가 프로세스 수명 내내 박제되어
 * 이후 모든 계약 발송을 죽이는 것을 막는다.
 */
export function loadContractFontBytes(): Promise<ContractFontBytes> {
  cached ??= (async () => {
    const [regular, semibold] = await Promise.all([
      readFile(path.join(process.cwd(), FONT_DIR, 'Pretendard-Regular.ttf')),
      readFile(path.join(process.cwd(), FONT_DIR, 'Pretendard-SemiBold.ttf')),
    ]);
    return { regular, semibold };
  })().catch((err: unknown) => {
    cached = null;
    throw err;
  });
  return cached;
}
