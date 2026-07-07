import type { SeoHostContext } from '@/lib/seo/host';
import { BRAND_ALIASES } from '@/lib/site-config';
import {
  PRODUCT_NAME,
  audienceFacts,
  type AudienceFacts,
  type SeoLink,
} from '@/lib/seo/product-facts';

export const TEXT_PLAIN_HEADERS = {
  'Content-Type': 'text/plain; charset=utf-8',
  'Cache-Control': 'public, max-age=3600, s-maxage=3600',
  'Vary': 'Host',
} as const satisfies Record<string, string>;

/** Join a relative path or in-page anchor to the host origin. */
function abs(origin: string, path: string): string {
  return `${origin}${path}`;
}

function renderLink(origin: string, link: SeoLink): string {
  const url = abs(origin, link.path);
  return link.desc ? `- [${link.title}](${url}): ${link.desc}` : `- [${link.title}](${url})`;
}

function pushPreamble(lines: string[], f: AudienceFacts, fullFormat: boolean): void {
  const aliasList = BRAND_ALIASES.map((a) => `'${a}'`).join(', ');

  lines.push(`# ${PRODUCT_NAME}`, '');
  lines.push(`> ${f.summary}`, '');
  lines.push(
    `${PRODUCT_NAME}는 ${aliasList}로도 표기·검색됩니다. 공식 표기는 '${PRODUCT_NAME}'입니다.`,
    '',
  );
  lines.push(f.intro, '');

  lines.push(...(fullFormat ? ['## 핵심 정보', ''] : ['## 핵심 정보']));
  for (const fact of f.facts) lines.push(`- ${fact}`);
  lines.push('');

  if (f.metrics?.length) {
    lines.push(...(fullFormat ? ['## 검증 지표', ''] : ['## 검증 지표']));
    for (const m of f.metrics) {
      lines.push(fullFormat ? `- **${m.value}** — ${m.caption}` : `- ${m.value} — ${m.caption}`);
    }
    lines.push('');
  }
}

/**
 * Curated `/llms.txt` — fact-rich (the chosen style) yet spec-shaped:
 * H1 → blockquote summary → prose facts → link sections → `## Optional`.
 */
export function buildLlmsTxt(ctx: SeoHostContext): string {
  const { origin } = ctx;
  const f: AudienceFacts = audienceFacts(ctx.type);
  const lines: string[] = [];

  pushPreamble(lines, f, false);

  lines.push(`## ${f.highlightsTitle}`);
  for (const h of f.highlights) lines.push(`- ${h.title}: ${h.desc}`);
  lines.push('');

  lines.push('## 이용 절차');
  for (const s of f.process) lines.push(`- ${s.step} ${s.title}: ${s.body}`);
  lines.push('');

  lines.push('## 주요 링크');
  for (const link of f.links) lines.push(renderLink(origin, link));
  lines.push('');

  lines.push('## Optional');
  lines.push(
    `- [전체 내용 (llms-full.txt)](${origin}/llms-full.txt): 모든 섹션 본문과 FAQ 전문`,
  );
  lines.push(`- [robots.txt](${origin}/robots.txt)`);
  lines.push(`- [sitemap.xml](${origin}/sitemap.xml)`);
  lines.push('');

  return lines.join('\n');
}

/**
 * `/llms-full.txt` — the full markdown export (satisfies the ".md variant"
 * goal as a single artifact). Embeds the canonical FAQ verbatim.
 */
export function buildLlmsFullTxt(ctx: SeoHostContext): string {
  const { origin } = ctx;
  const f: AudienceFacts = audienceFacts(ctx.type);
  const lines: string[] = [];

  pushPreamble(lines, f, true);

  lines.push(`## ${f.highlightsTitle}`, '');
  for (const h of f.highlights) lines.push(`### ${h.title}`, '', h.desc, '');

  lines.push('## 이용 절차', '');
  for (const s of f.process) lines.push(`### ${s.step}. ${s.title}`, '', s.body, '');

  lines.push('## 자주 묻는 질문', '');
  for (const item of f.faq) lines.push(`### ${item.q}`, '', item.a, '');

  lines.push('## 주요 링크', '');
  for (const link of f.links) lines.push(renderLink(origin, link));
  lines.push('');

  return lines.join('\n');
}
