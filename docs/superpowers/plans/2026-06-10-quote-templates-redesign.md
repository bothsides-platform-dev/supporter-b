# 견적 템플릿 재배치 + 기능 개선 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PG 전용 견적 템플릿을 nav 최상위(`/quote-templates`)로 승격하고 구간 수수료 편집·목록 미리보기·복제를 추가한다.

**Architecture:** 기존 `QuoteTemplatesPanel` 단일 컴포넌트를 `QuoteTemplateList`(목록+복제·삭제 트리거) + `QuoteTemplateDrawer`(슬라이드인 편집/생성 폼)로 분리한다. EditorState를 `fees` 단일 map으로 통일해 `"method:tier"` 키로 TierRates를 직접 편집할 수 있게 한다. nav-config에서 `QUOTE_TEMPLATES_LINK`를 settings 하위에서 `top` 배열로 이동하고, 라우트는 `/quote-templates`로 변경한다.

**Tech Stack:** Next.js App Router RSC + `'use client'`, Vitest + jsdom/PGlite, shadcn Sheet(`components/ui/sheet`), lucide-react `LayoutTemplate`

---

## 파일 맵

| 경로 | 상태 | 역할 |
|---|---|---|
| `components/icons/index.tsx` | 수정 | `LayoutTemplateIcon` 추가 |
| `lib/nav/nav-config.ts` | 수정 | `QUOTE_TEMPLATES` → top, breadcrumb 업데이트 |
| `lib/nav/__tests__/nav-config.test.ts` | 수정 | 변경된 nav 동작 반영 |
| `lib/server/actions/quote-template/duplicateQuoteTemplateAction.ts` | 신규 | 복제 action |
| `lib/server/actions/quote-template/__tests__/quoteTemplateCrud.test.ts` | 수정 | 복제 테스트 추가 |
| `components/quote-templates/QuoteTemplateList.tsx` | 신규 | 목록 카드 + 복제·삭제 |
| `components/quote-templates/__tests__/QuoteTemplateList.test.tsx` | 신규 | 목록 테스트 |
| `components/quote-templates/QuoteTemplateDrawer.tsx` | 신규 | 드로어 편집기 (TierRates 포함) |
| `components/quote-templates/__tests__/QuoteTemplateDrawer.test.tsx` | 신규 | 드로어 테스트 |
| `app/(app)/quote-templates/page.tsx` | 신규 | RSC 페이지 |
| `app/(app)/settings/quote-templates/page.tsx` | **삭제** | 기존 라우트 제거 |
| `components/settings/QuoteTemplatesPanel.tsx` | **삭제** | 신규 컴포넌트로 대체 |
| `components/settings/__tests__/QuoteTemplatesPanel.test.tsx` | **삭제** | 신규 테스트로 대체 |

---

## Task 1: LayoutTemplateIcon 추가

> TDD 면제 — 순수 시각 컴포넌트.

**Files:**
- Modify: `components/icons/index.tsx`

- [ ] **Step 1: 아이콘 추가**

`components/icons/index.tsx` 파일 끝에 아래를 추가한다. (기존 `import { LayoutTemplate } from 'lucide-react'` 가 없으므로 추가)

```tsx
import { LayoutTemplate } from 'lucide-react';

export function LayoutTemplateIcon({ size = 20, ...p }: IconProps) {
  return <LayoutTemplate width={size} height={size} {...p} />;
}
```

- [ ] **Step 2: 타입체크**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm tsc --noEmit 2>&1 | grep "icons/index"
```

Expected: 출력 없음 (에러 없음)

- [ ] **Step 3: 커밋**

```bash
git add components/icons/index.tsx
git commit -m "feat(icons): LayoutTemplateIcon 추가 (lucide LayoutTemplate wrap)"
```

---

## Task 2: nav-config 업데이트

**Files:**
- Modify: `lib/nav/__tests__/nav-config.test.ts`
- Modify: `lib/nav/nav-config.ts`

- [ ] **Step 1: 실패할 테스트 작성**

`lib/nav/__tests__/nav-config.test.ts`에서 아래 4개 테스트를 수정한다.

**① top item order 테스트** (기존 line 8-21):
```ts
describe('getNavConfig — top item order', () => {
  it('pg top includes quote-templates after messages; buyer top does not', () => {
    expect(getNavConfig('buyer').top.map((i) => i.id)).toEqual([
      'home',
      'notifications',
      'messages',
    ]);
    expect(getNavConfig('pg').top.map((i) => i.id)).toEqual([
      'home',
      'notifications',
      'messages',
      'quote-templates',
    ]);
  });
});
```

**② pg quote-templates는 settings links가 아닌 top에 있는지 확인** (기존 `adds a PG-only 견적 템플릿 link` 테스트 교체):
```ts
it('PG top has 견적 템플릿 NavLeaf (g q, /quote-templates); settings has no such link', () => {
  const pgTop = getNavConfig('pg').top;
  const qt = pgTop.find((i) => i.id === 'quote-templates');
  expect(qt?.label).toBe('견적 템플릿');
  expect(qt?.href).toBe('/quote-templates');
  expect(qt?.shortcut).toEqual({ kind: 'chord', lead: 'g', key: 'q' });

  // settings links must not contain quote-templates for either workspace type
  for (const ws of ['buyer', 'pg'] as const) {
    const settings = getNavConfig(ws).sections.find((s) => s.id === 'settings');
    expect(settings?.links?.map((l) => l.href)).toEqual([
      '/settings/profile',
      '/settings/members',
    ]);
  }

  const buyerTop = getNavConfig('buyer').top;
  expect(buyerTop.some((i) => i.id === 'quote-templates')).toBe(false);
});
```

**③ getBreadcrumbSegments — 설정 sub-links 테스트** (기존 line 149-161):
```ts
it('links the 설정 parent to /settings/profile with the sub-page as the current page', () => {
  expect(getBreadcrumbSegments('/settings/profile')).toEqual([
    { label: '설정', href: '/settings/profile' },
    { label: '프로필' },
  ]);
  expect(getBreadcrumbSegments('/settings/members')).toEqual([
    { label: '설정', href: '/settings/profile' },
    { label: '멤버' },
  ]);
  // /settings/quote-templates는 삭제된 라우트 → unknown path
  expect(getBreadcrumbSegments('/settings/quote-templates')).toEqual([]);
});

it('/quote-templates maps to a single 견적 템플릿 segment', () => {
  expect(getBreadcrumbSegments('/quote-templates')).toEqual([{ label: '견적 템플릿' }]);
});
```

**④ getChordMap pg 테스트** (기존 line 200-215, `q` 값 변경):
```ts
it('routes the pg "g" chords (q → /quote-templates, not /settings/quote-templates)', () => {
  expect(getChordMap('pg')).toEqual({
    h: '/home',
    n: '/notifications',
    m: '/messages',
    q: '/quote-templates',
    i: '/inbox',
    o: '/opportunities',
    s: '/settings/profile',
    '1': '/inbox?status=new',
    '2': '/inbox?status=submitted',
    '3': '/inbox?status=closed',
    p: '/settings/profile',
    t: '/settings/members',
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test lib/nav/__tests__/nav-config.test.ts
```

Expected: 4개 테스트 FAIL

- [ ] **Step 3: nav-config.ts 구현 업데이트**

`lib/nav/nav-config.ts` 전체 교체:

```ts
import type { ComponentType, SVGProps } from 'react';
import {
  HomeIcon,
  BellIcon,
  EnvelopeIcon,
  FileTextIcon,
  InboxIcon,
  SettingsIcon,
  LayoutTemplateIcon,
} from '@/components/icons';
import type { WorkspaceType } from '@/lib/types/workspace';

export type IconComponent = ComponentType<
  SVGProps<SVGSVGElement> & { size?: number }
>;

export type NavShortcut =
  | { kind: 'chord'; lead: 'g'; key: string }
  | { kind: 'modifier'; key: string };

export type NavLeaf = {
  id: string;
  label: string;
  href: string;
  icon?: IconComponent;
  shortcut?: NavShortcut;
};

export type NavStatusItem = {
  status: string;
  label: string;
  shortcut?: NavShortcut;
};

export type NavSection = {
  id: 'rfp' | 'inbox' | 'settings';
  label: string;
  href: string;
  icon?: IconComponent;
  shortcut?: NavShortcut;
  base?: string;
  statuses?: NavStatusItem[];
  links?: NavLeaf[];
};

export type NavConfig = {
  top: NavLeaf[];
  sections: NavSection[];
};

const STATUS_LABELS = {
  '/rfp': {
    active: '진행중',
    closed: '마감',
    awarded: '선정 완료',
  },
  '/inbox': {
    new: '신규',
    submitted: '견적 보냄',
    closed: '마감',
  },
} as const;

function statusItems(base: '/rfp' | '/inbox'): NavStatusItem[] {
  return Object.entries(STATUS_LABELS[base]).map(([status, label], i) => ({
    status,
    label,
    shortcut: { kind: 'chord', lead: 'g', key: String(i + 1) },
  }));
}

const RFP_SECTION: NavSection = {
  id: 'rfp',
  label: '견적 요청',
  href: '/rfp',
  base: '/rfp',
  icon: FileTextIcon,
  shortcut: { kind: 'chord', lead: 'g', key: 'r' },
  statuses: statusItems('/rfp'),
  links: [
    {
      id: 'rfp-new',
      label: '새 견적 요청',
      href: '/rfp/new',
      shortcut: { kind: 'chord', lead: 'g', key: 'c' },
    },
  ],
};

const INBOX_SECTION: NavSection = {
  id: 'inbox',
  label: '받은 견적 요청',
  href: '/inbox',
  base: '/inbox',
  icon: InboxIcon,
  shortcut: { kind: 'chord', lead: 'g', key: 'i' },
  statuses: statusItems('/inbox'),
  links: [
    {
      id: 'opportunities',
      label: '참여 가능한 견적',
      href: '/opportunities',
      shortcut: { kind: 'chord', lead: 'g', key: 'o' },
    },
  ],
};

const SETTINGS_SECTION: NavSection = {
  id: 'settings',
  label: '설정',
  href: '/settings/profile',
  base: '/settings',
  icon: SettingsIcon,
  shortcut: { kind: 'chord', lead: 'g', key: 's' },
  links: [
    {
      id: 'settings-profile',
      label: '프로필',
      href: '/settings/profile',
      shortcut: { kind: 'chord', lead: 'g', key: 'p' },
    },
    {
      id: 'settings-members',
      label: '멤버',
      href: '/settings/members',
      shortcut: { kind: 'chord', lead: 'g', key: 't' },
    },
  ],
};

const HOME: NavLeaf = {
  id: 'home',
  label: '홈',
  href: '/home',
  icon: HomeIcon,
  shortcut: { kind: 'chord', lead: 'g', key: 'h' },
};

const NOTIFICATIONS: NavLeaf = {
  id: 'notifications',
  label: '알림',
  href: '/notifications',
  icon: BellIcon,
  shortcut: { kind: 'chord', lead: 'g', key: 'n' },
};

const MESSAGES: NavLeaf = {
  id: 'messages',
  label: '메시지',
  href: '/messages',
  icon: EnvelopeIcon,
  shortcut: { kind: 'chord', lead: 'g', key: 'm' },
};

// 견적 템플릿은 PG 전용 — top 배열에 추가해 홈·알림·메시지와 같은 레이어로 노출.
const QUOTE_TEMPLATES: NavLeaf = {
  id: 'quote-templates',
  label: '견적 템플릿',
  href: '/quote-templates',
  icon: LayoutTemplateIcon,
  shortcut: { kind: 'chord', lead: 'g', key: 'q' },
};

export function getNavConfig(workspaceType: WorkspaceType): NavConfig {
  const workspaceSection = workspaceType === 'buyer' ? RFP_SECTION : INBOX_SECTION;
  const top: NavLeaf[] =
    workspaceType === 'pg'
      ? [HOME, NOTIFICATIONS, MESSAGES, QUOTE_TEMPLATES]
      : [HOME, NOTIFICATIONS, MESSAGES];

  return {
    top,
    sections: [workspaceSection, SETTINGS_SECTION],
  };
}

export type NavCommand = {
  id: string;
  label: string;
  href: string;
  shortcut?: NavShortcut;
};

export function getNavCommands(workspaceType: WorkspaceType): NavCommand[] {
  const { top, sections } = getNavConfig(workspaceType);
  const out: NavCommand[] = [];
  const seen = new Set<string>();
  const push = (cmd: NavCommand) => {
    if (seen.has(cmd.href)) return;
    seen.add(cmd.href);
    out.push(cmd);
  };

  for (const item of top) {
    push({ id: item.id, label: item.label, href: item.href, shortcut: item.shortcut });
  }

  for (const section of sections) {
    const linkHrefs = new Set((section.links ?? []).map((l) => l.href));
    if (!linkHrefs.has(section.href)) {
      push({
        id: section.id,
        label: section.label,
        href: section.href,
        shortcut: section.shortcut,
      });
    }
    for (const s of section.statuses ?? []) {
      push({
        id: `${section.id}-${s.status}`,
        label: `${section.label} · ${s.label}`,
        href: `${section.base}?status=${s.status}`,
        shortcut: s.shortcut,
      });
    }
    for (const link of section.links ?? []) {
      push({ id: link.id, label: link.label, href: link.href, shortcut: link.shortcut });
    }
  }

  return out;
}

export type BreadcrumbSegment = { label: string; href?: string };

export function getBreadcrumbSegments(
  pathname: string,
  status?: string | null,
): BreadcrumbSegment[] {
  if (pathname === '/home') return [{ label: '홈' }];
  if (pathname === '/notifications') return [{ label: '알림' }];
  if (pathname === '/messages') return [{ label: '메시지' }];
  if (pathname === '/quote-templates') return [{ label: '견적 템플릿' }];
  if (pathname === '/opportunities') return [{ label: '참여 가능한 견적' }];
  if (pathname === '/rfp/new') {
    return [{ label: '견적 요청', href: '/rfp' }, { label: '새 견적 요청' }];
  }
  if (pathname === '/rfp') {
    const label = status ? STATUS_LABELS['/rfp'][status as keyof typeof STATUS_LABELS['/rfp']] : undefined;
    return label ? [{ label: '견적 요청', href: '/rfp' }, { label }] : [{ label: '견적 요청' }];
  }
  if (pathname === '/inbox') {
    const label = status ? STATUS_LABELS['/inbox'][status as keyof typeof STATUS_LABELS['/inbox']] : undefined;
    return label ? [{ label: '받은 견적 요청', href: '/inbox' }, { label }] : [{ label: '받은 견적 요청' }];
  }
  if (pathname === '/settings/profile') {
    return [{ label: '설정', href: '/settings/profile' }, { label: '프로필' }];
  }
  if (pathname === '/settings/members') {
    return [{ label: '설정', href: '/settings/profile' }, { label: '멤버' }];
  }
  return [];
}

export function getChordMap(workspaceType: WorkspaceType): Record<string, string> {
  const { top, sections } = getNavConfig(workspaceType);
  const map: Record<string, string> = {};
  for (const item of [...top, ...sections]) {
    if (item.shortcut?.kind === 'chord') map[item.shortcut.key] = item.href;
  }
  for (const section of sections) {
    for (const link of section.links ?? []) {
      if (link.shortcut?.kind === 'chord') map[link.shortcut.key] = link.href;
    }
    for (const s of section.statuses ?? []) {
      if (s.shortcut?.kind === 'chord') {
        map[s.shortcut.key] = `${section.base}?status=${s.status}`;
      }
    }
  }
  return map;
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test lib/nav/__tests__/nav-config.test.ts
```

Expected: 전체 PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/nav/nav-config.ts lib/nav/__tests__/nav-config.test.ts
git commit -m "feat(nav): 견적 템플릿 nav top 승격 + URL /quote-templates 변경"
```

---

## Task 3: duplicateQuoteTemplateAction

**Files:**
- Create: `lib/server/actions/quote-template/duplicateQuoteTemplateAction.ts`
- Modify: `lib/server/actions/quote-template/__tests__/quoteTemplateCrud.test.ts`

- [ ] **Step 1: 실패할 테스트 추가**

`lib/server/actions/quote-template/__tests__/quoteTemplateCrud.test.ts` 파일에서 기존 import 블록 끝에 아래를 추가한다.

```ts
import { duplicateQuoteTemplateAction } from '../duplicateQuoteTemplateAction';
```

그리고 파일 끝에 describe 블록을 추가한다.

```ts
describe('duplicateQuoteTemplateAction', () => {
  beforeEach(async () => {
    ({ db } = await setupRfpActionEnv());
  });
  afterEach(teardownRfpActionEnv);

  it('원본 템플릿을 "이름 복제"로 복사하고 원본은 유지된다', async () => {
    const { user, ws } = await setupPg();
    sessionRef.value = { user: { id: user.id, email: user.email, workspaceId: ws.id, workspaceType: 'pg', role: 'admin' } };

    const created = await saveQuoteTemplateAction(VALID);
    assert(created.ok);

    const duped = await duplicateQuoteTemplateAction({ templateId: created.templateId });
    expect(duped.ok).toBe(true);
    assert(duped.ok);
    expect(duped.templateId).not.toBe(created.templateId);

    const repo = await getBidQuoteTemplateRepo();
    const all = await repo.listByWorkspace(ws.id);
    expect(all).toHaveLength(2);
    expect(all.map((t) => t.name).sort()).toEqual(['표준 요율', '표준 요율 복제'].sort());
    // 원본 데이터 동일 확인
    const dup = all.find((t) => t.name === '표준 요율 복제')!;
    expect(dup.settleCycle).toBe(VALID.settleCycle);
    expect(dup.settleLimit).toBe(VALID.settleLimit);
  });

  it('20개 한도 초과 시 LIMIT_REACHED 반환', async () => {
    const { user, ws } = await setupPg();
    sessionRef.value = { user: { id: user.id, email: user.email, workspaceId: ws.id, workspaceType: 'pg', role: 'admin' } };

    // 20개 채우기
    let lastId = '';
    for (let i = 0; i < 20; i++) {
      const r = await saveQuoteTemplateAction({ ...VALID, name: `t${i}` });
      assert(r.ok);
      lastId = r.templateId;
    }
    const r = await duplicateQuoteTemplateAction({ templateId: lastId });
    expect(r.ok).toBe(false);
    assert(!r.ok);
    expect(r.error).toBe('LIMIT_REACHED');
  });

  it('다른 워크스페이스 템플릿 복제 시 FORBIDDEN', async () => {
    const { user: u1, ws: ws1 } = await setupPg('pg-a.com');
    sessionRef.value = { user: { id: u1.id, email: u1.email, workspaceId: ws1.id, workspaceType: 'pg', role: 'admin' } };
    const r = await saveQuoteTemplateAction(VALID);
    assert(r.ok);
    const otherTemplateId = r.templateId;

    const { user: u2, ws: ws2 } = await setupPg('pg-b.com');
    sessionRef.value = { user: { id: u2.id, email: u2.email, workspaceId: ws2.id, workspaceType: 'pg', role: 'admin' } };
    const duped = await duplicateQuoteTemplateAction({ templateId: otherTemplateId });
    expect(duped.ok).toBe(false);
    assert(!duped.ok);
    expect(duped.error).toBe('FORBIDDEN');
  });
});
```

파일 상단에 아래를 추가한다 (assert 유틸이 없으면):
```ts
import { strict as assert } from 'node:assert';
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test lib/server/actions/quote-template/__tests__/quoteTemplateCrud.test.ts
```

Expected: `duplicateQuoteTemplateAction` 관련 3개 테스트 FAIL (모듈 없음)

- [ ] **Step 3: duplicateQuoteTemplateAction 구현**

`lib/server/actions/quote-template/duplicateQuoteTemplateAction.ts` 신규 생성:

```ts
'use server';

import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import { getBidQuoteTemplateRepo } from '@/lib/server/repositories/factory';
import {
  type QuoteActionResult,
  requireOwnedQuoteTemplate,
  requirePgWorkspace,
} from './_shared';

const Input = z.object({ templateId: z.string().uuid() }).strict();

export type DuplicateQuoteTemplateInput = z.infer<typeof Input>;
export type DuplicateQuoteTemplateResult = QuoteActionResult<{ templateId: string }>;

const MAX_TEMPLATES = 20;

export async function duplicateQuoteTemplateAction(
  input: DuplicateQuoteTemplateInput,
): Promise<DuplicateQuoteTemplateResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const owned = await requireOwnedQuoteTemplate(parsed.data.templateId);
  if (!owned.ok) return owned;

  const ws = await requirePgWorkspace();
  if (!ws.ok) return ws;

  const repo = await getBidQuoteTemplateRepo();
  const existing = await repo.listByWorkspace(owned.workspaceId);
  if (existing.length >= MAX_TEMPLATES) return { ok: false, error: 'LIMIT_REACHED' };

  const { template } = owned;
  const newId = randomUUID();
  await repo.create({
    id: newId,
    pgWsId: owned.workspaceId,
    name: `${template.name} 복제`,
    settleCycle: template.settleCycle,
    settleLimit: template.settleLimit,
    guaranteeInsurance: template.guaranteeInsurance,
    paymentFees: { ...template.paymentFees },
    createdBy: ws.userId,
  });

  return { ok: true, templateId: newId };
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test lib/server/actions/quote-template/__tests__/quoteTemplateCrud.test.ts
```

Expected: 전체 PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/server/actions/quote-template/duplicateQuoteTemplateAction.ts \
        lib/server/actions/quote-template/__tests__/quoteTemplateCrud.test.ts
git commit -m "feat(quote-template): duplicateQuoteTemplateAction 추가 (복제 기능)"
```

---

## Task 4: QuoteTemplateList 컴포넌트

**Files:**
- Create: `components/quote-templates/__tests__/QuoteTemplateList.test.tsx`
- Create: `components/quote-templates/QuoteTemplateList.tsx`

- [ ] **Step 1: 실패할 테스트 작성**

`components/quote-templates/__tests__/QuoteTemplateList.test.tsx` 신규 생성:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { QuoteTemplateOption } from '@/lib/types/bid';

const deleteMock = vi.fn(async () => ({ ok: true as const }));
const duplicateMock = vi.fn(async () => ({ ok: true as const, templateId: 'dup-id' }));
vi.mock('@/lib/server/actions/quote-template/deleteQuoteTemplateAction', () => ({
  deleteQuoteTemplateAction: (i: unknown) => deleteMock(i),
}));
vi.mock('@/lib/server/actions/quote-template/duplicateQuoteTemplateAction', () => ({
  duplicateQuoteTemplateAction: (i: unknown) => duplicateMock(i),
}));

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

// QuoteTemplateDrawer는 별도 테스트 — 여기서는 열리는지만 확인
vi.mock('@/components/quote-templates/QuoteTemplateDrawer', () => ({
  QuoteTemplateDrawer: ({ open, template }: { open: boolean; template: QuoteTemplateOption | null }) =>
    open ? (
      <div data-testid="drawer-open">{template ? `편집:${template.name}` : '신규'}</div>
    ) : null,
}));

import { QuoteTemplateList } from '../QuoteTemplateList';

const tmpl = (over: Partial<QuoteTemplateOption> = {}): QuoteTemplateOption => ({
  id: 't1',
  name: '표준 요율',
  settleCycle: 'D+1',
  settleLimit: 5_000_000,
  guaranteeInsurance: 0,
  paymentFees: { card: 0.0125, virtual_account: 0.005 },
  ...over,
});

beforeEach(() => { deleteMock.mockClear(); duplicateMock.mockClear(); refresh.mockClear(); });
afterEach(cleanup);

describe('QuoteTemplateList', () => {
  it('빈 목록이면 빈 상태 안내를 보여준다', () => {
    render(<QuoteTemplateList initialTemplates={[]} workspaceName="테스트" />);
    expect(screen.getByText(/저장된 템플릿이 없어요/)).toBeInTheDocument();
  });

  it('템플릿 이름·정산주기·한도를 목록에 표시한다', () => {
    render(<QuoteTemplateList initialTemplates={[tmpl()]} workspaceName="테스트" />);
    expect(screen.getByText('표준 요율')).toBeInTheDocument();
    expect(screen.getByText(/D\+1/)).toBeInTheDocument();
    expect(screen.getByText(/5,000,000/)).toBeInTheDocument();
  });

  it('단일요율 수단은 "카드 1.25%" chip으로 표시한다', () => {
    render(<QuoteTemplateList initialTemplates={[tmpl({ paymentFees: { card: 0.0125 } })]} />);
    expect(screen.getByText('카드 1.25%')).toBeInTheDocument();
  });

  it('구간요율 수단은 "카드 구간별" chip으로 표시한다', () => {
    render(
      <QuoteTemplateList
        initialTemplates={[tmpl({ paymentFees: { card: { sole: 0.008, general: 0.0195 } } })]}
      />,
    );
    expect(screen.getByText('카드 구간별')).toBeInTheDocument();
  });

  it('chip이 4개를 초과하면 +N 표시', () => {
    render(
      <QuoteTemplateList
        initialTemplates={[
          tmpl({
            paymentFees: {
              card: 0.0125,
              overseas_card: 0.018,
              virtual_account: 0.005,
              bank_transfer: 0.004,
              naver_pay: 0.015,
            },
          }),
        ]}
      />,
    );
    expect(screen.getByText('+1')).toBeInTheDocument();
  });

  it('"새 템플릿" 버튼 클릭 시 드로어가 신규 모드로 열린다', async () => {
    const user = userEvent.setup();
    render(<QuoteTemplateList initialTemplates={[]} />);
    await user.click(screen.getByRole('button', { name: /새 템플릿/ }));
    expect(screen.getByTestId('drawer-open')).toHaveTextContent('신규');
  });

  it('"편집" 버튼 클릭 시 드로어가 해당 템플릿으로 열린다', async () => {
    const user = userEvent.setup();
    render(<QuoteTemplateList initialTemplates={[tmpl()]} />);
    await user.click(screen.getByRole('button', { name: '편집' }));
    expect(screen.getByTestId('drawer-open')).toHaveTextContent('편집:표준 요율');
  });

  it('"복제" 버튼 클릭 시 duplicateQuoteTemplateAction 호출 후 router.refresh', async () => {
    const user = userEvent.setup();
    render(<QuoteTemplateList initialTemplates={[tmpl({ id: 'abc' })]} />);
    await user.click(screen.getByRole('button', { name: '복제' }));
    await waitFor(() => expect(duplicateMock).toHaveBeenCalledWith({ templateId: 'abc' }));
    expect(refresh).toHaveBeenCalled();
  });

  it('"삭제" 버튼 → 확인 다이얼로그 → 삭제 확인 시 deleteQuoteTemplateAction 호출', async () => {
    const user = userEvent.setup();
    render(<QuoteTemplateList initialTemplates={[tmpl({ id: 'del-id' })]} />);
    await user.click(screen.getByRole('button', { name: '삭제' }));
    // ConfirmDialog 확인 버튼
    const confirmBtn = await screen.findByRole('button', { name: /삭제할게요/ });
    await user.click(confirmBtn);
    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith({ templateId: 'del-id' }));
    expect(refresh).toHaveBeenCalled();
  });

  it('템플릿 수를 "N / 20개"로 표시한다', () => {
    render(<QuoteTemplateList initialTemplates={[tmpl()]} />);
    expect(screen.getByText('1 / 20개')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test components/quote-templates/__tests__/QuoteTemplateList.test.tsx
```

Expected: FAIL (모듈 없음)

- [ ] **Step 3: QuoteTemplateList 구현**

`components/quote-templates/QuoteTemplateList.tsx` 신규 생성:

```tsx
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/primitives/Button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { deleteQuoteTemplateAction } from '@/lib/server/actions/quote-template/deleteQuoteTemplateAction';
import { duplicateQuoteTemplateAction } from '@/lib/server/actions/quote-template/duplicateQuoteTemplateAction';
import {
  PAYMENT_METHOD_LABELS,
  isTieredMethod,
  type PaymentMethod,
} from '@/lib/types/bid';
import type { QuoteTemplateOption } from '@/lib/types/bid';
import { QuoteTemplateDrawer } from './QuoteTemplateDrawer';

const MAX_CHIPS = 4;

function buildChips(paymentFees: QuoteTemplateOption['paymentFees']): { label: string; overflow: number } {
  const chips: string[] = [];
  const methods = Object.keys(paymentFees) as PaymentMethod[];
  let total = 0;
  for (const m of methods) {
    const val = paymentFees[m];
    if (val === undefined) continue;
    total++;
    if (chips.length >= MAX_CHIPS) continue;
    const label = PAYMENT_METHOD_LABELS[m];
    if (isTieredMethod(m)) {
      chips.push(`${label} 구간별`);
    } else if (typeof val === 'number') {
      const pct = Math.round(val * 1e6) / 1e4;
      chips.push(`${label} ${pct}%`);
    }
  }
  return { label: chips.join(''), overflow: Math.max(0, total - MAX_CHIPS) };
}

// visible chips array helper
function getChips(paymentFees: QuoteTemplateOption['paymentFees']): string[] {
  const chips: string[] = [];
  const methods = Object.keys(paymentFees) as PaymentMethod[];
  let shown = 0;
  for (const m of methods) {
    if (shown >= MAX_CHIPS) break;
    const val = paymentFees[m];
    if (val === undefined) continue;
    const label = PAYMENT_METHOD_LABELS[m];
    if (isTieredMethod(m)) {
      chips.push(`${label} 구간별`);
      shown++;
    } else if (typeof val === 'number') {
      const pct = Math.round(val * 1e6) / 1e4;
      chips.push(`${label} ${pct}%`);
      shown++;
    }
  }
  return chips;
}

function countFees(paymentFees: QuoteTemplateOption['paymentFees']): number {
  return (Object.keys(paymentFees) as PaymentMethod[]).filter((m) => paymentFees[m] !== undefined).length;
}

export function QuoteTemplateList({
  initialTemplates,
  workspaceName,
}: {
  initialTemplates: QuoteTemplateOption[];
  workspaceName?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [deleteTarget, setDeleteTarget] = useState<QuoteTemplateOption | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTemplate, setDrawerTemplate] = useState<QuoteTemplateOption | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openNew = () => {
    setDrawerTemplate(null);
    setDrawerOpen(true);
  };

  const openEdit = (t: QuoteTemplateOption) => {
    setDrawerTemplate(t);
    setDrawerOpen(true);
  };

  const handleDuplicate = (t: QuoteTemplateOption) => {
    setError(null);
    startTransition(async () => {
      const r = await duplicateQuoteTemplateAction({ templateId: t.id });
      if (r.ok) router.refresh();
      else setError(r.error);
    });
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    const templateId = deleteTarget.id;
    startTransition(async () => {
      const r = await deleteQuoteTemplateAction({ templateId });
      setDeleteTarget(null);
      if (r.ok) router.refresh();
      else setError(r.error);
    });
  };

  return (
    <div className="space-y-8">
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="템플릿을 삭제할까요?"
        description={`"${deleteTarget?.name ?? ''}" 템플릿이 영구히 삭제돼요.`}
        confirmLabel="삭제할게요"
        variant="danger"
        onConfirm={handleDelete}
        loading={pending}
      />

      <QuoteTemplateDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        template={drawerTemplate}
        onSaved={() => { setDrawerOpen(false); router.refresh(); }}
      />

      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-[20px] font-[700] tracking-[-0.02em] text-[var(--md-sys-color-on-surface)]">
            견적 템플릿
          </h1>
          <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
            자주 쓰는 정산조건과 수수료율을 저장해 두고, 견적 작성 시 한 번에 불러와요
            {workspaceName ? ` · ${workspaceName}` : ''}.
          </p>
        </div>
        <Button type="button" size="sm" variant="outlined" onClick={openNew}>
          새 템플릿
        </Button>
      </header>

      {error && (
        <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--md-sys-color-error)]">
          {error}
        </p>
      )}

      {initialTemplates.length === 0 ? (
        <p className="text-[13px] text-[var(--md-sys-color-on-surface-variant)]">
          아직 저장된 템플릿이 없어요. 새 템플릿을 만들어 보세요.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--md-sys-color-outline-variant)] border-y border-[var(--md-sys-color-outline-variant)]">
          {initialTemplates.map((t) => {
            const chips = getChips(t.paymentFees);
            const total = countFees(t.paymentFees);
            const overflow = Math.max(0, total - MAX_CHIPS);
            return (
              <li key={t.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0 space-y-1">
                  <p className="text-[14px] font-[600] text-[var(--md-sys-color-on-surface)] truncate">
                    {t.name}
                  </p>
                  <p className="font-mono text-[11px] text-[var(--md-sys-color-outline)] md-numeric">
                    정산 {t.settleCycle}
                    {t.settleLimit > 0
                      ? ` · 한도 ${t.settleLimit.toLocaleString('ko-KR')}원`
                      : ''}
                  </p>
                  {chips.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {chips.map((chip) => (
                        <span
                          key={chip}
                          className="font-mono text-[10px] bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)] px-1.5 py-0.5 rounded-[3px]"
                        >
                          {chip}
                        </span>
                      ))}
                      {overflow > 0 && (
                        <span className="font-mono text-[10px] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface-variant)] px-1.5 py-0.5 rounded-[3px]">
                          +{overflow}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button type="button" size="sm" variant="text" onClick={() => openEdit(t)}>
                    편집
                  </Button>
                  <Button type="button" size="sm" variant="text" onClick={() => handleDuplicate(t)}>
                    복제
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="text"
                    color="error"
                    onClick={() => setDeleteTarget(t)}
                  >
                    삭제
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="font-mono text-[11px] text-[var(--md-sys-color-outline)] md-numeric">
        {initialTemplates.length} / 20개
      </p>
    </div>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test components/quote-templates/__tests__/QuoteTemplateList.test.tsx
```

Expected: 전체 PASS

- [ ] **Step 5: 커밋**

```bash
git add components/quote-templates/
git commit -m "feat(quote-templates): QuoteTemplateList 컴포넌트 (chip 미리보기·복제·삭제)"
```

---

## Task 5: QuoteTemplateDrawer 컴포넌트

**Files:**
- Create: `components/quote-templates/__tests__/QuoteTemplateDrawer.test.tsx`
- Create: `components/quote-templates/QuoteTemplateDrawer.tsx`

- [ ] **Step 1: 실패할 테스트 작성**

`components/quote-templates/__tests__/QuoteTemplateDrawer.test.tsx` 신규 생성:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { QuoteTemplateOption } from '@/lib/types/bid';

const saveMock = vi.fn(async () => ({ ok: true as const, templateId: 'new-id' }));
vi.mock('@/lib/server/actions/quote-template/saveQuoteTemplateAction', () => ({
  saveQuoteTemplateAction: (i: unknown) => saveMock(i),
}));

beforeEach(() => saveMock.mockClear());
afterEach(cleanup);

import { QuoteTemplateDrawer } from '../QuoteTemplateDrawer';

const onClose = vi.fn();
const onSaved = vi.fn();

const tieredTmpl: QuoteTemplateOption = {
  id: 't1',
  name: '구간 요율',
  settleCycle: 'D+1',
  settleLimit: 0,
  guaranteeInsurance: 0,
  paymentFees: {
    card: { sole: 0.008, sme1: 0.011, sme2: 0.0125, sme3: 0.015, general: 0.0195 },
  },
};

describe('QuoteTemplateDrawer', () => {
  it('open=false면 드로어가 렌더되지 않는다', () => {
    render(<QuoteTemplateDrawer open={false} onClose={onClose} onSaved={onSaved} template={null} />);
    expect(screen.queryByText('새 템플릿')).toBeNull();
  });

  it('open=true이고 template=null이면 "새 템플릿" 타이틀과 빈 폼을 보여준다', () => {
    render(<QuoteTemplateDrawer open={true} onClose={onClose} onSaved={onSaved} template={null} />);
    expect(screen.getByText('새 템플릿')).toBeInTheDocument();
    const nameInput = screen.getByPlaceholderText('템플릿 이름');
    expect((nameInput as HTMLInputElement).value).toBe('');
  });

  it('template이 있으면 "템플릿 편집" 타이틀로 폼에 기존 값을 채운다', () => {
    const t: QuoteTemplateOption = {
      id: 't2', name: '표준 요율', settleCycle: 'M+2',
      settleLimit: 1_000_000, guaranteeInsurance: 500_000,
      paymentFees: { overseas_card: 0.018 },
    };
    render(<QuoteTemplateDrawer open={true} onClose={onClose} onSaved={onSaved} template={t} />);
    expect(screen.getByText('템플릿 편집')).toBeInTheDocument();
    expect((screen.getByPlaceholderText('템플릿 이름') as HTMLInputElement).value).toBe('표준 요율');
  });

  it('TierRates 수단(카드)은 5개 구간 입력란을 보여준다', () => {
    render(<QuoteTemplateDrawer open={true} onClose={onClose} onSaved={onSaved} template={tieredTmpl} />);
    // 영세/중소1/중소2/중소3/일반 라벨 확인
    expect(screen.getByText('영세')).toBeInTheDocument();
    expect(screen.getByText('중소1')).toBeInTheDocument();
    expect(screen.getByText('일반')).toBeInTheDocument();
  });

  it('TierRates 수단에 기존값이 채워진다', () => {
    render(<QuoteTemplateDrawer open={true} onClose={onClose} onSaved={onSaved} template={tieredTmpl} />);
    // sole → 0.008 → display 0.8 (%)
    const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[];
    const soleInput = inputs.find((i) => i.value === '0.8');
    expect(soleInput).toBeTruthy();
  });

  it('이름 입력 후 저장 버튼 클릭 시 saveQuoteTemplateAction을 id 없이 호출한다', async () => {
    const user = userEvent.setup();
    render(<QuoteTemplateDrawer open={true} onClose={onClose} onSaved={onSaved} template={null} />);
    await user.type(screen.getByPlaceholderText('템플릿 이름'), '신규 요율');
    await user.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(saveMock).toHaveBeenCalled());
    const call = saveMock.mock.calls[0][0] as { name: string; id?: string };
    expect(call.name).toBe('신규 요율');
    expect(call.id).toBeUndefined();
  });

  it('편집 시 저장 버튼 클릭 시 id를 포함해 saveQuoteTemplateAction을 호출한다', async () => {
    const user = userEvent.setup();
    const t: QuoteTemplateOption = {
      id: 'edit-id', name: '기존 요율', settleCycle: 'D+1',
      settleLimit: 0, guaranteeInsurance: 0, paymentFees: {},
    };
    render(<QuoteTemplateDrawer open={true} onClose={onClose} onSaved={onSaved} template={t} />);
    await user.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(saveMock).toHaveBeenCalled());
    const call = saveMock.mock.calls[0][0] as { id: string };
    expect(call.id).toBe('edit-id');
  });

  it('저장 성공 시 onSaved를 호출한다', async () => {
    const user = userEvent.setup();
    render(<QuoteTemplateDrawer open={true} onClose={onClose} onSaved={onSaved} template={null} />);
    await user.type(screen.getByPlaceholderText('템플릿 이름'), '테스트');
    await user.click(screen.getByRole('button', { name: '저장' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it('취소 버튼 클릭 시 onClose를 호출한다', async () => {
    const user = userEvent.setup();
    render(<QuoteTemplateDrawer open={true} onClose={onClose} onSaved={onSaved} template={null} />);
    await user.click(screen.getByRole('button', { name: '취소' }));
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test components/quote-templates/__tests__/QuoteTemplateDrawer.test.tsx
```

Expected: FAIL (모듈 없음)

- [ ] **Step 3: QuoteTemplateDrawer 구현**

`components/quote-templates/QuoteTemplateDrawer.tsx` 신규 생성:

```tsx
'use client';

import { useState, useTransition, useEffect } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/primitives/Button';
import { Label } from '@/components/primitives/Label';
import { Select } from '@/components/primitives/Select';
import { CurrencyInput, PercentInput, numericInputClass, underlineInputClass } from '@/components/forms/inputs';
import { saveQuoteTemplateAction } from '@/lib/server/actions/quote-template/saveQuoteTemplateAction';
import {
  PAYMENT_METHOD_CATEGORIES,
  PAYMENT_METHOD_LABELS,
  MERCHANT_TIERS,
  MERCHANT_TIER_LABELS,
  isTieredMethod,
  type PaymentMethod,
  type TierRates,
} from '@/lib/types/bid';
import type { QuoteTemplateOption } from '@/lib/types/bid';
import { cn } from '@/lib/utils';

const ALL_PAYMENT_METHODS: PaymentMethod[] = PAYMENT_METHOD_CATEGORIES.flatMap((c) => c.methods);

const CYCLE_UNITS = [
  { value: 'D', label: 'D+' },
  { value: 'W', label: 'W+' },
  { value: 'M', label: 'M+' },
] as const;

const ERROR_LABELS: Record<string, string> = {
  INVALID_INPUT: '입력 값을 확인해주세요.',
  LIMIT_REACHED: '템플릿은 최대 20개까지 저장할 수 있어요.',
  FORBIDDEN: '권한이 없습니다.',
  TEMPLATE_NOT_FOUND: '템플릿을 찾을 수 없습니다.',
};

type EditorState = {
  id?: string;
  name: string;
  cycleUnit: 'D' | 'W' | 'M';
  cycleNum: string;
  settleLimit: string;
  guaranteeInsurance: string;
  // "card" → "1.25" (단일요율 %), "card:sole" → "0.8" (구간요율 %)
  fees: Record<string, string>;
};

const fmtPct = (rate: number) => String(Math.round(rate * 1e6) / 1e4);

function blankEditor(): EditorState {
  return { name: '', cycleUnit: 'D', cycleNum: '1', settleLimit: '0', guaranteeInsurance: '0', fees: {} };
}

function editorFromTemplate(t: QuoteTemplateOption): EditorState {
  const m = /^([DWM])\+(\d+)$/.exec(t.settleCycle);
  const fees: Record<string, string> = {};
  for (const method of ALL_PAYMENT_METHODS) {
    const stored = t.paymentFees[method];
    if (stored === undefined) continue;
    if (typeof stored === 'object') {
      for (const tier of MERCHANT_TIERS) {
        const r = stored[tier];
        if (r !== undefined) fees[`${method}:${tier}`] = fmtPct(r);
      }
    } else {
      fees[method] = fmtPct(stored);
    }
  }
  return {
    id: t.id,
    name: t.name,
    cycleUnit: (m?.[1] ?? 'D') as 'D' | 'W' | 'M',
    cycleNum: m?.[2] ?? '1',
    settleLimit: String(t.settleLimit),
    guaranteeInsurance: String(t.guaranteeInsurance),
    fees,
  };
}

function buildPaymentFees(fees: Record<string, string>): Partial<Record<PaymentMethod, number | TierRates>> {
  const result: Partial<Record<PaymentMethod, number | TierRates>> = {};
  for (const method of ALL_PAYMENT_METHODS) {
    if (isTieredMethod(method)) {
      const tierRates: TierRates = {};
      let hasAny = false;
      for (const tier of MERCHANT_TIERS) {
        const v = fees[`${method}:${tier}`];
        if (v && v !== '') {
          tierRates[tier] = parseFloat(v) / 100;
          hasAny = true;
        }
      }
      if (hasAny) result[method] = tierRates;
    } else {
      const v = fees[method] ?? '';
      if (v !== '') result[method] = parseFloat(v) / 100;
    }
  }
  return result;
}

export function QuoteTemplateDrawer({
  open,
  onClose,
  template,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  template: QuoteTemplateOption | null;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [editor, setEditor] = useState<EditorState>(blankEditor);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setEditor(template ? editorFromTemplate(template) : blankEditor());
    }
  }, [open, template]);

  const setField = <K extends keyof EditorState>(key: K, value: EditorState[K]) =>
    setEditor((e) => ({ ...e, [key]: value }));

  const setFee = (key: string, value: string) =>
    setEditor((e) => ({ ...e, fees: { ...e.fees, [key]: value } }));

  const handleSave = () => {
    const name = editor.name.trim();
    if (!name) return;
    setError(null);

    const settleCycle = `${editor.cycleUnit}+${editor.cycleNum || '1'}`;
    const paymentFees = buildPaymentFees(editor.fees);
    const base = {
      name,
      settleCycle,
      settleLimit: parseInt(editor.settleLimit) || 0,
      guaranteeInsurance: parseInt(editor.guaranteeInsurance) || 0,
      paymentFees,
    };

    startTransition(async () => {
      const r = await saveQuoteTemplateAction(editor.id ? { id: editor.id, ...base } : base);
      if (r.ok) onSaved();
      else setError(r.error);
    });
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-[480px] max-w-full flex flex-col p-0">
        <SheetHeader className="px-5 py-4 border-b border-[var(--md-sys-color-outline-variant)]">
          <SheetTitle className="text-[14px] font-[600]">
            {template ? '템플릿 편집' : '새 템플릿'}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          {error && (
            <p className="font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--md-sys-color-error)]">
              {ERROR_LABELS[error] ?? error}
            </p>
          )}

          <div className="space-y-1">
            <Label size="md" muted={false}>템플릿 이름 *</Label>
            <input
              value={editor.name}
              onChange={(e) => setField('name', e.target.value)}
              placeholder="템플릿 이름"
              maxLength={80}
              className={cn(underlineInputClass)}
            />
          </div>

          <div className="space-y-1">
            <Label size="md" muted={false}>정산 주기 *</Label>
            <div className="flex items-end gap-2">
              <div className="w-28">
                <Select
                  options={CYCLE_UNITS.map((u) => ({ value: u.value, label: u.label }))}
                  value={editor.cycleUnit}
                  onChange={(v) => setField('cycleUnit', v as 'D' | 'W' | 'M')}
                />
              </div>
              <input
                type="number"
                min="1"
                max="99"
                value={editor.cycleNum}
                onChange={(e) => setField('cycleNum', e.target.value)}
                placeholder="1"
                className={cn(numericInputClass, 'flex-1')}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-5">
            <CurrencyInput
              label="정산한도 (원/월)"
              value={editor.settleLimit}
              onChange={(v) => setField('settleLimit', v)}
              placeholder="0"
            />
            <CurrencyInput
              label="월 보증보험 (원/연)"
              value={editor.guaranteeInsurance}
              onChange={(v) => setField('guaranteeInsurance', v)}
              placeholder="0"
            />
          </div>

          <div className="space-y-4">
            <span className="font-mono text-[11px] tracking-[0.16em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
              결제수단별 수수료
            </span>

            <div className="space-y-4">
              {ALL_PAYMENT_METHODS.map((m) =>
                isTieredMethod(m) ? (
                  <div key={m} className="border border-[var(--md-sys-color-outline-variant)] rounded-[6px] p-4 space-y-3">
                    <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--md-sys-color-on-surface-variant)]">
                      {PAYMENT_METHOD_LABELS[m]} 수수료 (구간별)
                    </span>
                    <div className="grid grid-cols-5 gap-2">
                      {MERCHANT_TIERS.map((tier) => (
                        <div key={tier} className="space-y-1">
                          <div className="text-[9px] text-[var(--md-sys-color-on-surface-variant)] text-center">
                            {MERCHANT_TIER_LABELS[tier]}
                          </div>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="100"
                            value={editor.fees[`${m}:${tier}`] ?? ''}
                            onChange={(e) => setFee(`${m}:${tier}`, e.target.value)}
                            placeholder="0"
                            className={cn(numericInputClass, 'text-center')}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div key={m} className="w-1/2 pr-3">
                    <PercentInput
                      label={`${PAYMENT_METHOD_LABELS[m]} 수수료`}
                      value={editor.fees[m] ?? ''}
                      onChange={(v) => setFee(m, v)}
                    />
                  </div>
                ),
              )}
            </div>
          </div>
        </div>

        <SheetFooter className="px-5 py-4 border-t border-[var(--md-sys-color-outline-variant)] flex gap-2">
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={!editor.name.trim() || pending}
          >
            저장
          </Button>
          <Button type="button" size="sm" variant="text" onClick={onClose}>
            취소
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test components/quote-templates/__tests__/QuoteTemplateDrawer.test.tsx
```

Expected: 전체 PASS

- [ ] **Step 5: 커밋**

```bash
git add components/quote-templates/QuoteTemplateDrawer.tsx \
        components/quote-templates/__tests__/QuoteTemplateDrawer.test.tsx
git commit -m "feat(quote-templates): QuoteTemplateDrawer 컴포넌트 (TierRates 편집 포함)"
```

---

## Task 6: /quote-templates RSC 페이지 + 기존 파일 삭제

> 페이지 shell은 단순 컴포넌트 조립 — TDD 면제.

**Files:**
- Create: `app/(app)/quote-templates/page.tsx`
- Delete: `app/(app)/settings/quote-templates/page.tsx`
- Delete: `components/settings/QuoteTemplatesPanel.tsx`
- Delete: `components/settings/__tests__/QuoteTemplatesPanel.test.tsx`

- [ ] **Step 1: 새 RSC 페이지 생성**

`app/(app)/quote-templates/page.tsx` 신규 생성:

```tsx
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import {
  getBidQuoteTemplateRepo,
  getWorkspaceRepo,
} from '@/lib/server/repositories/factory';
import { PageEnter } from '@/components/primitives/PageEnter';
import { QuoteTemplateList } from '@/components/quote-templates/QuoteTemplateList';

export const dynamic = 'force-dynamic';

export default async function QuoteTemplatesPage() {
  const session = await auth();
  if (!session?.user?.id || !session.user.workspaceId) {
    redirect('/login?next=/quote-templates');
  }
  if (session.user.workspaceType !== 'pg') {
    redirect('/home');
  }

  const wsId = session.user.workspaceId;
  const [templates, ws] = await Promise.all([
    (await getBidQuoteTemplateRepo()).listByWorkspace(wsId),
    (await getWorkspaceRepo()).findById(wsId),
  ]);

  const initialTemplates = templates.map((t) => ({
    id: t.id,
    name: t.name,
    settleCycle: t.settleCycle,
    settleLimit: t.settleLimit,
    guaranteeInsurance: t.guaranteeInsurance,
    paymentFees: t.paymentFees,
  }));

  return (
    <PageEnter className="px-4 py-6 md:px-8 md:py-8">
      <QuoteTemplateList
        initialTemplates={initialTemplates}
        workspaceName={ws?.name}
      />
    </PageEnter>
  );
}
```

- [ ] **Step 2: 기존 파일 삭제**

```bash
rm app/\(app\)/settings/quote-templates/page.tsx
rm components/settings/QuoteTemplatesPanel.tsx
rm components/settings/__tests__/QuoteTemplatesPanel.test.tsx
```

- [ ] **Step 3: 전체 테스트 실행**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm test
```

Expected: 전체 GREEN. `QuoteTemplatesPanel`을 참조하는 테스트가 없어야 하며, 모든 quote-template 관련 테스트가 통과해야 한다.

- [ ] **Step 4: 타입체크**

```bash
PATH="$HOME/.nvm/versions/node/v20.19.4/bin:$PATH" pnpm tsc --noEmit 2>&1 | grep -vE "Cannot find name '(vi|describe|it|expect|beforeEach|afterEach)'" | head -20
```

Expected: 에러 없음

- [ ] **Step 5: 커밋**

```bash
git add app/\(app\)/quote-templates/page.tsx
git rm app/\(app\)/settings/quote-templates/page.tsx \
       components/settings/QuoteTemplatesPanel.tsx \
       components/settings/__tests__/QuoteTemplatesPanel.test.tsx
git commit -m "feat(quote-templates): /quote-templates 페이지 추가, 기존 settings 라우트·패널 삭제"
```

---

## Self-Review 체크리스트

- [x] **스펙 커버리지**: Nav 승격(Task 2) · URL 변경(Task 6) · TierRates 편집(Task 5) · chip 미리보기(Task 4) · 복제(Task 3, 4) 모두 커버
- [x] **플레이스홀더 없음**: 모든 단계에 실제 코드 포함
- [x] **타입 일관성**: `EditorState.fees`의 `"method:tier"` 키 패턴이 Task 5 전체에서 일관됨; `QuoteTemplateDrawer`의 `onSaved/onClose` 시그니처가 Task 4 mock과 일치
- [x] **BidWizard 영향 없음**: `applyTemplate`은 `editorFromTemplate`을 사용하지 않으므로 변경 없음
- [x] **삭제된 파일 참조 없음**: `QuoteTemplatesPanel`은 `app/(app)/settings/quote-templates/page.tsx`에서만 import — 둘 다 삭제됨
