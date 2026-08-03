/**
 * 템플릿 서명칸 좌표 왕복 판정 — 실측 하네스(Q6)의 순수 판정부.
 *
 * 왜 필요한가: 계약서 에디터는 "우리가 찍어 보낸 좌표를 스노우싸인이 그대로 기억한다"는
 * 가정 위에 서 있다. 그 가정이 틀리면 PG 가 배치한 서명칸이 실제 PDF 에서 다른 자리에
 * 찍히는데, 그건 계약서가 나간 뒤에야 드러난다. 문서에는 좌표 정규화 여부가 없고
 * (`docs/SNOWSIGN_API.md` §PDF 템플릿 생성), 유닛 테스트는 전부 HTTP mock 이라
 * 이 가정을 검증하지 못한다 — 실 키로 한 번 왕복시켜 보는 수밖에 없다.
 *
 * I/O 는 `scripts/signing/snowsign-smoke.ts` 가 갖고, 판정만 여기 순수 함수로 둔다
 * (`embed-events.ts` 와 같은 분리 규약).
 */

/** 우리가 `POST /v1/templates` 에 실어 보낸 서명칸 한 칸. */
export type SignatureFieldProbe = {
  role: string;
  type: string;
  pageNumber: number;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
};

/** 좌표가 어긋난 지점. `returned` 가 undefined 면 숫자로 읽히지 않았다는 뜻. */
export type FieldDrift = {
  index: number;
  field: 'positionX' | 'positionY' | 'width' | 'height';
  sent: number;
  returned: number | undefined;
};

export type FieldDiffResult = {
  matched: number;
  /** 보냈는데 되돌아오지 않은 칸 수. 문서상 `type:"variable"` 은 응답에서 빠진다. */
  missing: number;
  drifts: FieldDrift[];
};

type WireRow = {
  role?: unknown;
  type?: unknown;
  page_number?: unknown;
  position_x?: unknown;
  position_y?: unknown;
  width?: unknown;
  height?: unknown;
};

/** 숫자로 읽히면 숫자, 아니면 undefined — 문자열 좌표("410")도 받는다. */
function num(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function rowsOf(returned: unknown): WireRow[] {
  if (typeof returned !== 'object' || returned === null) return [];
  const raw = (returned as { signature_fields?: unknown }).signature_fields;
  return Array.isArray(raw) ? (raw.filter((r) => typeof r === 'object' && r !== null) as WireRow[]) : [];
}

/** 짝짓기 키 — 응답 순서를 가정하지 않는다(문서에 명시가 없다). */
const COORDS = [
  ['positionX', 'position_x'],
  ['positionY', 'position_y'],
  ['width', 'width'],
  ['height', 'height'],
] as const;

export function diffSignatureFields(
  sent: ReadonlyArray<SignatureFieldProbe>,
  returned: unknown,
): FieldDiffResult {
  const rows = rowsOf(returned);
  const taken = new Set<number>();
  const drifts: FieldDrift[] = [];
  let matched = 0;
  let missing = 0;

  sent.forEach((f, index) => {
    // 같은 (role, type, page) 가 여러 칸일 수 있으므로 소비하며 짝짓는다.
    const at = rows.findIndex(
      (r, i) =>
        !taken.has(i) && r.role === f.role && r.type === f.type && num(r.page_number) === f.pageNumber,
    );
    if (at === -1) {
      missing += 1;
      return;
    }
    taken.add(at);
    matched += 1;
    const row = rows[at]!;
    for (const [key, wireKey] of COORDS) {
      const got = num(row[wireKey]);
      if (got !== f[key]) drifts.push({ index, field: key, sent: f[key], returned: got });
    }
  });

  return { matched, missing, drifts };
}
