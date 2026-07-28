import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Drift guard for the presence namespace — ACL'd via the subscribe proxy.
//
// The original D1 model was fully public (allow_subscribe_for_client). That
// exposed the observer map as a competitor-set signal (docs/THREAT_MODEL.md
// §2.3, AR-1) and was replaced by the relationship-gated subscribe proxy
// (app/api/centrifugo/subscribe/route.ts, PresenceAccessRepo.canObserve).
// Two load-bearing config facts this guard pins:
//   1. subscribe_proxy_enabled MUST be on — without it the namespace is dark
//      (v6 denies client subscribe by default) or, worse, public again.
//   2. allow_subscribe_for_client MUST be absent — v6 permission evaluation is
//      "first mechanism that grants wins", so leaving it would fallback-grant
//      AFTER a proxy deny and silently reopen the public model.
// allow_publish_for_subscriber stays (M2 activity layer forward-provisioning —
// now bounded to ACL'd subscribers). presence_ttl is NOT a v6 key — if present
// it is a silently-ignored "unknown key" (the 2026-06-20 footgun class). Static
// assert only; verify live dots after a config deploy (deploy order:
// app FIRST, then centrifugo restart — reversed = platform-wide dark dots).
const config = readFileSync(
  fileURLToPath(new URL('../centrifugo/config.yaml', import.meta.url)),
  'utf8',
);

describe('Centrifugo presence namespace (v6)', () => {
  // Extract the presence block once for all assertions to avoid false positives
  // from keys that exist in other namespaces (e.g., chat namespace also has
  // presence/join_leave keys).
  const presenceBlockStart = config.indexOf('- name: presence');
  const presenceBlock = config.slice(presenceBlockStart);
  const nextNsStart = presenceBlock.indexOf('- name:', 5);
  const presenceBlockScoped =
    nextNsStart > -1 ? presenceBlock.slice(0, nextNsStart) : presenceBlock;

  it('declares a presence namespace', () => {
    expect(config).toMatch(/^\s*-\s*name:\s*presence\s*$/m);
  });
  it('enables presence + join_leave + force_push_join_leave', () => {
    expect(presenceBlockScoped).toMatch(/^\s*presence:\s*true\s*$/m);
    expect(presenceBlockScoped).toMatch(/^\s*join_leave:\s*true\s*$/m);
    expect(presenceBlockScoped).toMatch(/^\s*force_push_join_leave:\s*true\s*$/m);
  });
  it('routes presence subscribes through the ACL proxy', () => {
    expect(presenceBlockScoped).toMatch(/^\s*subscribe_proxy_enabled:\s*true\s*$/m);
  });
  it('does NOT leave the public client-subscribe fallback (would bypass the proxy deny)', () => {
    // v6 "first grant wins": allow_subscribe_for_client alongside the proxy
    // would grant AFTER a proxy deny — the public model would silently return.
    expect(presenceBlockScoped).not.toMatch(/^\s*allow_subscribe_for_client\s*:/m);
  });
  it('keeps client publish for subscribers (M2 activity layer, now ACL-bounded)', () => {
    expect(presenceBlockScoped).toMatch(/^\s*allow_publish_for_subscriber:\s*true\s*$/m);
  });
  it('opens client presence() + history() reads (v6 gates these separately)', () => {
    // WorkspacePresenceProvider derives online via sub.presence(); a late observer
    // recovers last activity via sub.history(). v6 denies BOTH (103) without these
    // dedicated allow flags — the presence/history_size feature toggles are NOT enough.
    // This static guard only proves the keys EXIST, not that Centrifugo honors them —
    // verify by eyeballing live presence dots once after a Centrifugo config deploy.
    expect(presenceBlockScoped).toMatch(/^\s*allow_presence_for_subscriber:\s*true\s*$/m);
    expect(presenceBlockScoped).toMatch(/^\s*allow_history_for_subscriber:\s*true\s*$/m);
  });
  it('keeps a last-state for late-observer activity recovery', () => {
    expect(presenceBlockScoped).toMatch(/^\s*history_size:\s*1\s*$/m);
    expect(presenceBlockScoped).toMatch(/^\s*history_ttl:/m);
  });
  it('does NOT use the phantom presence_ttl key (v6 unknown-key footgun)', () => {
    expect(config).not.toMatch(/^\s*presence_ttl\s*:/m);
  });
  it('fixes chat typing: chat namespace allows client publish', () => {
    const chatBlock = config.slice(config.indexOf('name: chat'));
    const nextNs = chatBlock.indexOf('- name:', 5);
    const block = nextNs > -1 ? chatBlock.slice(0, nextNs) : chatBlock;
    expect(block).toMatch(/allow_publish_for_subscriber:\s*true/);
  });
});
