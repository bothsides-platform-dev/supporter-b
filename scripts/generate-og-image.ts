/**
 * One-shot generator for `app/opengraph-image.png` (1200×630).
 *
 * Renders an HTML page with the project's actual Pretendard Variable font
 * (inlined as a base64 data URI so no dev server is needed) and screenshots
 * it via Playwright Chromium. Korean glyphs are rendered by the same font
 * binary used in production, so what you see in the OG card == what the app
 * uses. Dark Linear theme — solid near-black background, brand mark +
 * wordmark, no gradients/glow/blur.
 *
 * apple-icon.png has its own separate manual pipeline — this script must
 * never write it.
 *
 * Run: `pnpm og:generate` (== `pnpm tsx scripts/generate-og-image.ts`)
 */
import { chromium } from 'playwright';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { BRAND_MARK_PATH } from '../lib/brand/brand-mark-path';

const ROOT = path.resolve(__dirname, '..');
const PRETENDARD = path.join(ROOT, 'public/fonts/PretendardVariable.woff2');

const OUT_OG = path.join(ROOT, 'app/opengraph-image.png');

// Dark-mode Linear tokens (styles/tokens.css .dark block) — hardcoded here
// since this script runs outside the app's CSS pipeline.
const COLOR_BACKGROUND = '#08090A';
const COLOR_ON_SURFACE = '#F7F8F8';
const COLOR_ON_SURFACE_VARIANT = '#8A8F98';
const COLOR_OUTLINE_VARIANT = '#23252A';
const COLOR_PRIMARY = '#9ECAFF';

async function loadFontDataUri(p: string, mime: string) {
  const buf = await fs.readFile(p);
  return `data:${mime};base64,${buf.toString('base64')}`;
}

function brandMarkSvg(size: number, color: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="334 294 636 636" width="${size}" height="${size}">
    <g transform="translate(0 1254) scale(0.1 -0.1)" fill="${color}">
      <path d="${BRAND_MARK_PATH}" stroke="${color}" stroke-width="450" stroke-linejoin="miter" stroke-linecap="butt" />
    </g>
  </svg>`;
}

function ogHtml(pretendard: string) {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<style>
  @font-face {
    font-family: 'Pretendard';
    src: url('${pretendard}') format('woff2-variations');
    font-weight: 45 920;
    font-style: normal;
    font-display: block;
  }
  html, body { margin: 0; padding: 0; }
  body {
    width: 1200px;
    height: 630px;
    background: ${COLOR_BACKGROUND};
    font-family: 'Pretendard', sans-serif;
    color: ${COLOR_ON_SURFACE};
    -webkit-font-smoothing: antialiased;
    text-rendering: geometricPrecision;
    position: relative;
  }
  .frame {
    position: absolute;
    inset: 44px;
    border: 1px solid ${COLOR_OUTLINE_VARIANT};
  }
  .hero {
    position: absolute;
    left: 50%;
    top: 46%;
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }
  .brand-row {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 40px;
  }
  .mark svg {
    display: block;
  }
  .wordmark {
    font-family: 'Pretendard', sans-serif;
    font-weight: 800;
    font-size: 145px;
    line-height: 1;
    letter-spacing: -0.04em;
    color: ${COLOR_ON_SURFACE};
    margin: 0;
    white-space: nowrap;
  }
  .tagline {
    font-family: 'Pretendard', sans-serif;
    font-weight: 600;
    font-size: 38px;
    letter-spacing: -0.02em;
    color: ${COLOR_ON_SURFACE_VARIANT};
    margin: 28px 0 0 4px;
  }
  .domain-row {
    position: absolute;
    left: 96px;
    bottom: 76px;
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .domain-dot {
    width: 9px;
    height: 9px;
    background: ${COLOR_PRIMARY};
    flex-shrink: 0;
  }
  .domain {
    font-family: 'Pretendard', sans-serif;
    font-weight: 500;
    font-size: 26px;
    letter-spacing: -0.01em;
    color: ${COLOR_ON_SURFACE_VARIANT};
  }
</style>
</head>
<body>
  <div class="frame"></div>

  <div class="hero">
    <div class="brand-row">
      <div class="mark">${brandMarkSvg(132, COLOR_ON_SURFACE)}</div>
      <div class="wordmark">서포트비</div>
    </div>
    <div class="tagline">PG사 비교 견적 플랫폼</div>
  </div>

  <div class="domain-row">
    <div class="domain-dot"></div>
    <div class="domain">support-b.com</div>
  </div>
</body>
</html>`;
}

async function shoot({
  html,
  width,
  height,
  out,
}: {
  html: string;
  width: number;
  height: number;
  out: string;
}) {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    // Belt-and-suspenders: a tick for any layout settling.
    await page.waitForTimeout(150);
    await page.screenshot({ path: out, type: 'png', omitBackground: false });
  } finally {
    await browser.close();
  }
}

async function main() {
  const pretendard = await loadFontDataUri(PRETENDARD, 'font/woff2');

  await shoot({
    html: ogHtml(pretendard),
    width: 1200,
    height: 630,
    out: OUT_OG,
  });
  console.log(`OK ${path.relative(ROOT, OUT_OG)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
