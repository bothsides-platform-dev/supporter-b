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
import { test, expect } from 'playwright/test';

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

  test('랜딩 text-sm 이 본문과 같은 크기·행간을 유지한다 (leading-[inherit])', async ({
    page,
  }) => {
    // 고친 방식(text-sm)은 font-size 와 함께 line-height 도 들고 온다. 결정은
    // "색 복구 외 시각 델타 0" 이었으므로 leading-[inherit] 로 행간을 묶었다.
    // 그 결정이 조용히 풀리면(누가 leading-[inherit] 를 지우면) 여기서 깨진다.
    await page.goto('/');

    const cta = page.locator('header a[href="/rfp-create"]').first();
    await expect(cta).toBeVisible();

    const measured = await cta.evaluate((el) => {
      const cs = getComputedStyle(el);
      const body = getComputedStyle(document.body);
      return {
        fontSize: cs.fontSize,
        bodyFontSize: body.fontSize,
        lineHeight: cs.lineHeight,
        bodyLineHeight: body.lineHeight,
      };
    });

    expect(measured.fontSize).toBe(measured.bodyFontSize);
    expect(measured.lineHeight).toBe(measured.bodyLineHeight);
  });
});
