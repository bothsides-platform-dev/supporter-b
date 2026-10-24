"use client";
import { useEffect, useRef } from 'react';
import { trackFunnel, type FunnelId, type FunnelParams } from './funnel';
export function useFunnelView(funnel: FunnelId, step: string | null, params: Omit<FunnelParams, 'funnel_id' | 'step_id'> = {}) {
  const last = useRef<string | null>(null);
  const { mode = 'write', entry_path, contract_type } = params;
  useEffect(() => {
    const key = step ? `${funnel}:${step}:${mode}` : null;
    if (key && key !== last.current) trackFunnel('funnel_step_view', { funnel_id: funnel, step_id: step!, mode, ...(entry_path ? {entry_path} : {}), contract_type });
    last.current = key;
  }, [funnel, step, mode, entry_path, contract_type]);
}
export function FunnelView({ funnel, step, ...params }: {funnel: FunnelId; step: string} & Omit<FunnelParams, 'funnel_id' | 'step_id'>) {
  useFunnelView(funnel, step, params); return null;
}
export function trackQuestionProgress(action: 'view' | 'next' | 'skip' | 'error', id: string, mode: 'write' | 'edit', contractType?: 'new' | 'renewal' | null, answer?: string) {
  trackFunnel(action === 'view' ? 'funnel_step_view' : action === 'error' ? 'funnel_step_error' : 'funnel_step_complete', {
    ...(action === 'next' && answer !== undefined ? { journey_answer: answer } : {}),
    funnel_id: 'questions', step_id: id, mode, contract_type: contractType ?? 'unknown',
    ...(action === 'next' || action === 'skip' ? { progression: action } : {}),
    ...(action === 'error' ? { error_code: 'VALIDATION' } : {}),
  });
}
