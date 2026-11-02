 'use client';
import { useEffect, useRef, type ReactNode, type KeyboardEvent } from 'react';
import type { ReviewPane } from './RfpStep4Review';

export function reviewBackPane(split: boolean, pane: ReviewPane): ReviewPane | null {
  return split && pane === 'review' ? 'pg' : null;
}
export function isReviewBackShortcut(event: KeyboardEvent<HTMLElement>) {
  return event.key === 'Enter' && event.shiftKey && !event.defaultPrevented && !event.nativeEvent.isComposing
    && event.keyCode !== 229 && !event.repeat && !event.ctrlKey && !event.altKey && !event.metaKey;
}
export function MatchingReviewLayout({ pane, recommendation, children }: { pane?: ReviewPane; recommendation: ReactNode; children: ReactNode }) {
  const refs = useRef<Partial<Record<ReviewPane, HTMLElement | null>>>({});
  const previous = useRef(pane);
  useEffect(() => {
    if (!pane || previous.current === pane) { previous.current = pane; return; }
    previous.current = pane;
    refs.current[pane]?.scrollIntoView?.({ block: 'start' });
    refs.current[pane]?.focus({ preventScroll: true });
  }, [pane]);
  return <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
    <section ref={el => { refs.current.pg = el; }} tabIndex={-1} hidden={pane === 'review'} aria-label="맞춤 PG 추천" className="outline-none">{recommendation}</section>
    <div ref={el => { refs.current.review = el; }} tabIndex={-1} hidden={pane === 'pg'} className="outline-none">{children}</div>
  </div>;
}
