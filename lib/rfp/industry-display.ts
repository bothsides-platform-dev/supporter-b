import metadata from './industry-display.json';
import { MCC_INDUSTRIES } from './mcc-catalog';
import { TYPO_SCORE_BASE, fuzzyTermScore } from '@/lib/utils/hangul-fuzzy';
export const INDUSTRY_CATEGORIES = metadata.categories;
type IndustryGroup = { name: string; mccCode?: string | null };
/** NFKC 는 호환 자모(ㅍ)를 조합용 자모로 바꿔 초성 검색을 깨뜨리므로 그 구간은 그대로 둔다. */
const normalizeSearch = (value: string) => value.replace(/[^\u3131-\u318E]+/g, part => part.normalize('NFKC'));
export function industryDisplay(group: IndustryGroup) {
 const item = metadata.industries.find(item => item.code === group.mccCode);
 return item ?? { category: '기타 업종', displayName: group.name, examples: '', synonyms: [] };
}
function industrySearchText(group: IndustryGroup) {
 const display = industryDisplay(group);
 const original = MCC_INDUSTRIES.find(item => item.code === group.mccCode)?.name ?? '';
 return normalizeSearch(`${group.name} ${original} ${group.mccCode ?? ''} ${display.category} ${display.displayName} ${display.examples} ${display.synonyms.join(' ')}`);
}
type IndustryMatch = { score: number; typo: boolean };
/** 모든 검색어가 맞아야 하며, 점수는 낮을수록 가깝다. typo 는 어느 검색어든 자모 오타(TYPO_SCORE_BASE 이상)로 맞았는지다. */
function industrySearchScore(group: IndustryGroup, query: string): IndustryMatch | null {
 const text = industrySearchText(group);
 const match = { score: 0, typo: false };
 for (const term of normalizeSearch(query).trim().split(/\s+/).filter(Boolean)) {
  const score = fuzzyTermScore(text, term);
  if (score === null) return null;
  match.score += score;
  match.typo ||= score >= TYPO_SCORE_BASE;
 }
 return match;
}
/** 검색어에 맞는 업종을 가까운 순으로 — 점수 0 은 정확히 맞은 업종이고, 점수가 같으면 원래 순서를 지킨다. */
export function searchIndustries<T extends IndustryGroup>(groups: T[], query: string): ({ group: T } & IndustryMatch)[] {
 return groups
  .flatMap(group => {
   const match = industrySearchScore(group, query);
   return match ? [{ group, ...match }] : [];
  })
  .sort((a, b) => a.score - b.score);
}
