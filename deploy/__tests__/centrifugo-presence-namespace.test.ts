import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Drift guard for the presence namespace. Centrifugo v6 DENIES client subscribe
// AND publish by default (103). Without allow_subscribe_for_client every dot is
// silently dead; without allow_publish_for_subscriber the M2 activity layer (and
// chat typing) can't publish. presence_ttl is NOT a v6 key — if present it is a
// silently-ignored "unknown key" (the 2026-06-20 footgun class). Static assert
// only; real behavior is covered by the integration smoke test.
const config = readFileSync(
  fileURLToPath(new URL('../centrifugo/config.yaml', import.meta.url)),
  'utf8',
);

describe('Centrifugo presence namespace (v6)', () => {
  it('declares a presence namespace', () => {
    expect(config).toMatch(/^\s*-\s*name:\s*presence\s*$/m);
  });
  it('enables presence + join_leave + force_push_join_leave', () => {
    expect(config).toMatch(/^\s*presence:\s*true\s*$/m);
    expect(config).toMatch(/^\s*join_leave:\s*true\s*$/m);
    expect(config).toMatch(/^\s*force_push_join_leave:\s*true\s*$/m);
  });
  it('opens client subscribe + publish for the public presence model', () => {
    expect(config).toMatch(/^\s*allow_subscribe_for_client:\s*true\s*$/m);
    expect(config).toMatch(/^\s*allow_publish_for_subscriber:\s*true\s*$/m);
  });
  it('keeps a last-state for late-observer activity recovery', () => {
    expect(config).toMatch(/^\s*history_size:\s*1\s*$/m);
    expect(config).toMatch(/^\s*history_ttl:/m);
  });
  it('does NOT use the phantom presence_ttl key (v6 unknown-key footgun)', () => {
    expect(config).not.toMatch(/^\s*presence_ttl\s*:/m);
  });
  it('does NOT route presence subscribes through the ACL proxy (public)', () => {
    // presence block must not enable subscribe_proxy (no relationship ACL, D1).
    const presenceBlock = config.slice(config.indexOf('name: presence'));
    const nextNs = presenceBlock.indexOf('- name:', 5);
    const block = nextNs > -1 ? presenceBlock.slice(0, nextNs) : presenceBlock;
    expect(block).not.toMatch(/subscribe_proxy_enabled:\s*true/);
  });
  it('fixes chat typing: chat namespace allows client publish', () => {
    const chatBlock = config.slice(config.indexOf('name: chat'));
    const nextNs = chatBlock.indexOf('- name:', 5);
    const block = nextNs > -1 ? chatBlock.slice(0, nextNs) : chatBlock;
    expect(block).toMatch(/allow_publish_for_subscriber:\s*true/);
  });
});
