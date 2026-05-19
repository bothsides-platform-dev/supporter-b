// truncateAttachmentsBucket — recursive list + remove against the Supabase
// `attachments` bucket. Replaces the old fs rm/mkdir on `./uploads-e2e`; the
// invariant the e2e suite relies on is the same: before any spec runs, the
// bucket holds no artifacts from prior runs.
import { describe, it, expect, vi } from 'vitest';

import { truncateAttachmentsBucket } from '../test-db-reset';

type FileEntry = { name: string; id: string };
type FolderEntry = { name: string; id: null };

function makeMockClient(layout: Record<string, (FileEntry | FolderEntry)[]>) {
  const remove = vi.fn().mockResolvedValue({ data: [], error: null });
  const list = vi.fn().mockImplementation(async (prefix: string) => {
    return { data: layout[prefix] ?? [], error: null };
  });
  return {
    storage: { from: vi.fn().mockReturnValue({ list, remove }) },
    _spies: { list, remove },
  };
}

describe('truncateAttachmentsBucket', () => {
  it('removes every file under nested year/month folders', async () => {
    // attachments/
    //   2026/
    //     05/  → a.pdf, b.jpg
    //     06/  → c.png
    //   2027/
    //     01/  → d.pdf
    const client = makeMockClient({
      '': [
        { name: '2026', id: null },
        { name: '2027', id: null },
      ],
      '2026': [
        { name: '05', id: null },
        { name: '06', id: null },
      ],
      '2026/05': [
        { name: 'a.pdf', id: 'id-a' },
        { name: 'b.jpg', id: 'id-b' },
      ],
      '2026/06': [{ name: 'c.png', id: 'id-c' }],
      '2027': [{ name: '01', id: null }],
      '2027/01': [{ name: 'd.pdf', id: 'id-d' }],
    });

    await truncateAttachmentsBucket(
      client as unknown as Parameters<typeof truncateAttachmentsBucket>[0],
    );

    // Every leaf file was removed (single remove call with all keys is fine,
    // or multiple calls — either is acceptable).
    const removedKeys = client._spies.remove.mock.calls.flatMap(
      (c) => c[0] as string[],
    );
    expect(new Set(removedKeys)).toEqual(
      new Set(['2026/05/a.pdf', '2026/05/b.jpg', '2026/06/c.png', '2027/01/d.pdf']),
    );
  });

  it('is a no-op when the bucket is empty', async () => {
    const client = makeMockClient({ '': [] });
    await truncateAttachmentsBucket(
      client as unknown as Parameters<typeof truncateAttachmentsBucket>[0],
    );
    expect(client._spies.remove).not.toHaveBeenCalled();
  });

  it('targets the attachments bucket', async () => {
    const client = makeMockClient({ '': [] });
    await truncateAttachmentsBucket(
      client as unknown as Parameters<typeof truncateAttachmentsBucket>[0],
    );
    expect(client.storage.from).toHaveBeenCalledWith('attachments');
  });
});
