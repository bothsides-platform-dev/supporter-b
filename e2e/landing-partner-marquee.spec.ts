import { test, expect } from 'playwright/test';
import { readFile } from 'node:fs/promises';

test.describe('buyer landing partner strip', () => {
  test.setTimeout(90_000);

  test('serves the original PNGs without cookies or authorization', async ({ playwright, baseURL }) => {
    const request = await playwright.request.newContext({ baseURL });
    for (const name of ['toss-payments', 'kiwoom-pay', 'hecto-financial']) {
      const response = await request.get(`/images/landing-partners/${name}.png`, { maxRedirects: 0 });
      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toContain('image/png');
      expect(await response.body()).toEqual(await readFile(`public/images/landing-partners/${name}.png`));
    }
    await request.dispose();
  });

  for (const [width, height] of [[360, 640], [390, 844], [768, 1024], [1440, 900], [2560, 1080], [390, 568], [1440, 600], [768, 480]]) {
    test(`keeps CTA and logos separate at ${width}x${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto('/');
      const hero = page.getByRole('region', { name: '서비스 소개', exact: true });
      const partners = page.getByRole('region', { name: '제휴 PG사' });
      await expect(partners).toBeVisible();
      await expect(partners.getByRole('img')).toHaveCount(3);
      const cta = hero.getByRole('link', { name: /맞춤 PG 견적 무료로 받기/ });
      const demo = hero.getByRole('link', { name: '데모 체험하기' });
      await expect(cta).toBeVisible();
      await expect(demo).toBeVisible();
      const stripBox = (await partners.boundingBox())!;
      for (const button of [cta, demo]) {
        const box = (await button.boundingBox())!;
        expect(box.y + box.height).toBeLessThanOrEqual(stripBox.y);
      }
      expect(stripBox.height).toBe(width >= 768 ? 128 : 96);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      const groupWidth = await partners.locator('[data-partner-group]').first().evaluate((el) => el.getBoundingClientRect().width);
      expect(groupWidth).toBeGreaterThanOrEqual(width);
      await expect(partners.locator('img').first()).toHaveJSProperty('complete', true);
    });
  }

  test('shows three stationary logos with reduced motion, including after resizing', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 360, height: 640 });
    await page.goto('/');
    const partners = page.getByRole('region', { name: '제휴 PG사' });
    await expect(partners).toBeVisible();
    for (const width of [360, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(partners.getByRole('img')).toHaveCount(3);
      const data = await partners.evaluate((el) => {
        const track = el.querySelector('[data-partner-track]')!;
        return { animation: getComputedStyle(track).animationName, boxes: [...el.querySelectorAll('[data-partner-logo]')]
          .filter((img) => img.checkVisibility()).map((img) => {
            const r = img.getBoundingClientRect();
            return { left: r.left, right: r.right, height: r.height };
          }) };
      });
      expect(data.animation).toBe('none');
      for (const box of data.boxes) {
        expect(box.left).toBeGreaterThanOrEqual(0);
        expect(box.right).toBeLessThanOrEqual(width);
      }
      expect(data.boxes[2].height).toBeLessThanOrEqual(30);
    }
  });

  test('keeps the logo lane visible when resizing a scrolled hero with reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const hero = page.getByRole('region', { name: '서비스 소개', exact: true });
    const partners = page.getByRole('region', { name: '제휴 PG사' });
    const scene = hero.locator(':scope > div');
    for (const [width, height] of [[1440, 900], [768, 320], [390, 844], [1440, 900]]) {
      await page.setViewportSize({ width, height });
      await expect.poll(() => scene.evaluate((el) => {
        const overflow = Math.max(0, (el as HTMLElement).offsetHeight - innerHeight);
        return Number.parseFloat(getComputedStyle(el).top) + overflow;
      })).toBe(0);
      await hero.evaluate((el) => {
        const overflow = Math.max(0, (el.firstElementChild as HTMLElement).offsetHeight - innerHeight);
        const bounds = el.getBoundingClientRect();
        window.scrollTo({ top: bounds.top + scrollY + overflow + (bounds.height - innerHeight - overflow) * 0.85, behavior: 'instant' });
      });
      await expect(partners).toBeInViewport({ ratio: 0.99 });
      await expect(partners.getByRole('img')).toHaveCount(3);
      await expect(partners.locator('[data-partner-track]')).toHaveCSS('animation-name', 'none');
      const product = hero.locator('.origin-top');
      await expect(product).toHaveCSS('opacity', '1');
      const box = (await product.boundingBox())!;
      const strip = (await partners.boundingBox())!;
      expect(strip.y - box.y - box.height).toBeGreaterThanOrEqual(width >= 768 ? 23 : 15);
    }
  });

  test('moves continuously through two loops, pauses on hover and stays visible through the hero', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const partners = page.getByRole('region', { name: '제휴 PG사' });
    const track = page.locator('[data-partner-track]');
    await expect(track).toHaveCSS('animation-play-state', 'running');
    await partners.hover();
    await expect(track).toHaveCSS('animation-play-state', 'paused');
    await page.mouse.move(1, 1);
    await expect(track).toHaveCSS('animation-play-state', 'running');
    // Seek the real CSS animation around two boundaries; inspect actual geometry
    // rather than changing its speed or replacing the keyframes.
    for (const loop of [1, 2]) {
      const samples = await track.evaluate((el, iteration) => {
        const animation = el.getAnimations()[0];
        const duration = Number(animation.effect!.getTiming().duration);
        const measure = (time: number) => {
          animation.currentTime = time;
          const x = new DOMMatrix(getComputedStyle(el).transform).m41;
          const width = el.firstElementChild!.getBoundingClientRect().width;
          return { x, width };
        };
        const before = measure(duration * iteration - 10);
        const after = measure(duration * iteration + 10);
        return { before, after };
      }, loop);
      expect(samples.before.x + samples.before.width).toBeCloseTo(0.28, 1);
      expect(samples.after.x).toBeCloseTo(-0.28, 1);
    }
    await page.setViewportSize({ width: 2560, height: 1080 });
    await expect.poll(() => track.locator('[data-partner-group]').first().evaluate((el) => el.getBoundingClientRect().width)).toBeGreaterThanOrEqual(2560);
    await page.evaluate(() => window.scrollTo({ top: window.innerHeight * 0.15, behavior: 'instant' }));
    await expect(partners).toBeInViewport();
    await expect(track).toHaveCSS('animation-play-state', 'running');
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await expect(partners).toBeVisible();
    await expect(track).toHaveCSS('animation-play-state', 'running');
  });

  test('does not add the buyer strip to the PG landing', async ({ page }) => {
    await page.goto('/pg-landing');
    await expect(page.getByText('Scroll', { exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: '제휴 PG사' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: '서비스 소개', exact: true }).locator('.origin-top')).toHaveCSS('opacity', '1');
  });

  test('reveals the buyer product window above the persistent partner strip, and hides it again on return', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    const hero = page.getByRole('region', { name: '서비스 소개', exact: true });
    const product = hero.locator('.origin-top');
    await expect(product).toHaveCSS('opacity', '0');
    const scrollToProgress = (progress: number) => hero.evaluate((el, value) => {
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY + (el.getBoundingClientRect().height - window.innerHeight) * value, behavior: 'instant' });
    }, progress);
    await scrollToProgress(0.04);
    await expect(product).toHaveCSS('opacity', '0');
    await scrollToProgress(0.09);
    await expect(page.getByRole('region', { name: '제휴 PG사' })).toBeInViewport();
    await expect.poll(() => product.evaluate((el) => Number(getComputedStyle(el).opacity))).toBeGreaterThan(0.4);
    await expect.poll(() => product.evaluate((el) => Number(getComputedStyle(el).opacity))).toBeLessThan(0.6);
    for (const progress of [0.13, 0.8]) {
      await scrollToProgress(progress);
      await expect(product).toHaveCSS('opacity', '1');
    }
    await scrollToProgress(0);
    await expect(product).toHaveCSS('opacity', '0');
    await expect(page.getByRole('region', { name: '제휴 PG사' })).toBeVisible();
  });

  for (const [width, height] of [[390, 844], [1440, 900], [768, 320]]) {
    for (const theme of ['light', 'dark']) {
      test(`preserves the logo lane throughout scrolling at ${width}x${height} in ${theme}`, async ({ page }) => {
        await page.setViewportSize({ width, height });
        await page.goto('/');
        await page.evaluate((value) => document.documentElement.classList.toggle('dark', value === 'dark'), theme);
        const hero = page.getByRole('region', { name: '서비스 소개', exact: true });
        const partners = page.getByRole('region', { name: '제휴 PG사' });
        const product = hero.locator('.origin-top');
        const scene = hero.locator(':scope > div');
        const overflow = Math.max(0, (await scene.boundingBox())!.height - height);
        // A short viewport must scroll through the natural copy height before pinning.
        await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), overflow);
        await expect(product).toHaveCSS('opacity', '0');
        for (const progress of [0, 0.04, 0.09, 0.3, 0.69, 0.71, 0.85, 1, 0.3, 0]) {
          await hero.evaluate((el, { progress, overflow }) => {
            const start = el.getBoundingClientRect().top + window.scrollY + overflow;
            window.scrollTo({ top: start + (el.getBoundingClientRect().height - window.innerHeight - overflow) * progress, behavior: 'instant' });
          }, { progress, overflow });
          await expect(partners).toBeInViewport({ ratio: 0.99 });
          await expect(partners).toBeVisible();
          await expect(partners.locator('[data-partner-track]')).toHaveCSS('animation-play-state', 'running');
          const expectedColor = await partners.evaluate((el, dark) => {
            const probe = document.createElement('span');
            probe.style.color = `var(--md-sys-color-${dark ? 'inverse-on-surface' : 'on-surface'})`;
            el.append(probe);
            const color = getComputedStyle(probe).color;
            probe.remove();
            return color;
          }, progress < 0.7);
          await expect(partners).toHaveCSS('color', expectedColor);
          // The clipping viewport, not just the final transformed window, must
          // stop above the transparent strip during the entire entrance.
          const lane = (await product.locator('..').boundingBox())!;
          const strip = (await partners.boundingBox())!;
          expect(strip.y - lane.y - lane.height).toBeGreaterThanOrEqual(width >= 768 ? 23 : 15);
          await expect(product.locator('..')).toHaveCSS('overflow', 'hidden');
          expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        }
        await hero.evaluate((el) => window.scrollTo({ top: el.getBoundingClientRect().bottom + window.scrollY + 1, behavior: 'instant' }));
        await expect(partners).not.toBeInViewport();
        await expect(partners.locator('[data-partner-track]')).toHaveCSS('animation-play-state', 'paused');
      });
    }
  }

  for (const theme of ['light', 'dark']) {
    test(`keeps the strip transparent and reveals only the hovered brand in ${theme} theme`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto('/');
      await page.evaluate((value) => document.documentElement.classList.toggle('dark', value === 'dark'), theme);
      const partners = page.getByRole('region', { name: '제휴 PG사' });
      await expect(partners).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(partners.getByRole('heading')).toHaveCount(0);
      // Stop at a gap first so the first complete group is stable for hovering.
      await partners.hover({ position: { x: 400, y: 8 } });
      const logos = partners.locator('[data-partner-logo]');
      for (const index of [1, 2, 3]) {
        const logo = logos.nth(index);
        const mono = logo.locator('[data-partner-mono]');
        const color = logo.locator('[data-partner-color]');
        await expect(mono).toHaveCSS('opacity', '0.8');
        await expect(color).toHaveCSS('opacity', '0');
        await logo.hover();
        await expect(mono).toHaveCSS('opacity', '0');
        await expect(color).toHaveCSS('opacity', '1');
        await expect(color).toHaveCSS('transition-duration', '0.16s');
        await expect(logos.nth(index + 1).locator('[data-partner-color]')).toHaveCSS('opacity', '0');
        await partners.hover({ position: { x: 400, y: 8 } });
        await expect(mono).toHaveCSS('opacity', '0.8');
        await expect(color).toHaveCSS('opacity', '0');
        await expect(color).toHaveCSS('transition-duration', '0.22s');
      }
      await expect(partners.getByRole('img')).toHaveCount(3);
    });
  }

  test('keeps logos monochrome after touch input', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    await page.goto('/');
    const logo = page.getByRole('region', { name: '제휴 PG사' }).locator('[data-partner-logo]').nth(1);
    // The marquee intentionally keeps moving on touch devices; waiting for
    // a stable bounding box would wait for an animation that never stops.
    await logo.tap({ force: true });
    await expect(logo.locator('[data-partner-mono]')).toHaveCSS('opacity', '0.8');
    await expect(logo.locator('[data-partner-color]')).toHaveCSS('opacity', '0');
    await expect(page.locator('[data-partner-track]')).toHaveCSS('animation-play-state', 'running');
    await context.close();
  });
});
