import { describe, it, expect } from 'vitest';
import { InMemoryStorage } from '@/lib/server/storage/memory';
import { sha256Hex } from '@/lib/server/contracts/hash';
import { verifyStoredPdf } from '@/lib/server/contracts/verify';

const KEY = 'contracts/base/C-2607-0001.pdf';
const MIME = 'application/pdf';

describe('verifyStoredPdf', () => {
  it('저장 바이트가 그대로면 intact true + 계산된 해시를 반환한다', async () => {
    const storage = new InMemoryStorage();
    const bytes = Buffer.from('%PDF-1.7 원본 계약 바이트', 'utf8');
    await storage.save(KEY, bytes, MIME);

    const res = await verifyStoredPdf(storage, KEY, sha256Hex(bytes));
    expect(res).toEqual({ intact: true, computed: sha256Hex(bytes) });
  });

  it('바이트가 바뀌면 intact false + 실제 해시를 반환한다 — 변조 탐지', async () => {
    const storage = new InMemoryStorage();
    const original = Buffer.from('%PDF-1.7 원본 계약 바이트', 'utf8');
    await storage.save(KEY, original, MIME);
    const expected = sha256Hex(original);

    // 같은 키를 다른 바이트로 덮어쓴다(변조 시나리오).
    const tampered = Buffer.from('%PDF-1.7 변조된 계약 바이트', 'utf8');
    await storage.save(KEY, tampered, MIME);

    const res = await verifyStoredPdf(storage, KEY, expected);
    expect(res.intact).toBe(false);
    // 실제 해시를 돌려줘야 감사 로그에 "무엇으로 바뀌었는지"를 남길 수 있다.
    expect(res.computed).toBe(sha256Hex(tampered));
    expect(res.computed).not.toBe(expected);
  });

  it('1바이트만 바뀌어도 잡아낸다', async () => {
    const storage = new InMemoryStorage();
    const original = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x01]);
    await storage.save(KEY, original, MIME);
    const expected = sha256Hex(original);
    await storage.save(KEY, Buffer.from([0x25, 0x50, 0x44, 0x46, 0x02]), MIME);

    expect((await verifyStoredPdf(storage, KEY, expected)).intact).toBe(false);
  });

  it('여러 청크로 나뉜 스트림도 전체를 이어붙여 해시한다', async () => {
    // 실제 R2 스트림은 청크로 쪼개져 온다. 첫 청크만 읽고 해시하면 조용히 틀린다.
    const storage = new InMemoryStorage();
    const big = Buffer.alloc(300_000, 0xab);
    await storage.save(KEY, big, MIME);

    const res = await verifyStoredPdf(storage, KEY, sha256Hex(big));
    expect(res).toEqual({ intact: true, computed: sha256Hex(big) });
  });

  it('객체가 없으면 ENOENT 를 그대로 던진다 — 부재와 변조는 다른 사건이다', async () => {
    const storage = new InMemoryStorage();
    await expect(verifyStoredPdf(storage, 'contracts/missing.pdf', 'deadbeef')).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
});
