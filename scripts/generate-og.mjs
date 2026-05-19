/**
 * Generates app/opengraph-image.png using a headless Chromium screenshot.
 * Run: node scripts/generate-og.mjs
 */

import { chromium } from 'playwright';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const fontPath = path.join(ROOT, 'public/fonts/PretendardVariable.woff2');
const fontBase64 = (await readFile(fontPath)).toString('base64');

const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  @font-face {
    font-family: 'Pretendard';
    src: url('data:font/woff2;base64,${fontBase64}') format('woff2');
    font-weight: 100 900;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1200px;
    height: 630px;
    background: #faf7f0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 80px;
    font-family: 'Pretendard', sans-serif;
    overflow: hidden;
  }
  .icon {
    position: relative;
    width: 280px;
    height: 280px;
    flex-shrink: 0;
  }
  .bar {
    position: absolute;
    left: 48px;
    top: 44px;
    width: 39px;
    height: 193px;
    background: #0a0a0f;
    border-radius: 20px;
  }
  .circle {
    position: absolute;
    left: 105px;
    top: 61px;
    width: 158px;
    height: 158px;
    background: #0a0a0f;
    border-radius: 50%;
  }
  .gap {
    position: absolute;
    left: 88px;
    top: 0;
    width: 26px;
    height: 280px;
    background: #faf7f0;
  }
  .wordmark {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .name {
    font-weight: 800;
    font-size: 140px;
    color: #0a0a0f;
    letter-spacing: -4px;
    line-height: 0.85;
  }
  .sub {
    font-weight: 400;
    font-size: 22px;
    color: #8c8690;
    letter-spacing: 0.04em;
  }
</style>
</head>
<body>
  <div class="icon">
    <div class="bar"></div>
    <div class="circle"></div>
    <div class="gap"></div>
  </div>
  <div class="wordmark">
    <span class="name">Support B</span>
    <span class="sub">결제대행사 비공개 RFP 플랫폼</span>
  </div>
</body>
</html>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 1200, height: 630 });
await page.setContent(html, { waitUntil: 'networkidle' });
// Wait for font to render
await page.waitForTimeout(500);

const screenshot = await page.screenshot({ type: 'png' });
await browser.close();

const outPath = path.join(ROOT, 'app/opengraph-image.png');
await writeFile(outPath, screenshot);
console.log(`Generated: ${outPath} (${(screenshot.length / 1024).toFixed(0)} KB)`);
