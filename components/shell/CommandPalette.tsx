'use client';
import { useBuyerDemo } from '@/lib/demo/buyer-demo-context';
import { useDemoNavigate } from '@/lib/nav/demo-nav-context';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUIStore } from '@/lib/stores/ui';
import { Command } from 'cmdk';
import { XIcon } from '@/components/icons';
import { IconButton } from '@/components/primitives/IconButton';
import { Button } from '@/components/primitives/Button';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { ShortcutHint } from '@/components/shell/ShortcutHint';
import { getNavCommands, getAccountCommands } from '@/lib/nav/nav-config';
import type { WorkspaceType } from '@/lib/types/workspace';
import { getChoseong } from 'es-hangul';
import {
  searchEntitiesAction,
  type SearchResults,
} from '@/lib/server/actions/search/searchEntitiesAction';
import { OPEN_BOARD_ENABLED } from '@/lib/features/open-board';

const EMPTY_RESULTS: SearchResults = { rfps: [], bids: [], opportunities: [] };

type SearchState = { query: string; attempt: number } & (
  | { status: 'success'; results: SearchResults }
  | { status: 'error' }
);

const HEADING_CLASS =
  'px-4 py-1 block md-label-small text-[var(--md-sys-color-on-surface-variant)]';
const ITEM_CLASS =
  'flex items-center justify-between px-4 py-2.5 text-[13px] text-[var(--md-sys-color-on-surface)] cursor-pointer aria-selected:bg-[var(--md-sys-color-surface-container-high)]';
const ENTITY_ITEM_CLASS =
  'flex flex-col items-start gap-0.5 px-4 py-2.5 cursor-pointer aria-selected:bg-[var(--md-sys-color-surface-container-high)]';

export function CommandPalette({ workspaceType }: { workspaceType: WorkspaceType }) {
  const { commandPaletteOpen, closeCommandPalette } = useUIStore();
  const demo = useBuyerDemo();
  const demoNavigate = useDemoNavigate();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<SearchState | null>(null);
  const [attempt, setAttempt] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  const navCommands = getNavCommands(workspaceType);
  const accountCommands = getAccountCommands();
  const searchQuery = query.trim();
  const shouldSearch = commandPaletteOpen && !confirmingLogout && searchQuery !== '';
  const currentSearch = search?.query === searchQuery && search.attempt === attempt ? search : null;
  const loading = shouldSearch && currentSearch === null;
  const searchFailed = shouldSearch && currentSearch?.status === 'error';
  const results = shouldSearch && currentSearch?.status === 'success'
    ? currentSearch.results
    : EMPTY_RESULTS;

  const changeQuery = (value: string) => {
    setQuery(value);
    if (value.trim() !== searchQuery) setSearch(null);
  };
  const retrySearch = () => {
    setSearch(null);
    setAttempt((value) => value + 1);
    inputRef.current?.focus();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.isComposing && typeof e.key === 'string' && e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
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
      setSearch(null);
      setConfirmingLogout(false);
    }, 0);
    return () => clearTimeout(t);
  }, [commandPaletteOpen]);

  // Results belong to a query and attempt. While debouncing a new query, neither
  // old results nor the empty state may masquerade as the current search result.
  useEffect(() => {
    if (!shouldSearch) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const rfp = demo?.getSnapshot().deal?.rfp;
        const results = demo
          ? {
              ...EMPTY_RESULTS,
              rfps: rfp && `${rfp.title} ${rfp.code}`.includes(searchQuery)
                ? [{ code: rfp.code, title: rfp.title, memo: rfp.memo ?? '', status: rfp.status, href: `/rfp/${rfp.code}` }]
                : [],
            }
          : await searchEntitiesAction(searchQuery);
        if (!cancelled) setSearch({ query: searchQuery, attempt, status: 'success', results });
      } catch {
        if (!cancelled) setSearch({ query: searchQuery, attempt, status: 'error' });
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [searchQuery, attempt, shouldSearch, demo]);

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

  // Account commands (설정, 로그아웃) are filtered the same way as nav commands.
  const accountMatches = q
    ? accountCommands.filter((c) => {
        const label = c.label.toLowerCase();
        return label.includes(q) || getChoseong(label).includes(q);
      })
    : accountCommands;

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
    // 오픈게시판이 켜져 있을 때만 "참여 가능한 견적" 그룹을 노출한다.
    ...(OPEN_BOARD_ENABLED
      ? [
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
        ]
      : []),
  ];

  return (
    <Dialog
      open={commandPaletteOpen}
      onOpenChange={(open) => { if (!open) closeCommandPalette(); }}
    >
      <DialogContent
        aria-modal="true"
        initialFocus={inputRef}
        showCloseButton={false}
        overlayClassName="bg-black/40 dark:bg-white/10 supports-backdrop-filter:backdrop-blur-[4px] data-open:animate-none data-closed:animate-none"
        className="top-[12vh] block w-[620px] max-w-full translate-y-0 gap-0 rounded-md border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] p-0 ring-0 shadow-[var(--command-palette-shadow)] overflow-hidden sm:max-w-[620px] data-open:animate-none data-closed:animate-none"
      >
        <DialogTitle className="sr-only">검색</DialogTitle>
        <Command shouldFilter={false} label="검색어">
          <div className="flex items-center border-b border-[var(--md-sys-color-outline-variant)] px-4">
            <Command.Input
              value={query}
              onValueChange={changeQuery}
              ref={inputRef}
              className="flex-1 h-12 bg-transparent font-sans text-[14px] text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-on-surface-variant)] outline-none"
              placeholder="검색..."
            />
            <DialogClose
              // cmdk otherwise treats Enter on this button as selecting its active option.
              onKeyDown={(event) => { if (event.key === 'Enter') event.stopPropagation(); }}
              render={<IconButton label="닫기" size="sm"><XIcon size={14} /></IconButton>}
            />
          </div>
          <div role="status" className="md-label-small text-[var(--md-sys-color-on-surface-variant)]">
            {loading && <p className="px-4 py-3">불러오는 중이에요…</p>}
            {searchFailed && (
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <p>검색 결과를 불러오지 못했어요. 다시 시도해 주세요.</p>
                <Button
                  type="button"
                  size="sm"
                  variant="text"
                  onClick={retrySearch}
                  onKeyDown={(event) => { if (event.key === 'Enter') event.stopPropagation(); }}
                >
                  다시 시도
                </Button>
              </div>
            )}
          </div>
          <Command.List label="검색 결과" aria-busy={loading} className="max-h-80 overflow-y-auto py-2">
            {!loading && !searchFailed && !confirmingLogout && (
              <Command.Empty className="py-8 text-center md-label-small text-[var(--md-sys-color-on-surface-variant)]">
                결과 없음
              </Command.Empty>
            )}

            {confirmingLogout ? (
              // Logout confirmation panel — replaces the normal list to prevent
              // accidental navigation. Uses Command.Items so keyboard nav still works.
              <Command.Group
                heading={
                  <span className={HEADING_CLASS}>로그아웃할까요?</span>
                }
              >
                <Command.Item
                  value="logout-confirm"
                  onSelect={() => {
                    // GET /logout clears the session cookie and redirects to /login
                    // in a single round-trip. Must use window.location.assign (not
                    // router.push) so the Set-Cookie response chain runs correctly.
                    if (demoNavigate) { closeCommandPalette(); demoNavigate('/home'); return; }
                    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- the logout response must clear the cookie before navigation.
                    window.location.assign('/logout');
                  }}
                  className={`${ITEM_CLASS} text-[var(--md-sys-color-error)]`}
                >
                  로그아웃
                </Command.Item>
                <Command.Item
                  value="logout-cancel"
                  onSelect={() => setConfirmingLogout(false)}
                  className={ITEM_CLASS}
                >
                  취소
                </Command.Item>
              </Command.Group>
            ) : (
              <>
                {navMatches.length > 0 && (
                  <Command.Group heading={<span className={HEADING_CLASS}>이동</span>}>
                    {navMatches.map((cmd) => (
                      <Command.Item
                        key={cmd.id}
                        value={cmd.id}
                        onSelect={() => {
                          (demoNavigate ?? router.push)(cmd.href);
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
                              (demoNavigate ?? router.push)(item.href);
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
                              <span className="md-label-small text-[var(--md-sys-color-on-surface-variant)] truncate max-w-[540px]">
                                {item.sub}
                              </span>
                            )}
                          </Command.Item>
                        ))}
                      </Command.Group>
                    ),
                )}

                {accountMatches.length > 0 && (
                  <Command.Group heading={<span className={HEADING_CLASS}>계정</span>}>
                    {accountMatches.map((cmd) => (
                      <Command.Item
                        key={cmd.id}
                        value={cmd.id}
                        onSelect={() => {
                          if (cmd.kind === 'navigate') {
                            (demoNavigate ?? router.push)(cmd.href);
                            closeCommandPalette();
                          } else {
                            // kind === 'logout': show inline confirmation instead of
                            // navigating immediately, to prevent accidental sign-out.
                            // Clear the query so the debounced search short-circuits
                            // while the confirmation panel is displayed.
                            changeQuery('');
                            setConfirmingLogout(true);
                          }
                        }}
                        className={ITEM_CLASS}
                      >
                        <span>{cmd.label}</span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                )}
              </>
            )}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
