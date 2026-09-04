/**
 * 랜딩 텍스트 토큰 캐스케이드 e2e.
 *
 * `text-[var(--text-sm)]` 형태가 Tailwind v4 에서 `color:` 로 컴파일되던 버그
 * (36곳)의 회귀 가드다. 유닛 드리프트 가드(lib/design/__tests__/
 * text-size-token-drift.test.ts)는 **소스에 그 표기가 없다**는 것만 단언한다 —
 * 실제로 브라우저 캐스케이드에서 색이 이겼는지는 볼 수 없다. 같은 클로버는
 * 다른 표기로도 재발할 수 있으므로 계산된 스타일을 직접 확인한다.
 *
 * 헤더 CTA 는 이 버그의 대표 피해자였다: 파란 버튼 위 `on-primary`(흰색)가
 * 무효 선언에 덮여 `color` 가 상속으로 떨어지면서 본문색(어두움)으로 렌더됐다.
 *
 * 비인증 랜딩이라 로그인·DB 가 필요 없다.
 */
import { test, expect, type Locator } from 'playwright/test';

/**
 * 한 엘리먼트의 계산된 색·크기·행간 + **오라클 앵커**를 잰다.
 *
 * 행간은 px 가 아니라 자기 font-size 대비 **비율**로 돌려준다. 랜딩 nav·CTA 는
 * body(16px)보다 작은 `text-sm`(14px) 이라 px 동치가 성립하지 않기 때문이다 —
 * v0.5.5.0 "readable typography floor" 가 앱 본문 기준선을 14px→16px 로 올릴 때
 * 랜딩 컨트롤은 밀도를 지키려 14px 로 남겼다(의도된 차이).
 *
 * **오라클 앵커가 왜 필요한가.** 기대 행간을 살아 있는 body 에서 파생하면 body
 * 자신이 틀어졌을 때 둘이 함께 틀어져 조용히 통과한다: `app/globals.css` 의
 * `font-size: var(--md-typescale-body-large-size)` 를 `14px` 리터럴로 바꾸면
 * 본문 기준선이 되돌아가는데, 랜딩 컨트롤은 그대로 14px 이라 이 스펙도 초록,
 * `tokens.css` 의 토큰 값만 보는 유닛 가드도 초록이다(그 가드는 토큰 **선언**을
 * 볼 뿐 globals.css 가 그 토큰을 **쓰는지**는 보지 않는다 — 확인함). 그래서
 * 같은 자리에 프로브 span 을 띄워 토큰이 지시하는 값을 직접 읽고, body 가 정말
 * 그 값을 쓰는지 되묻는다. `rem` 은 부모가 아니라 루트 기준이라 프로브는 body
 * 가 오염돼도 토큰 값을 그대로 돌려준다. 색 축에서 이미 쓰는 기법이다(아래
 * 첫 테스트의 `on-primary` 프로브).
 */
async function measureType(el: Locator) {
  return el.evaluate((node) => {
    const cs = getComputedStyle(node);
    const body = getComputedStyle(document.body);
    const ratio = (lh: string, fs: string) => parseFloat(lh) / parseFloat(fs);

    // 토큰이 지시하는 본문 타이포 — body 의 실제 계산값과 대조할 기준선.
    const probe = document.createElement('span');
    probe.style.fontSize = 'var(--md-typescale-body-large-size)';
    probe.style.lineHeight = 'var(--md-typescale-body-large-line-height)';
    document.body.appendChild(probe);
    const ps = getComputedStyle(probe);
    const tokenFontSize = ps.fontSize;
    const tokenLeadingRatio = ratio(ps.lineHeight, ps.fontSize);
    probe.remove();

    return {
      color: cs.color,
      bodyColor: body.color,
      fontSize: cs.fontSize,
      leadingRatio: ratio(cs.lineHeight, cs.fontSize),
      bodyFontSize: body.fontSize,
      bodyLeadingRatio: ratio(body.lineHeight, body.fontSize),
      tokenFontSize,
      tokenLeadingRatio,
    };
  });
}

/**
 * 랜딩 컨트롤(nav 링크·헤더 CTA)의 타이포가 `text-sm leading-[inherit]` 인지
 * 브라우저 계산값으로 단언한다. **세 축을 함께 문다.**
 *
 * ① 오라클 앵커 — body 가 실제로 타이포 토큰을 쓰는가(위 docblock 참조).
 *    이게 없으면 아래 두 축의 기준선 자체가 조용히 움직인다.
 * ② 크기 14px — 의도된 컨트롤 밀도다. 비율만 재면 `text-sm leading-[inherit]`
 *    을 **통째로 지운** 변이를 놓친다: 그때 엘리먼트는 body 의 16px/1.5 를
 *    상속해 비율이 1.5 로 같아져 그냥 통과한다. 소스 드리프트 가드도 못 잡는다
 *    — 그 가드는 `text-sm` 이 있을 때 짝이 되는 `leading-` 을 확인할 뿐이라
 *    `text-sm` 자체가 사라지면 아예 발화하지 않는다. 즉 이 축이 없으면 랜딩
 *    컨트롤이 조용히 16px 로 부풀어도 어느 테스트도 빨개지지 않는다.
 * ③ 행간 비율 — `leading-[inherit]` 이 body 의 무단위 값을 물려받는가. 이
 *    클래스만 지우면 Tailwind 의 `text-sm` 이 자기 line-height(1.25rem)를
 *    들고 와 비율이 1.5 → 1.4286 으로 떨어진다.
 *
 * 변이 검증 3종(전부 실측): 두 컴포넌트에서 `text-sm leading-[inherit]` 을
 * 통째로 지우면 ②가 RED(14px 기대/16px 수신), `leading-[inherit]` 만 지우면
 * ③이 RED(1.5→1.4286), `globals.css` 의 body font-size 를 리터럴로 바꾸면
 * ①이 RED.
 *
 * 허용오차가 소수 2자리인 것은 의도적이다 — 무는 신호(1.5 vs 1.4286, 델타
 * 0.0714)보다 한참 작으면서 서브픽셀 반올림에는 여유가 있다. 5자리(1e-5)는
 * 마진이 0 이라 올바른 빌드에서 흔들릴 수 있다.
 */
const LANDING_CONTROL_FONT_SIZE = '14px';

/** 비율 비교 허용오차(소수 자릿수). 근거는 위 docblock 마지막 문단. */
const LEADING_RATIO_PRECISION = 2;

function expectLandingControlType(m: {
  fontSize: string;
  leadingRatio: number;
  bodyFontSize: string;
  bodyLeadingRatio: number;
  tokenFontSize: string;
  tokenLeadingRatio: number;
}) {
  // ① 오라클 앵커
  expect(m.bodyFontSize).toBe(m.tokenFontSize);
  expect(m.bodyLeadingRatio).toBeCloseTo(m.tokenLeadingRatio, LEADING_RATIO_PRECISION);
  // ② 크기  ③ 행간 비율
  expect(m.fontSize).toBe(LANDING_CONTROL_FONT_SIZE);
  expect(m.leadingRatio).toBeCloseTo(m.bodyLeadingRatio, LEADING_RATIO_PRECISION);
}

test.describe('랜딩 텍스트 토큰 캐스케이드', () => {
  test('헤더 CTA 글자색이 상속으로 떨어지지 않고 on-primary 토큰을 유지한다', async ({
    page,
  }) => {
    await page.goto('/');

    const header = page.locator('header.group\\/lheader').first();
    const cta = page.locator('header a[href="/rfp-create"]').first();
    await expect(cta).toBeVisible();

    const measure = () =>
      cta.evaluate((el) => {
        // 토큰을 이 엘리먼트의 캐스케이드 안에서 해석한다 — over-dark 오버라이드가
        // 걸린 상태에서도 "지금 이 자리에서 on-primary 는 무슨 색인가"를 얻는다.
        const probe = document.createElement('span');
        probe.style.color = 'var(--md-sys-color-on-primary)';
        el.appendChild(probe);
        const expectedColor = getComputedStyle(probe).color;
        probe.remove();
        return {
          color: getComputedStyle(el).color,
          expectedColor,
          bodyColor: getComputedStyle(document.body).color,
        };
      });

    // ── ① 히어로 다크 씬 위 (over-dark) ─────────────────────────────
    // 이 상태의 on-primary 는 inverse-surface 로 덮여 본문색과 값이 겹친다.
    // 그래서 여기서는 "본문색과 다르다" 를 물을 수 없고, 토큰 일치만 묻는다.
    await expect(header).toHaveAttribute('data-over-dark', 'true');
    const overDark = await measure();
    expect(overDark.color).toBe(overDark.expectedColor);

    // ── ② 히어로를 지나 헤더가 surface 로 복귀한 뒤 ──────────────────
    // 여기서 on-primary 는 파란 버튼 위 흰색이다. 클로버가 재발하면 color 가
    // 상속으로 떨어져 본문색(어두움)이 되므로, 이 상태에서만 그 단언이 문다.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(header).not.toHaveAttribute('data-over-dark', 'true');

    const onSurface = await measure();
    expect(onSurface.color).toBe(onSurface.expectedColor);
    expect(onSurface.color).not.toBe(onSurface.bodyColor);
  });

  // PG 랜딩도 같은 커밋에서 같은 표기를 고쳤다(PgLandingNav·PgLanding·
  // PgCaseCard·PgProcessStepRail). 구매사 랜딩만 재면 그쪽은 무보증으로 남는다.
  //
  // **이 테스트가 무는 축은 크기·행간이지 색이 아니다.** 옛 클로버 표기를
  // 되돌려도 깨지지 않는다 — 이 엘리먼트에서는 규칙 순서가 색 토큰 쪽으로
  // 기울어 애초에 클로버 피해자가 아니었다. 클로버 축의 브라우저 보증은
  // 구매사 헤더 CTA(위 테스트)가 지고, 표기 자체는 유닛 가드가 전 파일을 덮는다.
  // 크기·행간 두 축의 변이 검증 결과는 `expectLandingControlType` docblock 에 있다.
  test('PG 랜딩 nav 링크가 14px·본문 행간 비율을 유지한다', async ({ page }) => {
    // `/pg-landing` 은 이 스펙이 이 라우트를 처음 건드리는 지점이라 dev 서버
    // cold-compile 이 기본 30s 를 넘길 수 있다(_helpers.ts 의 loginAs 가 같은
    // 이유로 45s 를 쓴다). prod 빌드에서는 사전컴파일이라 즉시 통과한다.
    test.setTimeout(90_000);
    await page.goto('/pg-landing');

    const navLink = page.locator('header a[href="/login"]').first();
    await expect(navLink).toBeVisible();

    // 히어로를 지나 헤더가 surface 로 복귀한 뒤에 잰다 — over-dark 상태에선
    // 토큰이 color-mix 로 덮여 본문색과의 비교가 성립하지 않는다.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const header = page.locator('header.group\\/lheader').first();
    await expect(header).not.toHaveAttribute('data-over-dark', 'true');

    const measured = await measureType(navLink);

    // 여기서는 토큰 프로브로 비교하지 않는다 — PG nav 는 over-dark 변형이
    // `color-mix()` 를 쓰기 때문에 계산값이 oklab 으로 나와 리터럴 비교가 깨진다.
    // 클로버의 증상은 "색이 상속으로 떨어짐"이므로 그것만 직접 부정하면 충분하다.
    expect(measured.color).not.toBe(measured.bodyColor);
    expectLandingControlType(measured);
  });

  test('랜딩 컨트롤이 14px·본문 행간 비율을 유지한다 (text-sm leading-[inherit])', async ({
    page,
  }) => {
    // 고친 방식(text-sm)은 font-size 와 함께 line-height 도 들고 온다. 결정은
    // "색 복구 외 시각 델타 0" 이었으므로 leading-[inherit] 로 행간을 묶었다.
    //
    // **여기서 재는 것은 헤더 CTA 한 곳뿐이다.** 28곳 전체에 대한 보증은 유닛
    // 가드(lib/design/__tests__/text-size-token-drift.test.ts 의 "text-sm 은
    // 언제나 명시 leading 과 함께 온다")가 진다. 이 테스트의 몫은 그 규칙이
    // 실제 브라우저에서 의도한 값으로 계산되는지 한 지점에서 확인하는 것이다.
    await page.goto('/');

    const cta = page.locator('header a[href="/rfp-create"]').first();
    await expect(cta).toBeVisible();

    expectLandingControlType(await measureType(cta));
  });
});
