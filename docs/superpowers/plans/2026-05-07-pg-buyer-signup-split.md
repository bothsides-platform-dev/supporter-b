# PG / Buyer Signup Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the single `/signup → /signup/workspace` flow into two fully separate paths: `/signup/buyer/*` (Bs1-Bs4) for merchants and `/signup/pg/*` (Gs1-Gs4) for PG sales reps, with role selection at `/signup` (Rs1).

**Architecture:** Role is chosen at `/signup` (Rs1) before email entry. Each role writes `workspaceType` into `SignupClientDraft` (sessionStorage). The shared `/auth/verify?token=...` routes to the correct profile page after reading `workspaceType` from the action result (token meta carries it cross-device). PG invite flow (`/invite/rfp/:token`) auto-resolves the email server-side and skips Gs1.

**Tech Stack:** Next.js 16 App Router (RSC + Server Actions), Zustand (signup-draft store), `lib/auth/signup-storage` (sessionStorage), Auth.js v5, Vitest + React Testing Library, zod

---

## File Map

**Modify:**
- `lib/types/auth.ts` — add `workspaceType` to `SignupDraft`
- `lib/auth/signup-storage.ts` — add `workspaceType` to `SignupClientDraft`
- `lib/stores/signup-draft.ts` — add `workspaceType` state + setter
- `lib/server/actions/auth/signupEmailAction.ts` — accept `workspaceType`, store in token meta
- `lib/server/actions/auth/verifyEmailAction.ts` — return `workspaceType` from token meta
- `lib/server/actions/auth/__tests__/signup.test.ts` — update redirectTo assertions + add workspaceType tests
- `lib/server/actions/auth/signupCompleteAction.ts` — `/home` → `/rfp` (buyer), `/inbox` (pg)
- `app/(public)/signup/page.tsx` — transform to Rs1 role chooser
- `app/(public)/auth/verify/page.tsx` — route to `/signup/{kind}/profile` based on `workspaceType`
- `app/(public)/invite/rfp/[token]/page.tsx` — resolve invite email in RSC
- `app/(public)/invite/rfp/[token]/InviteUnauthClient.tsx` — prefill draft, call `signupEmailAction`, redirect to Gs2

**Create:**
- `components/auth/RoleChooser.tsx`
- `components/auth/__tests__/RoleChooser.test.tsx`
- `app/(public)/signup/buyer/page.tsx` (Bs1)
- `app/(public)/signup/buyer/verify/page.tsx` (Bs2)
- `app/(public)/signup/buyer/profile/page.tsx` (Bs3)
- `components/auth/BuyerWorkspaceForm.tsx`
- `app/(public)/signup/buyer/workspace/page.tsx` (Bs4)
- `app/(public)/signup/pg/page.tsx` (Gs1)
- `app/(public)/signup/pg/verify/page.tsx` (Gs2)
- `app/(public)/signup/pg/profile/page.tsx` (Gs3)
- `components/auth/PgWorkspaceConfirm.tsx`
- `app/(public)/signup/pg/workspace/page.tsx` (Gs4)

**Delete (Task 8):**
- `app/(public)/signup/verify/page.tsx`
- `app/(public)/signup/profile/page.tsx`
- `app/(public)/signup/workspace/page.tsx`
- `components/auth/WorkspaceTypeRadio.tsx`
- `components/auth/__tests__/WorkspaceTypeRadio.test.tsx`

---

## Task 1: Foundation — types, storage, store

**Files:**
- Modify: `lib/types/auth.ts`
- Modify: `lib/auth/signup-storage.ts`
- Modify: `lib/stores/signup-draft.ts`

- [ ] **Step 1.1: Add `workspaceType` to `SignupDraft` type**

In `lib/types/auth.ts`, update `SignupDraft`:

```ts
export type SignupDraft = {
  step: 'email' | 'profile' | 'workspace';
  workspaceType?: 'buyer' | 'pg';   // set at Rs1 or via invite handoff
  email: string;
  emailVerified: boolean;
  name?: string;
  phone?: string;
  agreedAt?: string;
};
```

- [ ] **Step 1.2: Add `workspaceType` to `SignupClientDraft`**

In `lib/auth/signup-storage.ts`, update `SignupClientDraft` (keep `inviteToken` name unchanged):

```ts
export type SignupClientDraft = {
  workspaceType?: 'buyer' | 'pg';   // set at Rs1 or invite prefill
  email?: string;
  emailVerified?: boolean;
  inviteToken?: string;
  name?: string;
  phone?: string;
  password?: string;
  agreedAt?: string;
};
```

- [ ] **Step 1.3: Add `workspaceType` to Zustand store**

In `lib/stores/signup-draft.ts`, add field and setter (the store mirrors `lib/types/auth.ts#SignupDraft`):

```ts
type SignupDraftStore = SignupDraft & {
  setEmail: (email: string) => void;
  setEmailVerified: () => void;
  setProfile: (name: string, phone?: string) => void;
  setAgreedAt: (at: string) => void;
  setStep: (step: SignupDraft['step']) => void;
  setWorkspaceType: (t: 'buyer' | 'pg') => void;   // NEW
  reset: () => void;
};

const initial: SignupDraft = {
  step: 'email',
  email: '',
  emailVerified: false,
  workspaceType: undefined,   // NEW
};

// Inside create():
setWorkspaceType: (workspaceType) => set({ workspaceType }),   // NEW
```

- [ ] **Step 1.4: Run type-check to confirm no regressions**

```bash
cd /Users/yeonseong/project/bidit && pnpm tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 1.5: Commit**

```bash
git add lib/types/auth.ts lib/auth/signup-storage.ts lib/stores/signup-draft.ts
git commit -m "feat: add workspaceType to SignupDraft, SignupClientDraft, signup-draft store"
```

---

## Task 2: Server actions — thread `workspaceType` through email verify + fix redirectTo

**Files:**
- Modify: `lib/server/actions/auth/__tests__/signup.test.ts`
- Modify: `lib/server/actions/auth/signupEmailAction.ts`
- Modify: `lib/server/actions/auth/verifyEmailAction.ts`
- Modify: `lib/server/actions/auth/signupCompleteAction.ts`

- [ ] **Step 2.1: Write failing tests for `workspaceType` round-trip**

In `lib/server/actions/auth/__tests__/signup.test.ts`, add inside the `signupEmailAction + verifyEmailAction` describe block:

```ts
it('stores workspaceType=buyer in meta and verify returns it', async () => {
  const r = await signupEmailAction({ email: 'buyer@example.com', workspaceType: 'buyer' });
  expect(r.ok).toBe(true);
  if (!r.ok) return;

  const rows = await db
    .select({ html: outboxEntries.html })
    .from(outboxEntries)
    .where(eq(outboxEntries.toAddr, 'buyer@example.com'))
    .limit(1);
  const token = tokenFromHtml(rows[0].html);

  const v = await verifyEmailAction(token);
  expect(v.ok).toBe(true);
  if (!v.ok) return;
  expect(v.workspaceType).toBe('buyer');
});

it('stores workspaceType=pg in meta and verify returns it', async () => {
  const r = await signupEmailAction({ email: 'pg@toss.im', workspaceType: 'pg' });
  expect(r.ok).toBe(true);
  if (!r.ok) return;

  const rows = await db
    .select({ html: outboxEntries.html })
    .from(outboxEntries)
    .where(eq(outboxEntries.toAddr, 'pg@toss.im'))
    .limit(1);
  const token = tokenFromHtml(rows[0].html);

  const v = await verifyEmailAction(token);
  expect(v.ok).toBe(true);
  if (!v.ok) return;
  expect(v.workspaceType).toBe('pg');
});
```

Also update the buyer redirectTo assertion (will fail after step 2.5):

```ts
// In signupCompleteAction — buyer branch test:
expect(r.redirectTo).toBe('/rfp');   // was '/home'

// In signupCompleteAction — pg branch test (creates new PG ws):
expect(r.redirectTo).toBe('/inbox');  // was '/home'

// In signupCompleteAction — pg branch test (auto-joins):
expect(r.ok).toBe(true);
// add:
if (!r.ok) return;
expect(r.redirectTo).toBe('/inbox');  // was '/home'
```

- [ ] **Step 2.2: Run tests to confirm they fail**

```bash
cd /Users/yeonseong/project/bidit && pnpm test -- lib/server/actions/auth/__tests__/signup.test.ts
```

Expected: `workspaceType` tests fail with `undefined`, redirectTo tests fail (still `/home`).

- [ ] **Step 2.3: Update `signupEmailAction` to accept and store `workspaceType`**

In `lib/server/actions/auth/signupEmailAction.ts`:

Update Input schema:
```ts
const Input = z.object({
  email: z.string().email(),
  workspaceType: z.enum(['buyer', 'pg']).optional(),
  inviteToken: z.string().min(1).max(256).optional(),
});
```

Update `verifications.save` call — merge `workspaceType` into meta:
```ts
await verifications.save({
  id: randomUUID(),
  purpose: 'signup_email',
  email,
  tokenHash,
  issuedAt: new Date().toISOString(),
  expiresAt,
  meta: {
    ...(parsed.data.inviteToken ? { inviteToken: parsed.data.inviteToken } : {}),
    ...(parsed.data.workspaceType ? { workspaceType: parsed.data.workspaceType } : {}),
  } || undefined,
});
```

Export type update (add `workspaceType` to input):
```ts
export type SignupEmailInput = z.infer<typeof Input>;
```
(This auto-includes `workspaceType` via `z.infer`.)

- [ ] **Step 2.4: Update `verifyEmailAction` to return `workspaceType`**

In `lib/server/actions/auth/verifyEmailAction.ts`:

Update return type:
```ts
export type VerifyEmailResult = AuthActionResult<{
  email: string;
  inviteToken?: string;
  workspaceType?: 'buyer' | 'pg';
}>;
```

Update the extract block after `if (!consumed) ...`:
```ts
const meta = consumed.meta && typeof consumed.meta === 'object'
  ? (consumed.meta as Record<string, unknown>)
  : {};

const inviteToken = meta.inviteToken;
const rawWorkspaceType = meta.workspaceType;

return {
  ok: true,
  email: consumed.email,
  inviteToken: typeof inviteToken === 'string' ? inviteToken : undefined,
  workspaceType:
    rawWorkspaceType === 'buyer' || rawWorkspaceType === 'pg'
      ? rawWorkspaceType
      : undefined,
};
```

- [ ] **Step 2.5: Update `signupCompleteAction` redirectTo**

In `lib/server/actions/auth/signupCompleteAction.ts`:

Buyer branch (currently returns `/home`):
```ts
return {
  ok: true,
  redirectTo: '/rfp',   // was '/home'
  email,
  password: parsed.data.password,
};
```

PG no-invite auto-join branch:
```ts
if (joined) {
  return {
    ok: true,
    redirectTo: '/inbox',   // was '/home'
    email,
    password: parsed.data.password,
  };
}
```

PG no-invite create-new branch:
```ts
return {
  ok: true,
  redirectTo: '/inbox',   // was '/home'
  email,
  password: parsed.data.password,
};
```

(The invite branch already returns `/inbox/${claim.invitation.rfpId}` — no change needed.)

- [ ] **Step 2.6: Run tests to confirm they pass**

```bash
cd /Users/yeonseong/project/bidit && pnpm test -- lib/server/actions/auth/__tests__/signup.test.ts
```

Expected: all tests pass.

- [ ] **Step 2.7: Commit**

```bash
git add lib/server/actions/auth/signupEmailAction.ts \
        lib/server/actions/auth/verifyEmailAction.ts \
        lib/server/actions/auth/signupCompleteAction.ts \
        lib/server/actions/auth/__tests__/signup.test.ts
git commit -m "feat: thread workspaceType through signup email/verify, fix redirectTo /rfp and /inbox"
```

---

## Task 3: `RoleChooser` component + transform `/signup` → Rs1

**Files:**
- Create: `components/auth/__tests__/RoleChooser.test.tsx`
- Create: `components/auth/RoleChooser.tsx`
- Modify: `app/(public)/signup/page.tsx`

- [ ] **Step 3.1: Write failing test for `RoleChooser`**

Create `components/auth/__tests__/RoleChooser.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RoleChooser } from '../RoleChooser';

describe('RoleChooser', () => {
  it('renders two role cards', () => {
    render(<RoleChooser onSelect={() => {}} />);
    expect(screen.getByText('구매사')).toBeInTheDocument();
    expect(screen.getByText('PG사 영업담당')).toBeInTheDocument();
  });

  it('calls onSelect("buyer") when buyer card is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<RoleChooser onSelect={onSelect} />);
    await user.click(screen.getByText('구매사'));
    expect(onSelect).toHaveBeenCalledWith('buyer');
  });

  it('calls onSelect("pg") when PG card is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<RoleChooser onSelect={onSelect} />);
    await user.click(screen.getByText('PG사 영업담당'));
    expect(onSelect).toHaveBeenCalledWith('pg');
  });
});
```

- [ ] **Step 3.2: Run test to confirm it fails**

```bash
cd /Users/yeonseong/project/bidit && pnpm test -- components/auth/__tests__/RoleChooser.test.tsx
```

Expected: FAIL — `RoleChooser` not found.

- [ ] **Step 3.3: Create `RoleChooser` component**

Create `components/auth/RoleChooser.tsx`:

```tsx
'use client';

import { cn } from '@/lib/utils';

type Role = 'buyer' | 'pg';

type Option = {
  role: Role;
  title: string;
  description: string;
  badge: string;
};

const OPTIONS: Option[] = [
  {
    role: 'buyer',
    title: '구매사',
    description: '결제대행사에 제안을 요청하는 사업자입니다.',
    badge: 'BUYER',
  },
  {
    role: 'pg',
    title: 'PG사 영업담당',
    description: '구매사 RFP를 받아 제안을 제출하는 영업담당입니다.',
    badge: 'PG',
  },
];

type Props = {
  onSelect: (role: Role) => void;
};

export function RoleChooser({ onSelect }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {OPTIONS.map((opt) => (
        <button
          key={opt.role}
          type="button"
          onClick={() => onSelect(opt.role)}
          className={cn(
            'group relative text-left px-5 py-5 border border-[var(--color-hair)]',
            'hover:border-[var(--color-ink)] transition-colors rounded-[5px]',
            'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-ink)]',
          )}
        >
          <div className="flex items-baseline justify-between gap-2 mb-2">
            <span className="text-[15px] font-[600] text-[var(--color-ink)]">
              {opt.title}
            </span>
            <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-[var(--color-ink-faint)]">
              <span className="opacity-50">[ </span>
              {opt.badge}
              <span className="opacity-50"> ]</span>
            </span>
          </div>
          <p className="text-[12px] text-[var(--color-ink-muted)] leading-snug">
            {opt.description}
          </p>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3.4: Run test to confirm it passes**

```bash
cd /Users/yeonseong/project/bidit && pnpm test -- components/auth/__tests__/RoleChooser.test.tsx
```

Expected: PASS.

- [ ] **Step 3.5: Transform `/signup/page.tsx` to Rs1 role chooser**

Replace the entire content of `app/(public)/signup/page.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { RoleChooser } from '@/components/auth/RoleChooser';
import { useSignupDraftStore } from '@/lib/stores/signup-draft';
import { writeSignupDraft } from '@/lib/auth/signup-storage';

export default function SignupPage() {
  const router = useRouter();
  const { setWorkspaceType } = useSignupDraftStore();

  const handleSelect = (role: 'buyer' | 'pg') => {
    setWorkspaceType(role);
    writeSignupDraft({ workspaceType: role });
    router.push(role === 'buyer' ? '/signup/buyer' : '/signup/pg');
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-[26px] font-[700] tracking-[-0.02em] text-[var(--color-ink)]">
          누구로 시작하시나요?
        </h2>
        <p className="mt-2 text-[13px] text-[var(--color-ink-muted)]">
          역할에 맞는 가입 경로를 선택합니다.
        </p>
      </div>

      <RoleChooser onSelect={handleSelect} />

      <div className="text-center">
        <Link
          href="/login"
          className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-colors"
        >
          이미 계정이 있으세요? 로그인 →
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 3.6: Confirm `/signup` loads in browser**

```bash
cd /Users/yeonseong/project/bidit && pnpm dev
```

Navigate to `http://localhost:3000/signup` — should show two role cards (no form).

- [ ] **Step 3.7: Commit**

```bash
git add components/auth/RoleChooser.tsx \
        components/auth/__tests__/RoleChooser.test.tsx \
        'app/(public)/signup/page.tsx'
git commit -m "feat: add RoleChooser component, transform /signup to Rs1 role selection"
```

---

## Task 4: Buyer signup flow (Bs1 → Bs2 → Bs3 → Bs4)

**Files:**
- Create: `app/(public)/signup/buyer/page.tsx`
- Create: `app/(public)/signup/buyer/verify/page.tsx`
- Create: `app/(public)/signup/buyer/profile/page.tsx`
- Create: `components/auth/BuyerWorkspaceForm.tsx`
- Create: `app/(public)/signup/buyer/workspace/page.tsx`

> **Note:** Bs1 and Bs3 are structurally identical to the old `/signup` and `/signup/profile` pages with buyer-specific context strings and updated route targets.

- [ ] **Step 4.1: Create Bs1 — buyer email page**

Create `app/(public)/signup/buyer/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Serial } from '@/components/primitives/Serial';
import { Button } from '@/components/primitives/Button';
import { AgreementCheckboxes } from '@/components/auth/AgreementCheckboxes';
import { useSignupDraftStore } from '@/lib/stores/signup-draft';
import { signupEmailAction } from '@/lib/server/actions/auth';
import { readSignupDraft, writeSignupDraft } from '@/lib/auth/signup-storage';

type AgreementState = { terms: boolean; privacy: boolean; marketing: boolean };

export default function BuyerSignupPage() {
  const router = useRouter();
  const { setEmail, setAgreedAt } = useSignupDraftStore();
  const [email, setEmailLocal] = useState('');
  const [agreements, setAgreements] = useState<AgreementState>({
    terms: false,
    privacy: false,
    marketing: false,
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = email.trim() !== '' && agreements.terms && agreements.privacy;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes('@')) {
      setError('올바른 이메일 형식이 아닙니다.');
      return;
    }
    setError('');
    setSubmitting(true);

    const normalised = email.trim().toLowerCase();
    const r = await signupEmailAction({ email: normalised, workspaceType: 'buyer' });
    setSubmitting(false);
    if (!r.ok) {
      setError('인증 메일 발송에 실패했습니다. 잠시 후 다시 시도해주세요.');
      return;
    }

    const draft = readSignupDraft();
    writeSignupDraft({ ...draft, workspaceType: 'buyer', email: r.email });
    setEmail(r.email);
    setAgreedAt(new Date().toISOString());
    router.push('/signup/buyer/verify');
  };

  return (
    <div className="space-y-8">
      <div>
        <Serial current={1} total={4} label="EMAIL" className="block mb-4" />
        <h2 className="text-[26px] font-[700] tracking-[-0.02em] text-[var(--color-ink)]">
          구매사 계정을 만듭니다
        </h2>
      </div>

      <form className="space-y-7" onSubmit={handleSubmit}>
        <div className="space-y-1">
          <label
            htmlFor="email"
            className="font-mono text-[11px] tracking-[0.14em] uppercase text-[var(--color-ink-soft)]"
          >
            이메일
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => { setEmailLocal(e.target.value); setError(''); }}
            autoComplete="email"
            className="block w-full bg-transparent border-0 border-b border-[var(--color-hair-strong)] py-2 text-[14px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-faint)] focus:outline-none focus:border-[var(--color-ink)] transition-colors"
            placeholder="your@company.com"
          />
          {error && (
            <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-[var(--color-terracotta)]">
              {error}
            </p>
          )}
        </div>

        <AgreementCheckboxes value={agreements} onChange={setAgreements} />

        <Button type="submit" fullWidth size="lg" disabled={!canSubmit || submitting}>
          {submitting ? 'LOADING…' : '인증 메일 받기'}
        </Button>
      </form>

      <div className="text-center">
        <Link
          href="/login"
          className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-colors"
        >
          이미 계정이 있으세요? 로그인 →
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 4.2: Create Bs2 — buyer verify wait page**

Create `app/(public)/signup/buyer/verify/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Serial } from '@/components/primitives/Serial';
import { ResendCountdown } from '@/components/auth/ResendCountdown';
import { EnvelopeSvg } from '@/components/auth/EnvelopeSvg';
import { signupEmailAction } from '@/lib/server/actions/auth';
import { readSignupDraft } from '@/lib/auth/signup-storage';

export default function BuyerVerifyPage() {
  const [email, setEmail] = useState('');

  useEffect(() => {
    const draft = readSignupDraft();
    setEmail(draft.email ?? '');
  }, []);

  const handleResend = async () => {
    if (!email) return;
    await signupEmailAction({ email, workspaceType: 'buyer' });
  };

  return (
    <div className="space-y-8 text-center">
      <Serial current={2} total={4} label="VERIFY" className="inline-block mb-4" />
      <div className="flex justify-center text-[var(--color-ink-faint)]">
        <EnvelopeSvg size={80} />
      </div>
      <div className="space-y-3">
        <h2 className="text-[20px] font-[700] tracking-[-0.02em] text-[var(--color-ink)]">
          인증 메일을 보냈습니다
        </h2>
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          <span className="font-mono tabular-nums">{email}</span>
        </p>
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          메일의 [인증하기] 버튼을 눌러주세요.
          <br />
          <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--color-ink-soft)]">
            15분 내 만료됩니다.
          </span>
        </p>
      </div>
      <div className="space-y-3">
        <ResendCountdown onResend={handleResend} />
        <Link
          href="/signup/buyer"
          className="block font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-colors"
        >
          다른 이메일로 변경
        </Link>
      </div>
      <div className="text-[12px] text-[var(--color-ink-soft)] space-y-1">
        <p>스팸함을 확인해보세요.</p>
        <p>회사 메일의 경우 도메인 차단 여부를 확인해주세요.</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 4.3: Create Bs3 — buyer profile page**

Create `app/(public)/signup/buyer/profile/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Serial } from '@/components/primitives/Serial';
import { Button } from '@/components/primitives/Button';
import { PasswordField } from '@/components/auth/PasswordField';
import { useSignupDraftStore } from '@/lib/stores/signup-draft';
import { readSignupDraft, writeSignupDraft } from '@/lib/auth/signup-storage';

export default function BuyerProfilePage() {
  const router = useRouter();
  const { setProfile } = useSignupDraftStore();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = '이름을 입력해주세요.';
    if (password.length < 10) errs.password = 'MIN 10';
    else if (!/[A-Za-z]/.test(password)) errs.password = 'A-Z 1+';
    else if (!/\d/.test(password)) errs.password = '0-9 1+';
    else if (!/[^A-Za-z0-9]/.test(password)) errs.password = '!@# 1+';
    if (password !== passwordConfirm) errs.passwordConfirm = '비밀번호가 일치하지 않습니다.';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setProfile(name.trim(), phone.trim() || undefined);
    const draft = readSignupDraft();
    writeSignupDraft({
      ...draft,
      name: name.trim(),
      phone: phone.trim() || undefined,
      password,
    });
    router.push('/signup/buyer/workspace');
  };

  return (
    <div className="space-y-8">
      <div>
        <Serial current={3} total={4} label="PROFILE" className="block mb-4" />
        <h2 className="text-[26px] font-[700] tracking-[-0.02em] text-[var(--color-ink)]">프로필 설정</h2>
      </div>
      <form className="space-y-6" onSubmit={handleSubmit}>
        <div className="space-y-1">
          <label htmlFor="name" className="font-mono text-[11px] tracking-[0.14em] uppercase text-[var(--color-ink-soft)]">이름</label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            className="block w-full bg-transparent border-0 border-b border-[var(--color-hair-strong)] py-2 text-[14px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-faint)] focus:outline-none focus:border-[var(--color-ink)] transition-colors"
          />
          {errors.name && <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-[var(--color-terracotta)]">{errors.name}</p>}
        </div>
        <PasswordField label="비밀번호" value={password} onChange={setPassword} showStrength error={errors.password} />
        <PasswordField label="비밀번호 확인" name="passwordConfirm" value={passwordConfirm} onChange={setPasswordConfirm} autoComplete="new-password" error={errors.passwordConfirm} />
        <div className="space-y-1">
          <label htmlFor="phone" className="font-mono text-[11px] tracking-[0.14em] uppercase text-[var(--color-ink-soft)]">
            휴대전화 <span className="opacity-50">(선택)</span>
          </label>
          <input
            id="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
            placeholder="010-0000-0000"
            className="block w-full bg-transparent border-0 border-b border-[var(--color-hair-strong)] py-2 text-[14px] font-mono tabular-nums text-[var(--color-ink)] placeholder:text-[var(--color-ink-faint)] focus:outline-none focus:border-[var(--color-ink)] transition-colors"
          />
        </div>
        <Button type="submit" fullWidth size="lg">다음</Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4.4: Create `BuyerWorkspaceForm` component**

Create `components/auth/BuyerWorkspaceForm.tsx`:

```tsx
'use client';

import { useCallback, useState } from 'react';
import { Button } from '@/components/primitives/Button';
import { Eyebrow } from '@/components/primitives/Eyebrow';
import {
  BizLookupField,
  type BizLookupResult,
} from '@/components/rfp/BizLookupField';
import { GradeConfirmPanel } from '@/components/rfp/GradeConfirmPanel';
import { lookupBizNoAction } from '@/lib/server/actions/rfp';
import type { MerchantGrade } from '@/lib/types/biz-profile';

const ntsLookup = async (bizNo: string) => {
  const r = await lookupBizNoAction(bizNo);
  if (!r.ok || !r.valid) return { valid: false as const };
  return { valid: true as const, taxType: r.taxType!, status: r.status! };
};

type Props = {
  onSubmit: (payload: {
    wsName: string;
    bizProfile?: {
      bizNo: string;
      taxType: 'general' | 'simple' | 'exempt';
      status: 'active' | 'suspended' | 'closed';
      grade: MerchantGrade;
      gradeSource: 'user_confirmed';
    };
  }) => Promise<void>;
  submitting: boolean;
  error?: string;
};

export function BuyerWorkspaceForm({ onSubmit, submitting, error }: Props) {
  const [wsName, setWsName] = useState('');
  const [bizProfile, setBizProfile] = useState<BizLookupResult | null>(null);
  const [grade, setGrade] = useState<MerchantGrade | null>(null);

  const canSubmit = wsName.trim() !== '' && bizProfile !== null && grade !== null;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || !bizProfile || !grade) return;
    await onSubmit({
      wsName: wsName.trim(),
      bizProfile: {
        bizNo: bizProfile.bizNo,
        taxType: bizProfile.taxType,
        status: bizProfile.status,
        grade,
        gradeSource: 'user_confirmed',
      },
    });
  }, [canSubmit, wsName, bizProfile, grade, onSubmit]);

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <Eyebrow>워크스페이스 이름 *</Eyebrow>
        <input
          type="text"
          value={wsName}
          onChange={(e) => setWsName(e.target.value)}
          placeholder="(주)샘플테크"
          className="block w-full bg-transparent border-0 border-b border-[var(--color-hair-strong)] py-2 text-[14px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-faint)] focus:outline-none focus:border-[var(--color-ink)] transition-colors"
        />
      </div>

      <BizLookupField
        onLookup={ntsLookup}
        onResult={(profile) => { setBizProfile(profile); setGrade(null); }}
        onReset={() => { setBizProfile(null); setGrade(null); }}
      />

      {bizProfile && (
        <GradeConfirmPanel onConfirm={(g) => setGrade(g)} />
      )}

      {error && (
        <p role="alert" className="font-mono text-[10px] tracking-[0.12em] uppercase text-[var(--color-terracotta)]">
          {error}
        </p>
      )}

      <Button
        type="button"
        fullWidth
        size="lg"
        disabled={!canSubmit || submitting}
        onClick={handleSubmit}
      >
        {submitting ? '처리 중…' : '만들기'}
      </Button>
    </div>
  );
}
```

- [ ] **Step 4.5: Create Bs4 — buyer workspace creation page**

Create `app/(public)/signup/buyer/workspace/page.tsx`:

```tsx
'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Serial } from '@/components/primitives/Serial';
import { BuyerWorkspaceForm } from '@/components/auth/BuyerWorkspaceForm';
import { signupCompleteAction } from '@/lib/server/actions/auth';
import { clearSignupDraft, readSignupDraft } from '@/lib/auth/signup-storage';
import type { MerchantGrade } from '@/lib/types/biz-profile';

export default function BuyerWorkspacePage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = useCallback(async (payload: {
    wsName: string;
    bizProfile?: {
      bizNo: string;
      taxType: 'general' | 'simple' | 'exempt';
      status: 'active' | 'suspended' | 'closed';
      grade: MerchantGrade;
      gradeSource: 'user_confirmed';
    };
  }) => {
    const draft = readSignupDraft();
    if (!draft.email || !draft.password || !draft.name) {
      setError('가입 정보가 누락되었습니다. 처음부터 다시 시도해주세요.');
      return;
    }
    setSubmitting(true);
    setError('');

    const r = await signupCompleteAction({
      email: draft.email,
      name: draft.name,
      password: draft.password,
      wsKind: 'buyer',
      wsName: payload.wsName,
      bizProfile: payload.bizProfile,
    });

    if (!r.ok) {
      setSubmitting(false);
      setError(`가입을 완료하지 못했습니다. (${r.error})`);
      return;
    }

    const signInResult = await signIn('credentials', {
      email: r.email,
      password: r.password,
      redirect: false,
    });
    clearSignupDraft();
    if (signInResult?.error) {
      setSubmitting(false);
      router.push('/login');
      return;
    }
    router.push(r.redirectTo);
  }, [router]);

  return (
    <div className="space-y-8">
      <div>
        <Serial current={4} total={4} label="WORKSPACE" className="block mb-4" />
        <h2 className="text-[26px] font-[700] tracking-[-0.02em] text-[var(--color-ink)]">
          구매사 워크스페이스를 만듭니다
        </h2>
        <p className="mt-2 text-[13px] text-[var(--color-ink-muted)]">
          사업자번호를 조회해 워크스페이스를 생성합니다.
        </p>
      </div>

      <BuyerWorkspaceForm
        onSubmit={handleSubmit}
        submitting={submitting}
        error={error}
      />
    </div>
  );
}
```

- [ ] **Step 4.6: Smoke-test buyer flow in browser**

With `pnpm dev` running:
1. `/signup` → click "구매사" → lands at `/signup/buyer` (Bs1)
2. Enter email, check terms → [인증 메일 받기] → lands at `/signup/buyer/verify` (Bs2)
3. After verify token, lands at `/signup/buyer/profile` (Bs3) — requires Task 6 first; for now confirm the page renders without errors.

- [ ] **Step 4.7: Commit**

```bash
git add 'app/(public)/signup/buyer/' components/auth/BuyerWorkspaceForm.tsx
git commit -m "feat: add buyer signup flow Bs1-Bs4 (/signup/buyer)"
```

---

## Task 5: PG signup flow (Gs1 → Gs2 → Gs3 → Gs4)

**Files:**
- Create: `app/(public)/signup/pg/page.tsx`
- Create: `app/(public)/signup/pg/verify/page.tsx`
- Create: `app/(public)/signup/pg/profile/page.tsx`
- Create: `components/auth/PgWorkspaceConfirm.tsx`
- Create: `app/(public)/signup/pg/workspace/page.tsx`

- [ ] **Step 5.1: Create Gs1 — PG email page**

Create `app/(public)/signup/pg/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Serial } from '@/components/primitives/Serial';
import { Button } from '@/components/primitives/Button';
import { AgreementCheckboxes } from '@/components/auth/AgreementCheckboxes';
import { useSignupDraftStore } from '@/lib/stores/signup-draft';
import { signupEmailAction } from '@/lib/server/actions/auth';
import { readSignupDraft, writeSignupDraft } from '@/lib/auth/signup-storage';

type AgreementState = { terms: boolean; privacy: boolean; marketing: boolean };

export default function PgSignupPage() {
  const router = useRouter();
  const { setEmail, setAgreedAt } = useSignupDraftStore();
  const [email, setEmailLocal] = useState('');
  const [agreements, setAgreements] = useState<AgreementState>({
    terms: false,
    privacy: false,
    marketing: false,
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = email.trim() !== '' && agreements.terms && agreements.privacy;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes('@')) {
      setError('올바른 이메일 형식이 아닙니다.');
      return;
    }
    setError('');
    setSubmitting(true);

    const normalised = email.trim().toLowerCase();
    const draft = readSignupDraft();
    const r = await signupEmailAction({
      email: normalised,
      workspaceType: 'pg',
      inviteToken: draft.inviteToken,
    });
    setSubmitting(false);
    if (!r.ok) {
      setError('인증 메일 발송에 실패했습니다. 잠시 후 다시 시도해주세요.');
      return;
    }

    writeSignupDraft({ ...draft, workspaceType: 'pg', email: r.email });
    setEmail(r.email);
    setAgreedAt(new Date().toISOString());
    router.push('/signup/pg/verify');
  };

  return (
    <div className="space-y-8">
      <div>
        <Serial current={1} total={4} label="EMAIL" className="block mb-4" />
        <h2 className="text-[26px] font-[700] tracking-[-0.02em] text-[var(--color-ink)]">
          PG사 계정을 만듭니다
        </h2>
        <p className="mt-2 text-[13px] text-[var(--color-ink-muted)]">
          초대 이메일을 받으셨다면 메일의 링크를 클릭하면 이 단계가 자동으로 건너뛰어집니다.
        </p>
      </div>

      <form className="space-y-7" onSubmit={handleSubmit}>
        <div className="space-y-1">
          <label
            htmlFor="email"
            className="font-mono text-[11px] tracking-[0.14em] uppercase text-[var(--color-ink-soft)]"
          >
            회사 이메일
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => { setEmailLocal(e.target.value); setError(''); }}
            autoComplete="email"
            className="block w-full bg-transparent border-0 border-b border-[var(--color-hair-strong)] py-2 text-[14px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-faint)] focus:outline-none focus:border-[var(--color-ink)] transition-colors"
            placeholder="you@yourpg.com"
          />
          {error && (
            <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-[var(--color-terracotta)]">
              {error}
            </p>
          )}
        </div>

        <AgreementCheckboxes value={agreements} onChange={setAgreements} />

        <Button type="submit" fullWidth size="lg" disabled={!canSubmit || submitting}>
          {submitting ? 'LOADING…' : '인증 메일 받기'}
        </Button>
      </form>

      <div className="text-center">
        <Link
          href="/login"
          className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-colors"
        >
          이미 계정이 있으세요? 로그인 →
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 5.2: Create Gs2 — PG verify wait page**

Create `app/(public)/signup/pg/verify/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Serial } from '@/components/primitives/Serial';
import { ResendCountdown } from '@/components/auth/ResendCountdown';
import { EnvelopeSvg } from '@/components/auth/EnvelopeSvg';
import { signupEmailAction } from '@/lib/server/actions/auth';
import { readSignupDraft } from '@/lib/auth/signup-storage';

export default function PgVerifyPage() {
  const [email, setEmail] = useState('');
  const [isInvite, setIsInvite] = useState(false);

  useEffect(() => {
    const draft = readSignupDraft();
    setEmail(draft.email ?? '');
    setIsInvite(!!draft.inviteToken);
  }, []);

  const handleResend = async () => {
    if (!email) return;
    await signupEmailAction({ email, workspaceType: 'pg' });
  };

  return (
    <div className="space-y-8 text-center">
      <Serial
        current={isInvite ? 1 : 2}
        total={isInvite ? 3 : 4}
        label="VERIFY"
        className="inline-block mb-4"
      />
      <div className="flex justify-center text-[var(--color-ink-faint)]">
        <EnvelopeSvg size={80} />
      </div>
      <div className="space-y-3">
        <h2 className="text-[20px] font-[700] tracking-[-0.02em] text-[var(--color-ink)]">
          인증 메일을 보냈습니다
        </h2>
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          <span className="font-mono tabular-nums">{email}</span>
        </p>
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          메일의 [인증하기] 버튼을 눌러주세요.
          <br />
          <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--color-ink-soft)]">
            15분 내 만료됩니다.
          </span>
        </p>
      </div>
      <div className="space-y-3">
        <ResendCountdown onResend={handleResend} />
        {!isInvite && (
          <Link
            href="/signup/pg"
            className="block font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--color-ink-muted)] hover:text-[var(--color-ink)] transition-colors"
          >
            다른 이메일로 변경
          </Link>
        )}
      </div>
      <div className="text-[12px] text-[var(--color-ink-soft)] space-y-1">
        <p>스팸함을 확인해보세요.</p>
        <p>회사 메일의 경우 도메인 차단 여부를 확인해주세요.</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 5.3: Create Gs3 — PG profile page**

Create `app/(public)/signup/pg/profile/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Serial } from '@/components/primitives/Serial';
import { Button } from '@/components/primitives/Button';
import { PasswordField } from '@/components/auth/PasswordField';
import { useSignupDraftStore } from '@/lib/stores/signup-draft';
import { readSignupDraft, writeSignupDraft } from '@/lib/auth/signup-storage';
import { useEffect } from 'react';

export default function PgProfilePage() {
  const router = useRouter();
  const { setProfile } = useSignupDraftStore();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isInvite, setIsInvite] = useState(false);

  useEffect(() => {
    const draft = readSignupDraft();
    setIsInvite(!!draft.inviteToken);
  }, []);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = '이름을 입력해주세요.';
    if (password.length < 10) errs.password = 'MIN 10';
    else if (!/[A-Za-z]/.test(password)) errs.password = 'A-Z 1+';
    else if (!/\d/.test(password)) errs.password = '0-9 1+';
    else if (!/[^A-Za-z0-9]/.test(password)) errs.password = '!@# 1+';
    if (password !== passwordConfirm) errs.passwordConfirm = '비밀번호가 일치하지 않습니다.';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setProfile(name.trim(), phone.trim() || undefined);
    const draft = readSignupDraft();
    writeSignupDraft({
      ...draft,
      name: name.trim(),
      phone: phone.trim() || undefined,
      password,
    });
    router.push('/signup/pg/workspace');
  };

  const current = isInvite ? 2 : 3;
  const total = isInvite ? 3 : 4;

  return (
    <div className="space-y-8">
      <div>
        <Serial current={current} total={total} label="PROFILE" className="block mb-4" />
        <h2 className="text-[26px] font-[700] tracking-[-0.02em] text-[var(--color-ink)]">프로필 설정</h2>
      </div>
      <form className="space-y-6" onSubmit={handleSubmit}>
        <div className="space-y-1">
          <label htmlFor="name" className="font-mono text-[11px] tracking-[0.14em] uppercase text-[var(--color-ink-soft)]">이름</label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            className="block w-full bg-transparent border-0 border-b border-[var(--color-hair-strong)] py-2 text-[14px] text-[var(--color-ink)] placeholder:text-[var(--color-ink-faint)] focus:outline-none focus:border-[var(--color-ink)] transition-colors"
          />
          {errors.name && <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-[var(--color-terracotta)]">{errors.name}</p>}
        </div>
        <PasswordField label="비밀번호" value={password} onChange={setPassword} showStrength error={errors.password} />
        <PasswordField label="비밀번호 확인" name="passwordConfirm" value={passwordConfirm} onChange={setPasswordConfirm} autoComplete="new-password" error={errors.passwordConfirm} />
        <div className="space-y-1">
          <label htmlFor="phone" className="font-mono text-[11px] tracking-[0.14em] uppercase text-[var(--color-ink-soft)]">
            휴대전화 <span className="opacity-50">(선택)</span>
          </label>
          <input
            id="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
            placeholder="010-0000-0000"
            className="block w-full bg-transparent border-0 border-b border-[var(--color-hair-strong)] py-2 text-[14px] font-mono tabular-nums text-[var(--color-ink)] placeholder:text-[var(--color-ink-faint)] focus:outline-none focus:border-[var(--color-ink)] transition-colors"
          />
        </div>
        <Button type="submit" fullWidth size="lg">다음</Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 5.4: Create `PgWorkspaceConfirm` component**

Create `components/auth/PgWorkspaceConfirm.tsx`:

```tsx
'use client';

import { Button } from '@/components/primitives/Button';

type Props = {
  domain: string;
  onConfirm: () => Promise<void>;
  submitting: boolean;
  error?: string;
};

export function PgWorkspaceConfirm({ domain, onConfirm, submitting, error }: Props) {
  return (
    <div className="space-y-8">
      <div className="border border-[var(--color-hair)] rounded-[5px] px-5 py-5 space-y-3">
        <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-[var(--color-ink-soft)]">
          자동 합류 워크스페이스
        </p>
        <p className="text-[15px] font-[600] text-[var(--color-ink)]">
          @{domain}
        </p>
        <p className="text-[12px] text-[var(--color-ink-muted)] leading-snug">
          이메일 도메인을 기반으로 PG 워크스페이스에 자동으로 합류합니다.
          동일 도메인의 동료와 같은 워크스페이스를 공유합니다.
        </p>
      </div>

      {error && (
        <p role="alert" className="font-mono text-[10px] tracking-[0.12em] uppercase text-[var(--color-terracotta)]">
          {error}
        </p>
      )}

      <Button
        type="button"
        fullWidth
        size="lg"
        disabled={submitting}
        onClick={onConfirm}
      >
        {submitting ? '처리 중…' : '합류하기'}
      </Button>
    </div>
  );
}
```

- [ ] **Step 5.5: Create Gs4 — PG workspace auto-join page**

Create `app/(public)/signup/pg/workspace/page.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { Serial } from '@/components/primitives/Serial';
import { PgWorkspaceConfirm } from '@/components/auth/PgWorkspaceConfirm';
import { signupCompleteAction } from '@/lib/server/actions/auth';
import { clearSignupDraft, readSignupDraft } from '@/lib/auth/signup-storage';

export default function PgWorkspacePage() {
  const router = useRouter();
  const [domain, setDomain] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [isInvite, setIsInvite] = useState(false);

  useEffect(() => {
    const draft = readSignupDraft();
    const email = draft.email ?? '';
    const idx = email.lastIndexOf('@');
    setDomain(idx > 0 ? email.slice(idx + 1) : '');
    setIsInvite(!!draft.inviteToken);
  }, []);

  const handleConfirm = useCallback(async () => {
    const draft = readSignupDraft();
    if (!draft.email || !draft.password || !draft.name) {
      setError('가입 정보가 누락되었습니다. 처음부터 다시 시도해주세요.');
      return;
    }
    setSubmitting(true);
    setError('');

    const r = await signupCompleteAction({
      email: draft.email,
      name: draft.name,
      password: draft.password,
      ...(draft.inviteToken
        ? { inviteToken: draft.inviteToken }
        : { wsKind: 'pg' }),
    });

    if (!r.ok) {
      setSubmitting(false);
      setError(`가입을 완료하지 못했습니다. (${r.error})`);
      return;
    }

    const signInResult = await signIn('credentials', {
      email: r.email,
      password: r.password,
      redirect: false,
    });
    clearSignupDraft();
    if (signInResult?.error) {
      setSubmitting(false);
      router.push('/login');
      return;
    }
    router.push(r.redirectTo);
  }, [router]);

  const current = isInvite ? 3 : 4;
  const total = isInvite ? 3 : 4;

  return (
    <div className="space-y-8">
      <div>
        <Serial current={current} total={total} label="WORKSPACE" className="block mb-4" />
        <h2 className="text-[26px] font-[700] tracking-[-0.02em] text-[var(--color-ink)]">
          워크스페이스에 합류합니다
        </h2>
        <p className="mt-2 text-[13px] text-[var(--color-ink-muted)]">
          이메일 도메인으로 PG 워크스페이스가 자동 연결됩니다.
        </p>
      </div>

      {domain && (
        <PgWorkspaceConfirm
          domain={domain}
          onConfirm={handleConfirm}
          submitting={submitting}
          error={error}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 5.6: Commit**

```bash
git add 'app/(public)/signup/pg/' \
        components/auth/PgWorkspaceConfirm.tsx
git commit -m "feat: add PG signup flow Gs1-Gs4 (/signup/pg)"
```

---

## Task 6: Update `/auth/verify` token routing

The current page routes to `/signup/profile` after consuming a token. Update it to route to `/signup/buyer/profile` or `/signup/pg/profile` based on `workspaceType` returned by `verifyEmailAction`.

**Files:**
- Modify: `app/(public)/auth/verify/page.tsx`

- [ ] **Step 6.1: Update the token success branch in `/auth/verify`**

In `app/(public)/auth/verify/page.tsx`, find the effect that calls `verifyEmailAction` and update:

```ts
// After: const r = await verifyEmailAction(token);
if (!r.ok) {
  setState('expired');
  return;
}
const draft = readSignupDraft();
// workspaceType comes from token meta (cross-device safe)
const kind = r.workspaceType ?? draft.workspaceType ?? 'buyer';
writeSignupDraft({
  ...draft,
  email: r.email,
  emailVerified: true,
  workspaceType: kind,
  inviteToken: r.inviteToken ?? draft.inviteToken,
});
setState('success');
setTimeout(() => router.push(`/signup/${kind}/profile`), 600);
```

Also update the "expired" resend link — currently hard-coded to `/signup`. It should now be dynamic based on `workspaceType`:

```tsx
// In the expired state render:
const fallbackKind = readSignupDraft().workspaceType ?? 'buyer';
// Link href: `/signup/${fallbackKind}`
```

Actually, to keep it simple (the page is a functional component, not using hooks for this), just link to `/signup` as the fallback (the role chooser), which is always safe:

```tsx
if (state === 'expired') {
  return (
    <div className="space-y-4 text-center">
      <p className="text-[13px] text-[var(--color-terracotta)]">링크가 만료되었습니다.</p>
      <Link href="/signup" className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-ink)] hover:text-[var(--color-ink-muted)]">
        재시도 →
      </Link>
    </div>
  );
}
```

The `?email=...` announcement branch (currently in `/auth/verify`) is now superseded by the role-specific verify wait pages (Bs2, Gs2). Remove the `token == null` branch entirely — or redirect it to `/signup`:

```ts
// If no token query param, redirect to /signup (role selection)
if (token == null) {
  router.replace('/signup');
  return null;
}
```

- [ ] **Step 6.2: Confirm verify routes correctly in browser**

1. Complete Bs1 → get email link
2. Click the link in email (`/auth/verify?token=...`)
3. Should redirect to `/signup/buyer/profile` (Bs3) — not `/signup/profile`

- [ ] **Step 6.3: Commit**

```bash
git add 'app/(public)/auth/verify/page.tsx'
git commit -m "feat: route /auth/verify token success to /signup/{kind}/profile based on workspaceType"
```

---

## Task 7: Update invite flow — PG invite → Gs2 (skip Rs1 + Gs1)

**Files:**
- Modify: `app/(public)/invite/rfp/[token]/page.tsx`
- Modify: `app/(public)/invite/rfp/[token]/InviteUnauthClient.tsx`

- [ ] **Step 7.1: Resolve invite email in the RSC**

In `app/(public)/invite/rfp/[token]/page.tsx`, add invitation lookup for unauthenticated users:

```tsx
import { auth } from '@/auth';
import { getInvitationRepo } from '@/lib/server/repositories/factory';
import { hashToken } from '@/lib/server/token';
import { InviteUnauthClient } from './InviteUnauthClient';
import { InviteAuthedClient } from './InviteAuthedClient';

type Props = { params: Promise<{ token: string }> };

export default async function InviteRfpPage({ params }: Props) {
  const { token } = await params;
  const session = await auth();

  if (!session?.user?.id) {
    // Resolve invite email so the client can pre-fill and skip Gs1
    const repo = await getInvitationRepo();
    const invitation = await repo.findByTokenHash(hashToken(token));
    return (
      <InviteUnauthClient
        token={token}
        inviteEmail={invitation?.pgEmail}
      />
    );
  }

  return <InviteAuthedClient token={token} />;
}
```

- [ ] **Step 7.2: Update `InviteUnauthClient` to call `signupEmailAction` and route to Gs2**

Replace the contents of `app/(public)/invite/rfp/[token]/InviteUnauthClient.tsx`:

```tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signupEmailAction } from '@/lib/server/actions/auth';
import { readSignupDraft, writeSignupDraft } from '@/lib/auth/signup-storage';

type Props = {
  token: string;
  inviteEmail?: string;
};

// PG invite landing for unauthenticated users.
// - If invite email resolved: send verification email, pre-fill draft, go to Gs2.
// - If invite email not resolved (expired/invalid token): go to Gs1 for manual entry.
export function InviteUnauthClient({ token, inviteEmail }: Props) {
  const router = useRouter();

  useEffect(() => {
    void (async () => {
      const draft = readSignupDraft();
      // Always mark workspaceType + inviteToken in draft
      writeSignupDraft({ ...draft, workspaceType: 'pg', inviteToken: token });

      if (!inviteEmail) {
        // Token invalid/expired — go to Gs1 so the user can enter their email
        router.replace('/signup/pg');
        return;
      }

      // Send verification email and skip Gs1
      const r = await signupEmailAction({
        email: inviteEmail,
        workspaceType: 'pg',
        inviteToken: token,
      });
      const updatedDraft = readSignupDraft();
      if (r.ok) {
        writeSignupDraft({ ...updatedDraft, email: r.email });
        router.replace('/signup/pg/verify');
      } else {
        // signupEmailAction failed (rate-limited, etc.) — fall through to Gs1
        router.replace('/signup/pg');
      }
    })();
  }, [token, inviteEmail, router]);

  return (
    <div className="py-8 text-center">
      <p className="font-mono text-[12px] tracking-[0.16em] uppercase text-[var(--color-ink-soft)]">
        LOADING…
      </p>
      <p className="mt-2 text-[13px] text-[var(--color-ink-muted)]">
        초대 링크를 확인하는 중입니다.
      </p>
    </div>
  );
}
```

- [ ] **Step 7.3: Smoke-test invite flow**

With `pnpm dev` running:
1. Simulate `/invite/rfp/mock-token` with a seeded invitation (or check logs)
2. Confirm redirect: unauthenticated user lands on Gs2, email pre-filled

- [ ] **Step 7.4: Commit**

```bash
git add 'app/(public)/invite/rfp/[token]/page.tsx' \
        'app/(public)/invite/rfp/[token]/InviteUnauthClient.tsx'
git commit -m "feat: update invite flow — resolve email in RSC, route unauthenticated PG to Gs2"
```

---

## Task 8: Cleanup — delete old signup files + WorkspaceTypeRadio

**Files to delete:**
- `app/(public)/signup/verify/page.tsx` (was redirect shim; replaced by Bs2/Gs2)
- `app/(public)/signup/profile/page.tsx` (replaced by Bs3/Gs3)
- `app/(public)/signup/workspace/page.tsx` (replaced by Bs4/Gs4)
- `components/auth/WorkspaceTypeRadio.tsx` (replaced by role selection at Rs1)
- `components/auth/__tests__/WorkspaceTypeRadio.test.tsx`

- [ ] **Step 8.1: Delete old files**

```bash
cd /Users/yeonseong/project/bidit
rm 'app/(public)/signup/verify/page.tsx'
rm 'app/(public)/signup/profile/page.tsx'
rm 'app/(public)/signup/workspace/page.tsx'
rm 'components/auth/WorkspaceTypeRadio.tsx'
rm 'components/auth/__tests__/WorkspaceTypeRadio.test.tsx'
```

- [ ] **Step 8.2: Verify no remaining imports**

```bash
grep -rn "WorkspaceTypeRadio\|signup/verify\|signup/profile\b\|signup/workspace" \
  app components lib --include="*.tsx" --include="*.ts"
```

Expected: 0 matches (any existing comments OK if the file itself is deleted).

- [ ] **Step 8.3: Run full type-check and test suite**

```bash
cd /Users/yeonseong/project/bidit && pnpm tsc --noEmit && pnpm test
```

Expected: 0 type errors, all tests pass.

- [ ] **Step 8.4: Commit**

```bash
git add -A
git commit -m "chore: remove old single-flow signup pages and WorkspaceTypeRadio"
```

---

## Task 9: Full verification — scenarios D, E, F, G

- [ ] **Step 9.1: Scenario D — buyer self-service**

```
/signup → click "구매사" → /signup/buyer (Bs1)
→ enter email + check terms → [인증 메일 받기] → /signup/buyer/verify (Bs2)
→ open email link → /auth/verify?token=... → /signup/buyer/profile (Bs3)
→ fill name + password → [다음] → /signup/buyer/workspace (Bs4)
→ enter ws name + biz lookup + grade confirm → [만들기] → /rfp
```

Expected: landing at `/rfp` as admin.

- [ ] **Step 9.2: Scenario E — PG invite**

```
/invite/rfp/:token → (unauthenticated) → loading → /signup/pg/verify (Gs2, email pre-filled)
→ open email link → /auth/verify?token=... → /signup/pg/profile (Gs3)
→ fill name + password → [다음] → /signup/pg/workspace (Gs4)
→ see domain card → [합류하기] → /inbox/:rfpId
```

Expected: landing at `/inbox/:rfpId` as member.

- [ ] **Step 9.3: Scenario F — PG direct signup**

```
/signup → click "PG사 영업담당" → /signup/pg (Gs1)
→ enter email + check terms → [인증 메일 받기] → /signup/pg/verify (Gs2)
→ open email link → /auth/verify?token=... → /signup/pg/profile (Gs3)
→ fill name + password → [다음] → /signup/pg/workspace (Gs4)
→ see domain card → [합류하기] → /inbox
```

Expected: landing at `/inbox` as admin (new PG workspace created).

- [ ] **Step 9.4: Scenario G — password recovery (unchanged)**

```
/login → 비밀번호를 잊으셨나요? → /password/forgot → email → reset link
→ /password/reset?token=... → new password → /home
```

Expected: no regression from cleanup.

- [ ] **Step 9.5: Run full test suite**

```bash
cd /Users/yeonseong/project/bidit && pnpm test
```

Expected: all tests pass.

- [ ] **Step 9.6: Commit**

```bash
git commit --allow-empty -m "chore: verified PG/buyer signup split E2E — scenarios D/E/F/G pass"
```

---

## Self-review

**Spec coverage check:**

| Spec item | Covered in |
|---|---|
| Rs1 `/signup` role selection | Task 3 |
| Bs1-Bs4 buyer flow | Task 4 |
| Gs1-Gs4 PG flow | Task 5 |
| `workspaceType` in `SignupDraft` / `SignupClientDraft` | Task 1 |
| `workspaceType` threaded through email verify token | Task 2 |
| `/auth/verify` routes to buyer/pg profile | Task 6 |
| `/invite/rfp/:token` → Gs2 (skip Rs1+Gs1) | Task 7 |
| `redirectTo` → `/rfp` (buyer), `/inbox` (pg) | Task 2 |
| Old P6 workspace chooser removed | Task 8 |
| `WorkspaceTypeRadio` removed | Task 8 |

**Placeholder scan:** None — all steps include complete code.

**Type consistency:**
- `workspaceType: 'buyer' | 'pg'` used consistently across `SignupDraft`, `SignupClientDraft`, `signupEmailAction` input, `verifyEmailAction` result, and all page components.
- `inviteToken` field name kept as-is in `SignupClientDraft` (matches existing `signupCompleteAction` parameter name).
- `RoleChooser` exported as named export (consistent with `WorkspaceTypeRadio` pattern it replaces).
- `BuyerWorkspaceForm` and `PgWorkspaceConfirm` are named exports (consistent with other `components/auth/` components).
