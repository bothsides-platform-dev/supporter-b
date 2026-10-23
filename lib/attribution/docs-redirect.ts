import { DOCS_PARAMS } from './docs-contract';

export const DOCS_QUERY_HEADER = 'x-sb-docs-query';
const FORWARDED = [...DOCS_PARAMS, 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

/** Carry only acquisition metadata across server redirects, never arbitrary form/query data. */
export function docsRedirectQuery(search: string): string {
  const params = new URLSearchParams(search);
  if (params.getAll('sb_via').length !== 1 || params.get('sb_via') !== 'docs') return '';
  const forwarded = new URLSearchParams();
  for (const key of FORWARDED) for (const value of params.getAll(key)) {
    if (value.length <= 500) forwarded.append(key, value);
  }
  return forwarded.toString();
}

export function withDocsAttribution(target: string, search: string): string {
  const query = docsRedirectQuery(search);
  if (!query) return target;
  const url = new URL(target, 'https://support-b.com');
  for (const [key, value] of new URLSearchParams(query)) url.searchParams.append(key, value);
  return target.startsWith('/') ? url.pathname + url.search + url.hash : url.href;
}

export function docsRequestHeaders(incoming: Headers, search: string): Headers {
  const headers = new Headers(incoming);
  headers.delete(DOCS_QUERY_HEADER);
  const query = docsRedirectQuery(search);
  if (query) headers.set(DOCS_QUERY_HEADER, query);
  return headers;
}
