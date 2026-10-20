'use client';
import { useId, useState } from 'react';
import { Button } from '@/components/primitives/Button';
import { underlineInputClass, publicInputClass } from '@/components/forms/inputs';
import { FieldError } from '@/components/primitives/FieldError';
import { useRfpDraft } from '@/lib/stores/rfp-draft-context';
import { currentPgNameKey, currentPgsSchema, type CurrentPg } from '@/lib/rfp/current-pgs';

export type CurrentPgOption = { id: string; name: string; logoUpdatedAt?: string | null };
export function CurrentPgSelection({ pgList, attempted, presentation = 'default' }: { pgList: CurrentPgOption[]; attempted: boolean; presentation?: 'default' | 'public' }) {
  const inputClass = presentation === 'public' ? publicInputClass : underlineInputClass;
  const draft = useRfpDraft();
  const selected = draft.currentPgs ?? [];
  const [search, setSearch] = useState('');
  const [name, setName] = useState('');
  const id = useId();
  const invalid = attempted && !currentPgsSchema.min(1).safeParse(selected).success;
  const add = (pg: CurrentPg) => {
    if (selected.some(p => (pg.pgWorkspaceId && p.pgWorkspaceId === pg.pgWorkspaceId) || currentPgNameKey(p.name) === currentPgNameKey(pg.name))) return;
    if (selected.length < 50) draft.setField('currentPgs', [...selected, pg]);
  };
  const addName = () => {
    const clean = name.trim().replace(/\s+/g, ' ');
    if (!clean) return;
    const match = pgList.find(p => currentPgNameKey(p.name) === currentPgNameKey(clean));
    add({ pgWorkspaceId: match?.id ?? null, name: match?.name ?? clean });
    setName('');
  };
  return <div className="space-y-4">
    <p className="text-[14px] text-[var(--md-sys-color-on-surface-variant)]">여러 곳을 선택할 수 있어요. 입력한 PG사는 추천에서 제외하고, 이 정보는 구매사에게만 보여요.</p>
    <label className="block space-y-2"><span>PG사 검색</span><input type="search" aria-label="PG사 검색" className={inputClass} value={search} onChange={e => setSearch(e.target.value)} aria-invalid={invalid || undefined} aria-describedby={invalid ? `${id}-error` : undefined} /></label>
    <fieldset className="max-h-64 space-y-2 overflow-y-auto">
      <legend className="sr-only">현재 이용 중인 PG사 선택</legend>
      {pgList.filter(p => currentPgNameKey(p.name).includes(currentPgNameKey(search))).map(pg => <label key={pg.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] px-3 py-2 text-[16px] hover:bg-[var(--md-sys-color-surface-container)]">
        <input type="checkbox" checked={selected.some(p => p.pgWorkspaceId === pg.id)} onChange={e => e.target.checked ? add({ pgWorkspaceId: pg.id, name: pg.name }) : draft.setField('currentPgs', selected.filter(p => p.pgWorkspaceId !== pg.id))} className="accent-[var(--md-sys-color-primary)]" />{pg.name}
      </label>)}
    </fieldset>
    <div className="space-y-2">
      <label className="block space-y-2"><span>PG 회사명 직접 입력</span><input className={inputClass} value={name} maxLength={100} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); addName(); } }} /></label>
      <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">목록에 없으면 계약서에 적힌 회사명을 입력해요.</p>
      <Button className="min-h-11 lg:min-h-8" variant="outlined" disabled={!name.trim() || selected.length >= 50} onClick={addName}>추가해요</Button>
    </div>
    {selected.length > 0 && <ul aria-label="입력한 기존 PG사" className="space-y-2">{selected.map((pg, index) => <li key={pg.pgWorkspaceId ?? pg.name} className="flex items-center justify-between gap-3"><span>{pg.name}</span><Button className="min-h-11 lg:min-h-8" variant="text" aria-label={`${pg.name} 제거`} onClick={() => draft.setField('currentPgs', selected.filter((_, i) => i !== index))}>제거</Button></li>)}</ul>}
    {invalid && <div id={`${id}-error`}><FieldError error="현재 이용 중인 PG사를 한 곳 이상 입력해요." /></div>}
  </div>;
}
