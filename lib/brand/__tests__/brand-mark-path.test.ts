import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { BRAND_MARK_PATH } from '@/lib/brand/brand-mark-path';

describe('app/icon.svg drift guard', () => {
  it('inline path d attribute matches BRAND_MARK_PATH exactly', () => {
    const svg = fs.readFileSync(path.join(process.cwd(), 'app', 'icon.svg'), 'utf-8');
    const matches = [...svg.matchAll(/<path[^>]*\sd="([^"]*)"/g)];
    expect(matches.length).toBe(1);
    const [, d] = matches[0];
    expect(d).toBe(BRAND_MARK_PATH);
  });
});
