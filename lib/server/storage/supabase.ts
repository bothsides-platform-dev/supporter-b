import { createClient } from '@supabase/supabase-js';
import type { ReadRange, Storage } from './local';

const BUCKET = 'attachments';

export class SupabaseStorage implements Storage {
  private sb = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  async save(key: string, buffer: Buffer, mime: string): Promise<void> {
    const { error } = await this.sb.storage
      .from(BUCKET)
      .upload(key, buffer, { contentType: mime, upsert: true });
    if (error) throw error;
  }

  async read(
    key: string,
    range?: ReadRange,
  ): Promise<{ stream: ReadableStream<Uint8Array>; size: number }> {
    // v0: Supabase JS download doesn't expose Range — fetch the whole blob,
    // slice in memory, and report the total size for Content-Range. Heavy
    // for large files; v1 should swap to a signed-URL passthrough with
    // proper Range support.
    const { data, error } = await this.sb.storage.from(BUCKET).download(key);
    if (error) throw error;
    const buf = await data!.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const total = bytes.byteLength;
    const slice =
      range && (range.start !== undefined || range.end !== undefined)
        ? bytes.slice(
            range.start ?? 0,
            range.end === undefined ? total : range.end + 1,
          )
        : bytes;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(slice);
        controller.close();
      },
    });
    return { stream, size: total };
  }

  async delete(key: string): Promise<void> {
    const { error } = await this.sb.storage.from(BUCKET).remove([key]);
    if (error) throw error;
  }
}
