import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { Agent } from 'undici';
import type { PublicPage } from './extraction';

const blocked = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blocked.addSubnet(address, prefix, 'ipv4');
for (const [address, prefix] of [['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20]] as const)
  blocked.addSubnet(address, prefix, 'ipv6');
const global6 = new BlockList();
global6.addSubnet('2000::', 3, 'ipv6');
function publicAddress(address: string) {
  const family = isIP(address);
  return family === 4 ? !blocked.check(address, 'ipv4')
    : family === 6 && global6.check(address, 'ipv6') && !blocked.check(address, 'ipv6');
}
export async function withinSignal<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  let stop: () => void = () => {};
  const canceled = new Promise<never>((_, reject) => {
    stop = () => reject(new Error('TIMEOUT'));
    signal.addEventListener('abort', stop, { once: true });
  });
  try { return await Promise.race([work, canceled]); }
  finally { signal.removeEventListener('abort', stop); }
}
type Network = {
  resolve: (host: string) => Promise<{ address: string; family: number }[]>;
  request: (url: string | URL, init?: RequestInit & { dispatcher?: Agent }) => Promise<Response>;
};
export async function collectPublicWebsite(raw: string, network: Network = {
  resolve: host => lookup(host, { all: true, verbatim: true }), request: fetch,
}): Promise<PublicPage[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  const signal = controller.signal;
  const pages: PublicPage[] = [];
  try {
    const root = new URL(raw);
    const checked = (url: URL) => {
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port
        || url.hostname !== root.hostname) throw new Error('UNSAFE_URL');
      url.hash = '';
      return url;
    };
    const queue = [checked(root).href];
    const visited = new Set<string>();
    while (queue.length && visited.size < 3 && !signal.aborted) {
      let url = checked(new URL(queue.shift()!));
      if (visited.has(url.href)) continue;
      visited.add(url.href);
      try {
        for (let redirect = 0; redirect <= 3; redirect++) {
          signal.throwIfAborted();
          const host = url.hostname.replace(/^\[|\]$/g, '');
          const addresses = isIP(host) ? [{ address: host, family: isIP(host) }]
            : await withinSignal(network.resolve(host), signal);
          if (!addresses.length || addresses.some(a => !publicAddress(a.address))) throw new Error('UNSAFE_ADDRESS');
          const pinned = addresses[0];
          const agent = new Agent({ connect: { lookup: (_host, options, callback) => {
            if (options.all) callback(null, [pinned]);
            else callback(null, pinned.address, pinned.family);
          } } });
          try {
            const response = await withinSignal(network.request(url, {
              method: 'GET', redirect: 'manual', cache: 'no-store', credentials: 'omit', signal, dispatcher: agent,
              headers: { Accept: 'text/html', 'User-Agent': 'SupportB-Quote/1.0' },
            }), signal);
            if ([301, 302, 303, 307, 308].includes(response.status)) {
              void response.body?.cancel().catch(() => {});
              url = checked(new URL(response.headers.get('location') ?? '', url));
              if (redirect === 3) throw new Error('REDIRECT_LIMIT');
              continue;
            }
            if (!response.ok || !response.headers.get('content-type')?.toLowerCase().startsWith('text/html')
              || Number(response.headers.get('content-length') ?? 0) > 262144) {
              void response.body?.cancel().catch(() => {});
              break;
            }
            const reader = response.body?.getReader();
            if (!reader) break;
            const chunks: Uint8Array[] = [];
            let size = 0;
            try {
              for (;;) {
                const chunk = await withinSignal(reader.read(), signal);
                if (chunk.done) break;
                size += chunk.value.byteLength;
                if (size > 262144) throw new Error('BODY_TOO_LARGE');
                chunks.push(chunk.value);
              }
            } finally { void reader.cancel().catch(() => {}); }
            const html = Buffer.concat(chunks).toString('utf8');
            pages.push({ url: url.href, html });
            for (const link of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["']/gi)) {
              if (queue.length >= 3) break;
              try {
                const target = checked(new URL(link[1].replace(/&amp;/g, '&'), url));
                if (!visited.has(target.href) && !queue.includes(target.href)) queue.push(target.href);
              } catch { /* Off-host and unsafe links are not crawl targets. */ }
            }
            break;
          } finally { void agent.destroy().catch(() => {}); }
        }
      } catch { /* A failed page never discards earlier pages. */ }
    }
  } catch { /* Invalid input or DNS timeout leaves manual entry available. */ }
  finally { clearTimeout(timer); controller.abort(); }
  return pages;
}

