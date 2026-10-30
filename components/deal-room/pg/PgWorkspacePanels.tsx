'use client';

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

/** Both panes keep their DOM, input state and scroll position across mobile tabs. */
export function PgWorkspacePanels({
  active,
  onChange,
  writeLabel,
  request,
  work,
}: {
  active: string;
  onChange: (id: string) => void;
  writeLabel: string;
  request: ReactNode;
  work: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const panels = useRef<Array<HTMLElement | null>>([]);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const positions = useRef([0, 0]);
  const [wide, setWide] = useState(false);
  const id = useId();
  useEffect(() => {
    const observer = new ResizeObserver((entries) =>
      setWide(entries[0].contentRect.width >= 1024),
    );
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    panels.current.forEach((panel, i) => {
      if (panel && !panel.hidden) panel.scrollTop = positions.current[i];
    });
  }, [active, wide]);
  const tabs = [
    { id: 'request', label: '요청 조건', content: request },
    { id: 'write', label: writeLabel, content: work },
  ];
  const change = (next: string) => {
    panels.current.forEach((panel, i) => {
      if (panel && !panel.hidden) positions.current[i] = panel.scrollTop;
    });
    onChange(next);
  };
  return (
    <div ref={root} className="flex h-full min-h-0 flex-col">
      {!wide && (
        <div
          role="tablist"
          aria-label="견적 요청 작업"
          className="flex shrink-0 border-b border-[var(--md-sys-color-outline-variant)]"
        >
          {tabs.map((tab, i) => (
            <button
              key={tab.id}
              ref={(el) => {
                buttons.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${id}-${tab.id}-tab`}
              aria-controls={`${id}-${tab.id}`}
              aria-selected={active === tab.id}
              tabIndex={active === tab.id ? 0 : -1}
              onClick={() => change(tab.id)}
              onKeyDown={(e) => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key))
                  return;
                e.preventDefault();
                const next = e.key === 'Home' ? 0 : e.key === 'End' ? 1 : 1 - i;
                change(tabs[next].id);
                buttons.current[next]?.focus();
              }}
              className={`min-h-11 flex-1 border-b-2 px-4 text-[14px] ${active === tab.id ? 'border-[var(--md-sys-color-primary)] text-[var(--md-sys-color-primary)]' : 'border-transparent text-[var(--md-sys-color-on-surface-variant)]'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}
      <div
        className={`min-h-0 flex-1 ${wide ? 'grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] grid-rows-[auto_minmax(0,1fr)]' : 'flex flex-col'}`}
      >
        {wide && tabs.map(tab => <h2 key={`heading-${tab.id}`} className="border-b border-[var(--md-sys-color-outline-variant)] px-4 py-3 text-[16px] font-semibold">{tab.label}</h2>)}
        {tabs.map((tab, i) => (
          <section
            key={tab.id}
            id={`${id}-${tab.id}`}
            ref={(el) => {
              panels.current[i] = el;
            }}
            role={wide ? 'region' : 'tabpanel'}
            aria-label={tab.label}
            tabIndex={0}
            hidden={!wide && active !== tab.id}
            className={`min-h-0 min-w-0 flex-1 overflow-y-auto p-4 ${wide && i === 0 ? 'border-r border-[var(--md-sys-color-outline-variant)]' : ''}`}
          >
            {tab.content}
          </section>
        ))}
      </div>
    </div>
  );
}
