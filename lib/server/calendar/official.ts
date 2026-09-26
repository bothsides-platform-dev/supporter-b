export type OfficialHoliday = { date: string; name: string };

function tag(xml: string, name: string): string | null {
  return xml.match(new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`))?.[1]?.trim() ?? null;
}

function parsePage(xml: string, year: number, month: number, requestedPage: number) {
  if (!xml.startsWith('<?xml') && !xml.trimStart().startsWith('<response>')) throw new Error('HOLIDAY_API_INVALID');
  const header = tag(xml, 'header');
  const body = tag(xml, 'body');
  if (!header || !body || tag(header, 'resultCode') !== '00' || !tag(header, 'resultMsg')) throw new Error('HOLIDAY_API_INVALID');
  const rawTotal = tag(body, 'totalCount');
  const rawPerPage = tag(body, 'numOfRows');
  const rawPageNo = tag(body, 'pageNo');
  const itemBlock = tag(body, 'items');
  if (rawTotal === null || rawPerPage === null || rawPageNo === null ||
    (itemBlock === null && !/<items\s*\/>/.test(body)))
    throw new Error('HOLIDAY_API_INVALID');
  const total = Number(rawTotal);
  const perPage = Number(rawPerPage);
  const pageNo = Number(rawPageNo);
  if (!Number.isSafeInteger(total) || total < 0 || !Number.isSafeInteger(perPage) || perPage < 1 || pageNo !== requestedPage)
    throw new Error('HOLIDAY_API_INVALID');
  if (itemBlock !== null && itemBlock.replace(/<item>[\s\S]*?<\/item>/g, '').trim())
    throw new Error('HOLIDAY_API_INVALID');
  const items = [...(itemBlock ?? '').matchAll(/<item>([\s\S]*?)<\/item>/g)].map((match) => {
    const part = match[1];
    const raw = tag(part, 'locdate');
    const holiday = tag(part, 'isHoliday');
    const name = tag(part, 'dateName');
    const seq = tag(part, 'seq');
    const dateKind = tag(part, 'dateKind');
    if (!raw || !/^\d{8}$/.test(raw) || !name || !seq || !/^\d{2}$/.test(dateKind ?? '') ||
      !['Y', 'N'].includes(holiday ?? '')) throw new Error('HOLIDAY_API_INVALID');
    const date = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
    if (date.slice(0, 7) !== `${year}-${String(month).padStart(2, '0')}` ||
      !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) ||
      new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date)
      throw new Error('HOLIDAY_API_INVALID');
    return { date, name: name.replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>'), holiday, seq };
  });
  if (items.length > perPage || (total === 0 && items.length !== 0) || (total > 0 && items.length === 0)) throw new Error('HOLIDAY_API_INVALID');
  return { total, perPage, items };
}

async function readBounded(response: Response): Promise<string> {
  if (!response.body) throw new Error('HOLIDAY_API_INVALID');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    size += next.value.length;
    if (size > 200_000) {
      await reader.cancel().catch(() => {});
      throw new Error('HOLIDAY_API_INVALID');
    }
    chunks.push(next.value);
  }
  const combined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(combined);
}

async function requestPage(url: string, fetcher: (url: string, init?: RequestInit) => Promise<Response>, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetcher(url, { signal: controller.signal });
        if (!response.ok) throw new Error('HOLIDAY_API_UNAVAILABLE');
        return readBounded(response);
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error('HOLIDAY_API_UNAVAILABLE')); }, timeoutMs);
      }),
    ]);
  } catch (error) {
    if (error instanceof Error && error.message === 'HOLIDAY_API_INVALID') throw error;
    throw new Error('HOLIDAY_API_UNAVAILABLE');
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function fetchOfficialYear(
  year: number,
  key: string,
  fetcher: (url: string, init?: RequestInit) => Promise<Response> = fetch,
  timeoutMs = 10_000,
  totalTimeoutMs = 120_000,
): Promise<OfficialHoliday[]> {
  const deadlineAt = Date.now() + totalTimeoutMs;
  const found: OfficialHoliday[] = [];
  for (let month = 1; month <= 12; month++) {
    let pageNo = 1;
    let loaded = 0;
    let total = 0;
    let perPage = 0;
    const identities = new Set<string>();
    do {
      const url = new URL('https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo');
      url.searchParams.set('ServiceKey', key);
      url.searchParams.set('solYear', String(year));
      url.searchParams.set('solMonth', String(month).padStart(2, '0'));
      url.searchParams.set('numOfRows', '100');
      url.searchParams.set('pageNo', String(pageNo));
      const remainingMs = deadlineAt - Date.now();
      if (remainingMs <= 0) throw new Error('HOLIDAY_API_UNAVAILABLE');
      const parsed = parsePage(await requestPage(url.toString(), fetcher, Math.min(timeoutMs, remainingMs)), year, month, pageNo);
      if (pageNo > 1 && (parsed.total !== total || parsed.perPage !== perPage)) throw new Error('HOLIDAY_API_INVALID');
      total = parsed.total;
      perPage = parsed.perPage;
      loaded += parsed.items.length;
      if (loaded > total) throw new Error('HOLIDAY_API_INVALID');
      for (const item of parsed.items) {
        const identity = `${item.date}:${item.seq}`;
        if (identities.has(identity)) throw new Error('HOLIDAY_API_INVALID');
        identities.add(identity);
      }
      found.push(...parsed.items.filter((item) => item.holiday === 'Y').map(({ date, name }) => ({ date, name })));
      if (loaded < total && parsed.items.length !== parsed.perPage) throw new Error('HOLIDAY_API_INVALID');
      pageNo++;
      if (pageNo > 100) throw new Error('HOLIDAY_API_INVALID');
    } while (loaded < total);
  }
  if (Date.now() >= deadlineAt) throw new Error('HOLIDAY_API_UNAVAILABLE');
  if (found.length === 0) throw new Error('HOLIDAY_API_INVALID');
  return found;
}
