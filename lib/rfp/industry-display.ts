import metadata from './industry-display.json';
import { MCC_INDUSTRIES } from './mcc-catalog';
import { fuzzyTermScore } from '@/lib/utils/hangul-fuzzy';
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
/** 모든 검색어가 맞아야 하며, 낮을수록 가까운 결과다. 하나라도 안 맞으면 null. */
function industrySearchScore(group: IndustryGroup, query: string): number | null {
 const text = industrySearchText(group);
 let total = 0;
 for (const term of normalizeSearch(query).trim().split(/\s+/).filter(Boolean)) {
  const score = fuzzyTermScore(text, term);
  if (score === null) return null;
  total += score;
 }
 return total;
}
/** 검색어에 맞는 업종을 가까운 순으로 — 점수 0 은 정확히 맞은 업종이고, 점수가 같으면 원래 순서를 지킨다. */
export function searchIndustries<T extends IndustryGroup>(groups: T[], query: string): { group: T; score: number }[] {
 return groups
  .map(group => ({ group, score: industrySearchScore(group, query) }))
  .filter((entry): entry is { group: T; score: number } => entry.score !== null)
  .sort((a, b) => a.score - b.score);
}
