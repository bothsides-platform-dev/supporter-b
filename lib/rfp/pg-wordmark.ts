// 추천 후보 카드의 가로형 공식 워드마크. 출처는 public/images/pg-logos/SOURCES.md.
// 이름이 별칭과 맞지 않으면 null 이고, 화면은 PG사 이름 텍스트를 그대로 쓴다.
export type PgWordmark = { src: string; width: number; height: number };

const WORDMARKS: { aliases: string[]; mark: PgWordmark }[] = [
  { aliases: ['토스'], mark: { src: '/images/pg-logos/toss.png', width: 600, height: 98 } },
  { aliases: ['키움'], mark: { src: '/images/pg-logos/kiwoom.svg', width: 334, height: 106 } },
  { aliases: ['헥토'], mark: { src: '/images/pg-logos/hecto.svg', width: 227, height: 32 } },
  { aliases: ['이니시스', 'inicis'], mark: { src: '/images/pg-logos/inicis.png', width: 132, height: 24 } },
  { aliases: ['kcp'], mark: { src: '/images/pg-logos/kcp.svg', width: 121, height: 22 } },
];

export function pgWordmark(name: string): PgWordmark | null {
  const key = name.replace(/\s+/g, '').toLowerCase();
  if (!key) return null;
  return WORDMARKS.find(w => w.aliases.some(a => key.includes(a)))?.mark ?? null;
}
