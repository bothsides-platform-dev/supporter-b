// PG사 가로형 공식 워드마크 경로의 단일 출처(같은 폴더의 *-icon.png 파비콘은 components/landing/offer-comparison-data.ts 소유).
// 추천 후보 카드·추천 로딩 연출·튜토리얼 PG 로고가 모두 이 목록을 참조한다. 출처는 public/images/pg-logos/SOURCES.md.
export type PgWordmark = { src: string; width: number; height: number };

export const PG_WORDMARKS = {
  toss: { src: '/images/pg-logos/toss.png', width: 600, height: 98 },
  kiwoom: { src: '/images/pg-logos/kiwoom.svg', width: 334, height: 106 },
  hecto: { src: '/images/pg-logos/hecto.svg', width: 227, height: 32 },
  inicis: { src: '/images/pg-logos/inicis.png', width: 132, height: 24 },
  kcp: { src: '/images/pg-logos/kcp.svg', width: 121, height: 22 },
} as const satisfies Record<string, PgWordmark>;

// 별칭은 공식 이름이고 정규화한 이름과 '완전히 같을' 때만 로고를 붙인다 — 로고가 이름을 대신하므로,
// 포함 비교면 '○○ 대리점'·'○○ 테스트' 같은 다른 워크스페이스가 공식 PG와 똑같은 카드로 보인다.
// 별칭은 정규화 결과(공백 없는 소문자, 법인 표기 제거)와 같은 모양으로 적는다.
const ALIASES: Record<keyof typeof PG_WORDMARKS, readonly string[]> = {
  toss: ['토스페이먼츠'],
  kiwoom: ['키움페이', '키움페이먼츠'],
  hecto: ['헥토파이낸셜'],
  inicis: ['kg이니시스', '이니시스', 'kginicis'],
  kcp: ['nhnkcp', 'kcp'],
};

const BRAND_BY_ALIAS = new Map(
  (Object.keys(ALIASES) as (keyof typeof PG_WORDMARKS)[]).flatMap(b => ALIASES[b].map(a => [a, b] as const)),
);

// 전각 영문·숫자·기호(U+FF01–FF5E)와 ㈜ 만 편다 — NFKC 는 낱자모·원문자까지 펴서 'ㅌㅗㅅㅡ페이먼츠' 같은
// 다른 이름을 공식 이름으로 만든다. 공백·대소문자와 이름 앞뒤의 법인 표기((주)·주식회사)만 지운다.
const normalize = (name: string) =>
  name
    .replace(/[！-～]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/㈜/g, '(주)')
    .replace(/\s+/g, '')
    .toLowerCase()
    .replace(/^(?:\(주\)|주식회사)|(?:\(주\)|주식회사)$/g, '');

// 이름이 공식 이름과 다르면 null 이고, 화면은 PG사 이름 텍스트를 그대로 쓴다.
export function pgWordmark(name: string): PgWordmark | null {
  const brand = BRAND_BY_ALIAS.get(normalize(name));
  return brand ? PG_WORDMARKS[brand] : null;
}
