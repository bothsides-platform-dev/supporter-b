import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BuyerSignupWorkspaceForm } from '../BuyerSignupWorkspaceForm';
import { createGuestDraft, saveGuestDraft } from '@/lib/guest-rfp/draft';
import { newQuoteContext } from '@/lib/guest-rfp/quote-context';
import { saveGuestForSignup } from '@/lib/guest-rfp/server-client';
import { readSignupDraft, writeSignupDraft } from '@/lib/auth/signup-storage';
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock('@/components/rfp/nts-lookup', () => ({ ntsLookup: vi.fn(async () => ({ valid: true, taxType: 'general', status: 'active' })) }));
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); writeSignupDraft({ email: 'a@example.com', password: 'password', next: '/rfp-create?resume=guest' }); });
async function prepare() {
  const draft = createGuestDraft();
  draft.quoteContext = { ...newQuoteContext(), companyName: '노온', bizNo: '1248100998' };
  saveGuestDraft(draft);
  vi.stubGlobal('fetch', async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    return Response.json(body.op === 'session' ? { ok: true } : { id: draft.id, revision: 1 });
  });
  await saveGuestForSignup(draft, () => saveGuestDraft(draft));
  vi.unstubAllGlobals();
  return draft;
}
it('현재 초안의 회사명·번호를 넘기되 검증 결과로 취급하지 않는다', async () => {
  await prepare();
  render(<BuyerSignupWorkspaceForm />);
  expect(screen.getByPlaceholderText('(주)샘플테크')).toHaveValue('노온');
  expect(screen.getByLabelText('사업자 등록번호')).toHaveValue('124-81-00998');
  expect(screen.getByRole('button', { name: '워크스페이스 만들기' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '조회' }));
  await waitFor(() => expect(screen.getByRole('button', { name: '워크스페이스 만들기' })).toBeEnabled());
});
it.each(['number', 'draft'])('가입 인계 후 %s 변경 시 예전 회사 정보를 재사용하지 않는다', async change => {
  const draft = await prepare();
  writeSignupDraft({ ...readSignupDraft(), wsName: '이전에 확인한 회사',
    bizProfile: { bizNo: '1248100998', status: 'active', taxType: 'general' },
    guestQuoteBinding: { id: draft.id, bizNo: '1248100998' } });
  if (change === 'number') draft.quoteContext!.bizNo = '1234567890';
  else { localStorage.clear(); draft.id = crypto.randomUUID(); draft.revision = 0; }
  saveGuestDraft(draft);
  render(<BuyerSignupWorkspaceForm />);
  expect(screen.getByPlaceholderText('(주)샘플테크')).toHaveValue('');
  expect(screen.getByLabelText('사업자 등록번호')).toHaveValue('');
});
