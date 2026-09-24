'use client';

import { useId, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/primitives/Button';
import { FieldError } from '@/components/primitives/FieldError';
import { useRfpDraftStore } from '@/lib/stores/rfp-draft';
import { industryNameKey, isIndustrySelectionValid } from '@/lib/rfp/industry-selection';
import { MCC_INDUSTRIES } from '@/lib/rfp/mcc-catalog';
import type { PgRecommendationGroup } from '@/lib/types/pg-recommendation';

const choiceClass = 'flex cursor-pointer items-start gap-3 rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] px-3 py-2 text-[16px] hover:bg-[var(--md-sys-color-surface-container)] has-[:checked]:border-[var(--md-sys-color-primary)] has-[:checked]:bg-[var(--md-sys-color-primary-container)] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--md-sys-color-primary)]/50';

export function IndustrySelection({ groups, attempted = false }: { groups: PgRecommendationGroup[]; attempted?: boolean }) {
  const draft = useRfpDraftStore();
  const [query, setQuery] = useState('');
  const id = useId();
  const custom = draft.industryMode === 'custom' || groups.length === 0;
  const entries = groups.map(group => ({ ...group, category: MCC_INDUSTRIES.find(item => item.code === group.mccCode)?.category ?? '기타 업종' }));
  const terms = industryNameKey(query).split(' ').filter(Boolean);
  const results = entries.filter(group => terms.every(term => industryNameKey(`${group.name} ${group.mccCode ?? ''} ${group.category}`).includes(term)));
  const categories = [...new Set(results.map(group => group.category))];
  const selectCustom = () => {
    draft.setField('industryMode', 'custom');
    if (!draft.customIndustryName) draft.setField('customIndustryName', query.trim().slice(0, 100));
  };
  const error = attempted && !isIndustrySelectionValid(draft, groups);
  return <div className="space-y-4">
    <p className="text-[14px] text-[var(--md-sys-color-on-surface-variant)]">판매하는 상품이나 서비스에 가장 가까운 업종 하나를 선택해요. 찾는 업종이 없으면 직접 입력할 수 있어요.</p>
    {groups.length > 0 && <>
      <label htmlFor={`${id}-search`} className="sr-only">업종 검색</label>
      <Input id={`${id}-search`} type="search" placeholder="업종 이름이나 MCC 코드로 검색해요" value={query} onChange={event => setQuery(event.target.value)} />
      {query && <Button variant="text" onClick={() => setQuery('')}>검색 초기화</Button>}
      {results.length === 0 && <p role="status" className="text-[14px] text-[var(--md-sys-color-on-surface-variant)]">검색 결과가 없어요. 검색어를 지우거나 아래에서 업종을 직접 입력해요.</p>}
    </>}
    <fieldset className="space-y-4">
      <legend className="sr-only">업종</legend>
      <div className="max-h-[min(44dvh,360px)] space-y-4 overflow-y-auto overscroll-contain p-1">
      {categories.map(category => <div key={category} className="space-y-2">
        <p className="md-label-large text-[var(--md-sys-color-on-surface-variant)]">{category}</p>
        {results.filter(group => group.category === category).map(group => <label key={group.id} className={choiceClass}>
          <input type="radio" name={`${id}-industry`} checked={!custom && draft.industryGroupId === group.id} onChange={() => { draft.setField('industryMode', 'registered'); draft.setField('industryGroupId', group.id); }} className="mt-1 accent-[var(--md-sys-color-primary)]" />
          <span className="min-w-0 flex-1">{group.name}</span>
          {group.mccCode && <span className="shrink-0 text-[12px] text-[var(--md-sys-color-on-surface-variant)]">MCC <span className="md-numeric">{group.mccCode}</span></span>}
        </label>)}
      </div>)}
      </div>
      <label className={choiceClass}>
        <input type="radio" name={`${id}-industry`} checked={custom} onChange={selectCustom} className="mt-1 accent-[var(--md-sys-color-primary)]" />
        찾는 업종이 없어요 · 직접 입력
      </label>
    </fieldset>
    {custom && <div className="space-y-2">
      <label htmlFor={`${id}-name`} className="md-label-large">업종 이름</label>
      <Input id={`${id}-name`} placeholder="예: 반려동물 방문 돌봄" maxLength={100} value={draft.customIndustryName} aria-invalid={error || undefined} aria-describedby={error ? `${id}-error` : undefined} onChange={event => { draft.setField('industryMode', 'custom'); draft.setField('customIndustryName', event.target.value); }} />
    </div>}
    {error && <div id={`${id}-error`}><FieldError error={custom ? '업종 이름을 1~100자로 입력해주세요' : '업종을 선택하면 다음 질문으로 넘어갈 수 있어요'} /></div>}
  </div>;
}
