import metadata from './industry-display.json';
import { MCC_INDUSTRIES } from './mcc-catalog';
export const INDUSTRY_CATEGORIES = metadata.categories;
export function industryDisplay(group: { name: string; mccCode?: string | null }) {
 const item = metadata.industries.find(item => item.code === group.mccCode);
 return item ?? { category: '기타 업종', displayName: group.name, examples: '', synonyms: [] };
}
export function matchesIndustry(group: { name: string; mccCode?: string | null }, query: string) {
 const display = industryDisplay(group);
 const original = MCC_INDUSTRIES.find(item => item.code === group.mccCode)?.name ?? '';
 const text = `${group.name} ${original} ${group.mccCode ?? ''} ${display.category} ${display.displayName} ${display.examples} ${display.synonyms.join(' ')}`.normalize('NFKC').toLowerCase();
 return query.normalize('NFKC').trim().toLowerCase().split(/\s+/).filter(Boolean).every(term => text.includes(term));
}
