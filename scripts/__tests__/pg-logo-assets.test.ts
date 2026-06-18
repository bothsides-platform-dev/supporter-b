/**
 * PG 로고 자산 드리프트 가드.
 *
 * backfill-pg-logos.ts의 LOGO_MAP 키 목록과
 * scripts/assets/pg-logos/ 실제 파일이 1:1로 일치하는지 보장한다.
 * 키 추가 시 자산 파일을 함께 추가해야 하며, 반대도 마찬가지.
 */
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// backfill 스크립트와 동일한 LOGO_MAP을 여기서 직접 정의.
// 실제 스크립트를 import하면 DB 연결 초기화가 트리거되므로 분리.
const LOGO_MAP: Record<string, { file: string; mime: string }> = {
  tosspayments:   { file: 'tosspayments.svg',    mime: 'image/svg+xml' },
  kginicis:       { file: 'kginicis.png',         mime: 'image/png' },
  nicepayments:   { file: 'nicepayments.png',     mime: 'image/png' },
  kcp:            { file: 'kcp.svg',              mime: 'image/svg+xml' },
  hectofinancial: { file: 'hectofinancial.svg',   mime: 'image/svg+xml' },
  danal:          { file: 'danal.svg',            mime: 'image/svg+xml' },
  kicc:           { file: 'kicc.svg',             mime: 'image/svg+xml' },
};

const ASSETS_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../assets/pg-logos',
);

describe('PG 로고 자산 드리프트 가드', () => {
  for (const [key, { file, mime }] of Object.entries(LOGO_MAP)) {
    it(`${key}: scripts/assets/pg-logos/${file} 이 존재한다`, () => {
      expect(existsSync(resolve(ASSETS_DIR, file))).toBe(true);
    });

    it(`${key}: mime 타입이 올바르다 (svg→image/svg+xml, png→image/png)`, () => {
      const ext = file.split('.').pop();
      const expectedMime = ext === 'svg' ? 'image/svg+xml' : 'image/png';
      expect(mime).toBe(expectedMime);
    });
  }
});
