'use client';
import type { GuestSession } from '@/components/rfp/useGuestDraft';
import { type QuoteContext, newQuoteContext } from './quote-context';
import { assistResultSchema, type AssistResult, type Suggestion } from './suggestions';
import { saveGuestProgress } from './server-client';

export const suggestionQuestions: Record<Suggestion['field'], string> = {
  companyName: 'company', mainProducts: 'products', industryGroupId: 'industry', currentSolution: 'solution',
  deliveryServicePeriod: 'delivery', hasMarketplaceSellers: 'sellers', cashConvertible: 'cash', salesMethods: 'sales',
};
type Ports = {
  analyze: (input: { id: string; revision: number; kind: 'business' | 'website'; input: string; retry?: string }, signal: AbortSignal) => Promise<AssistResult>;
  save: (session: GuestSession) => Promise<{ revision: number }>;
};
export async function sendQuoteRequest<T>(path: 'assist' | 'savings', body: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch('/api/guest-rfp/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
  if (!response.ok) throw new Error('확인한 정보만 채웠어요. 나머지는 직접 입력해주세요.');
  return response.json();
}
export function saveQuoteProgress(session: GuestSession) {
  return saveGuestProgress(session.draft, session.save);
}
export class GuestQuoteController {
  private listeners = new Set<() => void>();
  private generation = 0;
  private busy = false;
  private abort?: AbortController;
  constructor(readonly session: GuestSession, private readonly ports: Ports = {
    analyze: (input, signal) => sendQuoteRequest('assist', input, signal), save: saveQuoteProgress,
  }) {
    if (!session.draft.quoteContext) session.draft.quoteContext = {
      ...newQuoteContext(), stage: session.draft.completed ? 'complete' : session.draft.data.websiteUrl || session.draft.data.contentQuestion !== 'website' ? 'questions' : 'business',
    };
    if (session.draft.quoteContext.analysisState === 'pending')
      session.draft.quoteContext = { ...session.draft.quoteContext, analysisState: 'manual' };
  }
  snapshot = (): QuoteContext => this.session.draft.quoteContext!;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  update(patch: Partial<QuoteContext>) {
    this.session.draft.quoteContext = { ...this.snapshot(), ...patch };
    try { this.session.save(); } finally { this.listeners.forEach(listener => listener()); }
  }
  stop = () => { ++this.generation; this.abort?.abort(); this.busy = false; };
  suggestions() {
    const context = this.snapshot();
    // Website-specific product evidence takes precedence over broad business categories.
    const website = context.websiteResult?.suggestions ?? [];
    return [...website, ...(context.businessResult?.suggestions ?? []).filter(s => !website.some(w => w.field === s.field))];
  }
  value(field: Suggestion['field']): Suggestion['value'] | undefined {
    const d = this.session.store.getState();
    switch (field) {
      case 'companyName': return this.snapshot().companyName;
      case 'cashConvertible': case 'hasMarketplaceSellers': case 'salesMethods': return d.productInfo[field];
      default: return d[field];
    }
  }
  private write(field: Suggestion['field'], value: Suggestion['value']) {
    const state = this.session.store.getState();
    switch (field) {
      case 'companyName': if (typeof value === 'string') this.update({ companyName: value }); break;
      case 'cashConvertible': case 'hasMarketplaceSellers':
        if (typeof value === 'boolean') state.setField('productInfo', { ...state.productInfo, [field]: value }); break;
      case 'salesMethods':
        if (Array.isArray(value)) state.setField('productInfo', { ...state.productInfo, salesMethods: value }); break;
      case 'currentSolution':
        if (typeof value === 'string') state.setField(field, value as typeof state.currentSolution); break;
      case 'industryGroupId':
        if (typeof value === 'string') this.session.store.setState({ industryGroupId: value, industryMode: 'registered', customIndustryName: '' }); break;
      default: if (typeof value === 'string') state.setField(field, value);
    }
    this.session.save();
  }
  edit(field: Suggestion['field'], value: Suggestion['value']) {
    this.update({ userFields: [...new Set([...this.snapshot().userFields, field])] });
    this.write(field, value);
    this.syncTitle();
  }
  private invalidate(result?: AssistResult) {
    const context = this.snapshot();
    for (const suggestion of result?.suggestions ?? []) {
      if (context.userFields.includes(suggestion.field)) continue;
      if (JSON.stringify(this.value(suggestion.field)) !== JSON.stringify(suggestion.value)) continue;
      const state = this.session.store.getState();
      if (['cashConvertible', 'hasMarketplaceSellers', 'salesMethods'].includes(suggestion.field)) {
        const product = { ...state.productInfo };
        delete product[suggestion.field as keyof typeof product];
        state.setField('productInfo', product);
      } else this.write(suggestion.field, '');
    }
    this.update({ confirmed: context.confirmed.filter(q => !(result?.suggestions ?? []).some(s => suggestionQuestions[s.field] === q)) });
  }
  business(bizNo: string) {
    if (bizNo === this.snapshot().bizNo) return;
    this.stop(); this.invalidate(this.snapshot().businessResult);
    this.update({ bizNo, businessResult: undefined, analysisState: 'idle', stage: 'business' });
  }
  website(url: string) {
    if (url === this.session.store.getState().websiteUrl) return;
    this.stop();
    this.session.store.getState().setField('websiteUrl', url);
    this.invalidate(this.snapshot().websiteResult);
    this.update({ websiteResult: undefined, analyzedWebsite: undefined, analysisState: 'idle',
      confirmed: this.snapshot().confirmed.filter(q => q !== 'website') });
  }
  manual(kind: 'business' | 'website') {
    this.stop();
    this.update({ analysisState: 'manual', stage: kind === 'business' ? 'website' : 'review' });
  }
  async analyze(kind: 'business' | 'website', retry = false) {
    if (this.busy) return;
    this.busy = true;
    const generation = ++this.generation;
    this.abort = new AbortController();
    const input = kind === 'business' ? this.snapshot().bizNo : this.session.store.getState().websiteUrl;
    this.update({ analysisState: 'pending' });
    try {
      const saved = await this.ports.save(this.session);
      this.session.draft.serverRevision = saved.revision;
      this.session.save(); // Acknowledgment survives a manual-entry cancellation.
      if (generation !== this.generation) return;
      const response = assistResultSchema.parse(await this.ports.analyze({
        id: this.session.draft.id, revision: saved.revision, kind, input, ...(retry ? { retry: crypto.randomUUID() } : {}),
      }, this.abort.signal));
      if (generation !== this.generation) return;
      this.update({ ...(kind === 'business' ? { businessResult: response } : { websiteResult: response, analyzedWebsite: input }),
        analysisState: response.status, stage: kind === 'business' ? 'website' : 'review' });
    } catch {
      if (generation === this.generation) this.manual(kind);
    } finally { if (generation === this.generation) this.busy = false; }
  }
  confirm() {
    for (const suggestion of this.suggestions()) {
      if (this.snapshot().rejectedFields?.includes(suggestion.field)) continue;
      const current = this.value(suggestion.field);
      if (!this.snapshot().userFields.includes(suggestion.field)
        && (current === undefined || current === '' || Array.isArray(current) && !current.length))
        this.write(suggestion.field, suggestion.value);
      this.update({ confirmed: [...new Set([...this.snapshot().confirmed, suggestionQuestions[suggestion.field]])] });
    }
    this.update({ confirmed: [...new Set([...this.snapshot().confirmed, 'website'])], stage: 'questions' });
    this.syncTitle();
  }
  syncTitle() {
    const d = this.session.store.getState();
    const context = this.snapshot();
    if (!d.contractType || !d.mainProducts.trim() || d.title && d.title !== context.generatedTitle) return;
    const title = [context.companyName.trim() || '우리 회사', d.mainProducts.trim(), d.contractType === 'new' ? '신규' : '갱신', 'PG 견적'].join(' ').slice(0, 200);
    if (title === d.title) return;
    this.update({ generatedTitle: title });
    d.setField('title', title);
    this.session.save();
  }
}

