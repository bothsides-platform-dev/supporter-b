// PG사 가로형 공식 워드마크 — public/images/pg-logos 경로의 단일 출처. 출처는 public/images/pg-logos/SOURCES.md.
// 추천 후보 카드·추천 로딩 연출·튜토리얼 PG 로고가 모두 이 목록을 참조한다.
export type PgWordmark = { src: string; width: number; height: number };

export const PG_WORDMARKS = {
  toss: { src: '/images/pg-logos/toss.png', width: 600, height: 98 },
  kiwoom: { src: '/images/pg-logos/kiwoom.svg', width: 334, height: 106 },
  hecto: { src: '/images/pg-logos/hecto.svg', width: 227, height: 32 },
  inicis: { src: '/images/pg-logos/inicis.png', width: 132, height: 24 },
  kcp: { src: '/images/pg-logos/kcp.svg', width: 121, height: 22 },
} as const satisfies Record<string, PgWordmark>;

// 별칭은 이름과 같은 규칙(공백 없는 소문자)으로 적는다 — 이름만 정규화해 비교하기 때문이다.
const ALIASES: Record<keyof typeof PG_WORDMARKS, readonly string[]> = {
  toss: ['토스'],
  kiwoom: ['키움'],
  hecto: ['헥토'],
  inicis: ['이니시스', 'inicis'],
  kcp: ['kcp'],
};

// 이름이 별칭과 맞지 않으면 null 이고, 화면은 PG사 이름 텍스트를 그대로 쓴다.
export function pgWordmark(name: string): PgWordmark | null {
  const key = name.replace(/\s+/g, '').toLowerCase();
  if (!key) return null;
  const brand = (Object.keys(ALIASES) as (keyof typeof PG_WORDMARKS)[])
    .find(b => ALIASES[b].some(a => key.includes(a)));
  return brand ? PG_WORDMARKS[brand] : null;
}
