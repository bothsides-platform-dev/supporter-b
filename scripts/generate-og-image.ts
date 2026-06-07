/**
 * One-shot generator for `app/opengraph-image.png` (1200×630) and
 * `app/apple-icon.png` (180×180).
 *
 * Renders an HTML page with the project's actual Pretendard Variable +
 * JetBrains Mono fonts (inlined as base64 data URIs so no dev server is
 * needed) and screenshots it via Playwright Chromium. Korean glyphs are
 * rendered by the same font binary used in production, so what you see in
 * the OG card == what the app uses.
 *
 * Run: `pnpm tsx scripts/generate-og-image.ts`
 */
import { chromium } from 'playwright';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const PRETENDARD = path.join(ROOT, 'public/fonts/PretendardVariable.woff2');
const JETBRAINS = path.join(ROOT, 'public/fonts/JetBrainsMonoVariable.ttf');

const OUT_OG = path.join(ROOT, 'app/opengraph-image.png');
const OUT_ICON = path.join(ROOT, 'app/apple-icon.png');

async function loadFontDataUri(p: string, mime: string) {
  const buf = await fs.readFile(p);
  return `data:${mime};base64,${buf.toString('base64')}`;
}

function ogHtml(pretendard: string, jetbrains: string) {
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
  @font-face {
    font-family: 'JetBrainsMono';
    src: url('${jetbrains}') format('truetype-variations');
    font-weight: 100 800;
    font-style: normal;
    font-display: block;
  }
  html, body { margin: 0; padding: 0; }
  body {
    width: 1200px;
    height: 630px;
    background: #faf7f0;
    font-family: 'Pretendard', sans-serif;
    color: #0a0a0f;
    -webkit-font-smoothing: antialiased;
    text-rendering: geometricPrecision;
  }
  .frame {
    position: absolute;
    inset: 48px;
    border: 1px solid #ece5d2;
  }
  .mono {
    font-family: 'JetBrainsMono', monospace;
    font-weight: 400;
    font-size: 18px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #8c8690;
  }
  .corner { position: absolute; }
  .top-left   { top: 84px;    left: 96px; }
  .top-right  { top: 84px;    right: 96px; }
  .bot-right  { bottom: 84px; right: 96px; color: #1a3a52; letter-spacing: 0.16em; }
  .bot-right .b { opacity: 0.5; }

  .hero {
    position: absolute;
    left: 96px;
    top: 50%;
    transform: translateY(-50%);
  }
  .wordmark {
    font-family: 'Pretendard', sans-serif;
    font-weight: 800;
    font-size: 168px;
    line-height: 1;
    letter-spacing: -0.04em;
    color: #0a0a0f;
    margin: 0;
  }
  .subline {
    font-family: 'Pretendard', sans-serif;
    font-weight: 500;
    font-size: 36px;
    letter-spacing: -0.02em;
    color: #5a5560;
    margin: 24px 0 0 4px;
  }
</style>
</head>
<body>
  <div class="frame"></div>

  <div class="hero">
    <div class="wordmark">Supporter B</div>
    <div class="subline">PG사 비교 견적 플랫폼</div>
  </div>

  <div class="corner bot-right mono"><span class="b">[</span>&nbsp;SUPPORTER-B.STORE&nbsp;<span class="b">]</span></div>
</body>
</html>`;
}

function iconHtml(pretendard: string) {
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
    width: 180px;
    height: 180px;
    background: #faf7f0;
    -webkit-font-smoothing: antialiased;
    text-rendering: geometricPrecision;
    position: relative;
  }
  .frame {
    position: absolute;
    inset: 8px;
    border: 1px solid #ece5d2;
  }
  .glyph {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Pretendard', sans-serif;
    font-weight: 800;
    font-size: 132px;
    line-height: 1;
    letter-spacing: -0.04em;
    color: #0a0a0f;
    /* optical centering — descender of "b" pulls the visual center down */
    padding-bottom: 4px;
  }
</style>
</head>
<body>
  <div class="frame"></div>
  <div class="glyph">b</div>
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
  const [pretendard, jetbrains] = await Promise.all([
    loadFontDataUri(PRETENDARD, 'font/woff2'),
    loadFontDataUri(JETBRAINS, 'font/ttf'),
  ]);

  await shoot({
    html: ogHtml(pretendard, jetbrains),
    width: 1200,
    height: 630,
    out: OUT_OG,
  });
  console.log(`✓ ${path.relative(ROOT, OUT_OG)}`);

  await shoot({
    html: iconHtml(pretendard),
    width: 180,
    height: 180,
    out: OUT_ICON,
  });
  console.log(`✓ ${path.relative(ROOT, OUT_ICON)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
