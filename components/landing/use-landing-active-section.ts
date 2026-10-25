'use client';

import { useEffect, useRef, useState } from 'react';

const SECTION_IDS = ['service', 'pricing', 'calculator', 'faq', 'contact'] as const;
type SectionId = typeof SECTION_IDS[number];

// Buyer landing only. Native anchors own navigation/history; this hook only
// reads layout. A section must contain the line 24px below the fixed header.
export function useLandingActiveSection() {
  const navRef = useRef<HTMLElement>(null);
  const [activeSection, setActiveSection] = useState<SectionId | null>(null);

  useEffect(() => {
    const header = navRef.current?.closest('header');
    if (!header || typeof IntersectionObserver === 'undefined') return;
    const sections = SECTION_IDS.flatMap(id => {
      const element = document.getElementById(id);
      return element ? [{ id, element }] : [];
    });
    if (!sections.length) return;

    const root = document.documentElement;
    let observer: IntersectionObserver | undefined;
    let referenceY = 0;
    let viewportHeight = 0;
    let atBottom = false;
    const isAtBottom = () => window.scrollY + root.clientHeight >= root.scrollHeight - 1;

    const update = () => {
      atBottom = isAtBottom();
      const bounds = sections.map(section => ({ ...section, rect: section.element.getBoundingClientRect() }));
      const contact = bounds.find(section => section.id === 'contact');
      // A short final section may never reach the reference line. Only select
      // it at the page end while it is actually visible above the footer.
      if (atBottom && contact && contact.rect.top < root.clientHeight && contact.rect.bottom > header.getBoundingClientRect().bottom) {
        setActiveSection('contact');
        return;
      }
      // IO includes edge adjacency. Match it so upward entry at an exact
      // section end cannot leave the highlight stale; prefer the next section
      // when two sections share that edge.
      setActiveSection(bounds.findLast(({ rect }) => rect.top <= referenceY && rect.bottom >= referenceY)?.id ?? null);
    };

    const observe = () => {
      const height = root.clientHeight;
      // Header coordinates can be above the viewport; keep the reference line
      // inside it and negate numbers, never prefix a potentially signed string.
      const line = Math.max(0, Math.min(header.getBoundingClientRect().bottom + 24, Math.max(0, height - 1)));
      if (observer && line === referenceY && height === viewportHeight) return;
      referenceY = line;
      viewportHeight = height;
      observer?.disconnect();
      // Zero-height root detects crossing of the exact line (including long
      // pinned sections); percentage margins would depend on viewport width.
      observer = new IntersectionObserver(update, {
        rootMargin: `${-line}px 0px ${-(height - line)}px 0px`,
        threshold: 0,
      });
      sections.forEach(({ element }) => observer!.observe(element));
      // Initial observer delivery reads restored/hash positions too.
    };
    const onScroll = () => {
      // IO handles section crossings. Only page-end transitions need a scroll
      // fallback; do not measure all section rectangles on each scroll tick.
      if (isAtBottom() !== atBottom) update();
    };
    observe();
    const resizeObserver = new ResizeObserver(() => {
      observe();
      update();
    });
    resizeObserver.observe(header);
    resizeObserver.observe(root);
    window.addEventListener('resize', observe);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      observer?.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener('resize', observe);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  return { navRef, activeSection };
}
