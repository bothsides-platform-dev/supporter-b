'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUIStore } from '@/lib/stores/ui';
import { Command } from 'cmdk';
import { XIcon } from '@/components/icons';
import { IconButton } from '@/components/primitives/IconButton';
import { ShortcutHint } from '@/components/shell/ShortcutHint';
import { getNavCommands } from '@/lib/nav/nav-config';
import type { WorkspaceType } from '@/lib/types/workspace';
import { getChoseong } from 'es-hangul';
import {
  searchEntitiesAction,
  type SearchResults,
} from '@/lib/server/actions/search/searchEntitiesAction';

const EMPTY_RESULTS: SearchResults = { rfps: [], bids: [], opportunities: [] };

const HEADING_CLASS =
  'px-4 py-1 block font-mono text-[10px] tracking-[0.16em] uppercase text-[var(--md-sys-color-on-surface-variant)]';
const ITEM_CLASS =
  'flex items-center justify-between px-4 py-2.5 text-[13px] text-[var(--md-sys-color-on-surface)] cursor-pointer aria-selected:bg-[var(--md-sys-color-surface-container-high)]';
const ENTITY_ITEM_CLASS =
  'flex flex-col items-start gap-0.5 px-4 py-2.5 cursor-pointer aria-selected:bg-[var(--md-sys-color-surface-container-high)]';

export function CommandPalette({ workspaceType }: { workspaceType: WorkspaceType }) {
  const { commandPaletteOpen, closeCommandPalette } = useUIStore();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS);
  const [loading, setLoading] = useState(false);

  const navCommands = getNavCommands(workspaceType);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        useUIStore.getState().toggleCommandPalette();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // Reset transient state whenever the palette closes. State updates are deferred
  // (setTimeout 0) so they don't run synchronously inside the effect body.
  useEffect(() => {
    if (commandPaletteOpen) return;
    const t = setTimeout(() => {
      setQuery('');
      setResults(EMPTY_RESULTS);
      setLoading(false);
    }, 0);
    return () => clearTimeout(t);
  }, [commandPaletteOpen]);

  // Debounced server-side search-as-you-type. Empty query short-circuits without
  // a round trip; stale responses are dropped via the `cancelled` flag. All state
  // updates happen inside the timer so none run synchronously in the effect body.
  useEffect(() => {
    const q = query.trim();
    let cancelled = false;
    const t = setTimeout(
      () => {
        if (cancelled) return;
        if (!q) {
          setResults(EMPTY_RESULTS);
          setLoading(false);
          return;
        }
        setLoading(true);
        searchEntitiesAction(q)
          .then((r) => {
            if (!cancelled) setResults(r);
          })
          .catch(() => {})
          .finally(() => {
            if (!cancelled) setLoading(false);
          });
      },
      q ? 200 : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  // Nav commands are static, so we filter them client-side (cmdk's own filter is
  // off — entity results are already filtered by the server). Chosung (초성)
  // matching lets users type ㅅㅈ to find 설정 etc.
  const q = query.trim().toLowerCase();
  const navMatches = q
    ? navCommands.filter((c) => {
        const label = c.label.toLowerCase();
        return label.includes(q) || getChoseong(label).includes(q);
      })
    : navCommands;

  // Normalize the three entity result types into one shape so a single loop
  // renders them — primary text, an optional inline aside, an optional sub line.
  const entityGroups: {
    heading: string;
    items: { key: string; value: string; href: string; primary: string; aside?: string; sub?: string }[];
  }[] = [
    {
      heading: '견적 요청',
      items: results.rfps.map((r) => ({
        key: r.code,
        value: `rfp-${r.code}`,
        href: r.href,
        primary: r.title,
        sub: r.memo,
      })),
    },
    {
      heading: '견적서',
      items: results.bids.map((b) => ({
        key: b.bidId,
        value: `bid-${b.bidId}`,
        href: b.href,
        primary: b.rfpTitle,
        aside: b.pgWsName,
        sub: b.memo,
      })),
    },
    {
      heading: '참여 가능한 견적',
      items: results.opportunities.map((o) => ({
        key: o.rfpCode,
        value: `opp-${o.rfpCode}`,
        href: o.href,
        primary: o.title,
        aside: o.buyerName,
      })),
    },
  ];

  if (!commandPaletteOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 dark:bg-white/10 backdrop-blur-[4px] pt-[12vh]"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeCommandPalette();
      }}
    >
      <div className="w-[620px] bg-[var(--md-sys-color-surface)] border border-[var(--md-sys-color-outline-variant)] rounded-md overflow-hidden shadow-[var(--command-palette-shadow)]">
        <Command shouldFilter={false}>
          <div className="flex items-center border-b border-[var(--md-sys-color-outline-variant)] px-4">
            <Command.Input
              value={query}
              onValueChange={setQuery}
              className="flex-1 h-12 bg-transparent font-sans text-[14px] text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-on-surface-variant)] outline-none"
              placeholder="검색..."
              autoFocus
            />
            <IconButton label="닫기" size="sm" onClick={closeCommandPalette}>
              <XIcon size={14} />
            </IconButton>
          </div>
          <Command.List className="max-h-80 overflow-y-auto py-2">
            <Command.Empty className="py-8 text-center font-mono text-[11px] tracking-[0.14em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
              결과 없음
            </Command.Empty>

            {navMatches.length > 0 && (
              <Command.Group heading={<span className={HEADING_CLASS}>이동</span>}>
                {navMatches.map((cmd) => (
                  <Command.Item
                    key={cmd.id}
                    value={cmd.id}
                    onSelect={() => {
                      router.push(cmd.href);
                      closeCommandPalette();
                    }}
                    className={ITEM_CLASS}
                  >
                    <span>{cmd.label}</span>
                    {cmd.shortcut && <ShortcutHint shortcut={cmd.shortcut} />}
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {loading && (
              <span className="px-4 py-3 block font-mono text-[11px] tracking-[0.14em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
                LOADING…
              </span>
            )}

            {entityGroups.map(
              (group) =>
                group.items.length > 0 && (
                  <Command.Group
                    key={group.heading}
                    heading={<span className={HEADING_CLASS}>{group.heading}</span>}
                  >
                    {group.items.map((item) => (
                      <Command.Item
                        key={item.key}
                        value={item.value}
                        onSelect={() => {
                          router.push(item.href);
                          closeCommandPalette();
                        }}
                        className={ENTITY_ITEM_CLASS}
                      >
                        <span className="text-[13px] text-[var(--md-sys-color-on-surface)]">
                          {item.primary}
                          {item.aside && (
                            <span className="ml-2 text-[var(--md-sys-color-on-surface-variant)]">
                              {item.aside}
                            </span>
                          )}
                        </span>
                        {item.sub && (
                          <span className="text-[11px] font-mono text-[var(--md-sys-color-on-surface-variant)] truncate max-w-[540px]">
                            {item.sub}
                          </span>
                        )}
                      </Command.Item>
                    ))}
                  </Command.Group>
                ),
            )}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
