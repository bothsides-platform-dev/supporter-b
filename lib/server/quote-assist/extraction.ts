import type { PublicIndustry } from '@/lib/types/pg-recommendation';
import { industryNameKey } from '@/lib/rfp/industry-selection';
import type { Suggestion } from '@/lib/guest-rfp/suggestions';
export type PublicPage = { url: string; html: string };
export function pageText(html: string) {
  return html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim().slice(0, 12000);
}
export function extractWebsiteSuggestions(pages: PublicPage[], groups: readonly PublicIndustry[]): Suggestion[] {
  const found = new Map<Suggestion['field'], Suggestion>();
  for (const page of pages) {
    const add = (suggestion: Suggestion) => { if (!found.has(suggestion.field)) found.set(suggestion.field, suggestion); };
    const source = { source: 'rules' as const, sourceUrl: page.url };
    const visit = (value: unknown, depth = 0) => {
      if (depth > 12 || !value || typeof value !== 'object') return;
      if (Array.isArray(value)) { value.slice(0, 100).forEach(v => visit(v, depth + 1)); return; }
      const row = value as Record<string, unknown>;
      if (row['@type'] === 'Product' || row['@type'] === 'Service') {
        if (typeof row.name === 'string' && row.name.trim())
          add({ ...source, field: 'mainProducts', value: row.name.trim().slice(0, 200), evidence: row.name.slice(0, 500) });
        if (typeof row.category === 'string') {
          const matches = groups.filter(g => industryNameKey(g.name) === industryNameKey(row.category as string));
          if (matches.length === 1) add({ ...source, field: 'industryGroupId', value: matches[0].id, evidence: row.category.slice(0, 500) });
        }
      }
      if (row['@graph']) visit(row['@graph'], depth + 1);
      if (row.itemListElement) visit(row.itemListElement, depth + 1);
      if (row.item) visit(row.item, depth + 1);
    };
    for (const match of page.html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)) {
      try { visit(JSON.parse(match[1])); } catch { /* Invalid structured data is not evidence. */ }
    }
    const meta = new Map<string, string>();
    for (const match of page.html.matchAll(/<meta\b[^>]*>/gi)) {
      const attrs = new Map([...match[0].matchAll(/([a-z:-]+)\s*=\s*(["'])(.*?)\2/gi)].map(a => [a[1].toLowerCase(), a[3]]));
      const name = attrs.get('property') ?? attrs.get('name');
      if (name && attrs.has('content')) meta.set(name.toLowerCase(), attrs.get('content')!);
    }
    if (/^(?:og:)?product$/i.test(meta.get('og:type') ?? '') && meta.get('og:title')?.trim()) {
      const name = pageText(meta.get('og:title')!).slice(0, 200);
      if (name) add({ ...source, field: 'mainProducts', value: name, evidence: name });
    }
    const solutions = [
      ['cafe24', /https?:\/\/(?:[a-z0-9-]+\.)*cafe24\.com[/"']/i],
      ['imweb', /https?:\/\/(?:[a-z0-9-]+\.)*imweb\.me[/"']/i],
      ['makeshop', /https?:\/\/(?:[a-z0-9-]+\.)*makeshop\.co\.kr[/"']/i],
      ['godo', /https?:\/\/(?:[a-z0-9-]+\.)*godomall\.com[/"']/i],
    ] as const;
    for (const [value, pattern] of solutions) {
      const assets = page.html.match(/<(?:script|link|img)\b[^>]*>/gi)?.join(' ') ?? '';
      const match = assets.match(pattern);
      if (match) { add({ ...source, field: 'currentSolution', value, evidence: match[0] }); break; }
    }
  }
  return [...found.values()];
}

