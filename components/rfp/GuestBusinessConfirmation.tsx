'use client';
import { useState, type ReactNode } from 'react';
import { useStore, type StoreApi } from 'zustand';
import type { RfpDraftStore } from '@/lib/stores/rfp-draft';
import { assignmentIntakeEnabled } from '@/lib/rfp/assignment';
import { businessConfirmationSchema, confirmedBusiness } from '@/lib/guest-rfp/business-confirmation';
import type { QuoteContext } from '@/lib/guest-rfp/quote-context';
import { normalizeWebsiteUrl, isValidWebsiteUrlLight } from '@/lib/validation/website-url';
import { Button } from '@/components/primitives/Button';

export function GuestBusinessConfirmation({
  store,
  context,
  children,
}: {
  store: StoreApi<RfpDraftStore>;
  context?: QuoteContext;
  children: ReactNode;
}) {
  const website = useStore(store, (s) => s.websiteUrl);
  const local = useStore(store, (s) => s.guestBusiness);
  const [biz, setBiz] = useState('');
  const [error, setError] = useState('');
  const site = normalizeWebsiteUrl(website.trim());
  if (
    !assignmentIntakeEnabled() ||
    (local && site === local.website) ||
    confirmedBusiness(context, site)
  )
    return children;
  return (
    <form
      className="mx-auto w-full max-w-lg space-y-4 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const result = businessConfirmationSchema.safeParse({
          website: site,
          bizNo: biz.replaceAll('-', '').trim(),
        });
        if (!result.success || !isValidWebsiteUrlLight(site)) {
          setError('홈페이지 주소와 사업자등록번호를 확인해주세요.');
          return;
        }
        store.setState({ websiteUrl: site, guestBusiness: result.data });
      }}
    >
      <h2 className="text-xl font-semibold">상담을 신청할 사업자를 확인해요</h2>
      <label className="block">
        홈페이지 주소
        <input
          className="block w-full rounded border p-2"
          value={website}
          required
          onChange={(e) => store.getState().setField('websiteUrl', e.target.value)}
        />
      </label>
      <label className="block">
        사업자등록번호
        <input
          className="block w-full rounded border p-2"
          inputMode="numeric"
          maxLength={12}
          value={biz}
          required
          onChange={(e) => setBiz(e.target.value)}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <Button type="submit">확인하고 이어 쓰기</Button>
    </form>
  );
}
