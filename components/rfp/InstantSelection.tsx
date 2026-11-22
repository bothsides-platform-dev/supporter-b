'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/primitives/Button';
import { publicInputClass } from '@/components/forms/inputs';
import {
  MAXIMUM_PRICE_LABELS,
  MAXIMUM_PRICE_VALUES,
  SALES_METHOD_LABELS,
  SALES_METHOD_VALUES,
} from '@/lib/rfp/product-info';
import {
  commitment,
  instantConsentVersion,
  screeningKeys,
  sharing,
  type InstantInput,
  type Offer,
  type Offers,
  type ScreenKey,
  type Screening,
} from '@/lib/rfp/instant-quote';
import {
  previewInstantAction,
  confirmInstantAction,
  updateInstantAction,
} from '@/lib/server/actions/instant-quotes';
import { clearInstantResume } from '@/lib/guest-rfp/instant-resume';
import { InstantTerms } from './InstantTerms';
export function InstantSelection({
  draftKey,
  input,
  previous,
  loggedIn,
  onBack,
  onConsult,
  initialScreen = {},
  initialOffers,
}: {
  draftKey: string;
  input: InstantInput;
  previous?: string;
  loggedIn: boolean;
  onBack?: () => void;
  onConsult?: () => void;
  initialScreen?: Partial<Screening>;
  initialOffers?: Offers;
}) {
  const router = useRouter();
  const [response, setResponse] = useState<Offers | undefined>(initialOffers),
    [selected, setSelected] = useState<Offer>(),
    [screen, setScreen] = useState(initialScreen);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [agree, setAgree] = useState(false),
    [share, setShare] = useState(false);
  const [issued, setIssued] = useState('');
  const preview = async () => {
    const res = await previewInstantAction({
      key: draftKey,
      input,
      previous,
      screen,
    });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setResponse(res.value);
    setSelected(undefined);
    setAgree(false);
    setShare(false);
  };
  const confirm = async () => {
    if (!selected) return;
    const res = await confirmInstantAction({
      key: draftKey,
      input,
      previous,
      screen,
      pgId: selected.terms.pgId,
      stamp: selected.stamp,
      expires: selected.expires,
      agree,
      share,
      consentVersion: instantConsentVersion,
    });
    if (!res.ok) {
      await preview();
      setError(res.error);
      return;
    }
    if (!previous) clearInstantResume(draftKey, true);
    const path = '/instant-quotes/' + res.value.id;
    setIssued(path);
    const handoff = await updateInstantAction(res.value.id, 'visit');
    if (handoff.ok && handoff.value.url) {
      window.history.replaceState(null, '', path);
      window.location.assign(handoff.value.url);
    } else router.replace(path);
  };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch {
      setError('연결을 확인하고 다시 시도해주세요.');
    } finally {
      setBusy(false);
    }
  };
  const choose = (o: Offer) => {
    setSelected(o);
    setAgree(false);
    setShare(false);
    setError('');
  };
  const update = <K extends ScreenKey>(k: K, v: Partial<Screening>[K]) => {
    setScreen((prev) => ({ ...prev, [k]: v }));
    setAgree(false);
    setShare(false);
  };
  function questions(keys: readonly ScreenKey[]) {
    return (
      <div className="space-y-4">
        {keys.includes('cashConvertible') && (
          <label className="block">
            환금성 상품을 판매하나요?
            <select
              required
              className={publicInputClass}
              value={
                screen.cashConvertible === undefined
                  ? ''
                  : String(screen.cashConvertible)
              }
              onChange={(e) =>
                update(
                  'cashConvertible',
                  e.target.value === '' ? undefined : e.target.value === 'true',
                )
              }
            >
              <option value="">선택해주세요</option>
              <option value="true">예</option>
              <option value="false">아니요</option>
            </select>
          </label>
        )}
        {keys.includes('maximumPrice') && (
          <label className="block">
            가장 비싼 상품 가격대
            <select
              required
              className={publicInputClass}
              value={screen.maximumPrice ?? ''}
              onChange={(e) =>
                update(
                  'maximumPrice',
                  MAXIMUM_PRICE_VALUES.find((v) => v === e.target.value),
                )
              }
            >
              <option value="">선택해주세요</option>
              {MAXIMUM_PRICE_VALUES.map((v) => (
                <option key={v} value={v}>
                  {MAXIMUM_PRICE_LABELS[v]}
                </option>
              ))}
            </select>
          </label>
        )}
        {keys.includes('salesMethods') && (
          <fieldset>
            <legend>판매 방식</legend>
            {SALES_METHOD_VALUES.map((v) => (
              <label key={v} className="mr-4 inline-flex gap-1">
                <input
                  type="checkbox"
                  checked={screen.salesMethods?.includes(v) ?? false}
                  onChange={(e) =>
                    update(
                      'salesMethods',
                      e.target.checked
                        ? v === 'none'
                          ? ['none']
                          : [
                              ...(screen.salesMethods ?? []).filter(
                                (x) => x !== 'none',
                              ),
                              v,
                            ]
                        : (screen.salesMethods ?? []).filter((x) => x !== v),
                    )
                  }
                />
                {SALES_METHOD_LABELS[v]}
              </label>
            ))}
          </fieldset>
        )}
        {keys.includes('deliveryDays') && (
          <label className="block">
            결제 후 배송·서비스 완료까지 최대 며칠 걸리나요?
            <input
              type="number"
              min="0"
              max="3650"
              required
              className={publicInputClass}
              value={screen.deliveryDays ?? ''}
              onChange={(e) =>
                update(
                  'deliveryDays',
                  e.target.value === '' ? undefined : Number(e.target.value),
                )
              }
            />
          </label>
        )}
      </div>
    );
  }
  if (issued) return <Link href={issued}>확정한 견적과 가입 링크 보기</Link>;
  return (
    <div className="space-y-5">
      <h2 className="text-xl font-semibold">
        {previous ? '다음 PG에 신청해요' : 'PG 가입 예상 견적'}
      </h2>
      {error && <p role="alert">{error}</p>}
      {!selected && (
        <>
          {response?.offers.map((o) => (
            <div key={o.terms.pgId} className="space-y-3 rounded-lg border p-4">
              <h3 className="font-semibold">{o.terms.pgName}</h3>
              <InstantTerms terms={o.terms} input={input} tier={o.tier} />
              <Button disabled={busy} onClick={() => choose(o)}>
                이 PG로 신청하기
              </Button>
            </div>
          ))}
          {response?.risk === 'black' ? (
            <p>이 업종은 신청할 수 없어요.</p>
          ) : response &&
            !response.offers.length &&
            !response.questions.length ? (
            <p>
              바로 가입할 수 있는 PG가 없어요. 상담에서 조건을 확인해주세요.
            </p>
          ) : null}
          {(!response || response.questions.length > 0) && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void run(preview);
              }}
            >
              {response && (
                <>
                  <p>PG가 조건을 확정하려면 이 답변이 필요해요.</p>
                  {questions(response.questions)}
                </>
              )}
              <Button type="submit" disabled={busy}>
                예상 견적 확인
              </Button>
            </form>
          )}
          {response && response.risk !== 'black' && onConsult && (
            <Button variant="outlined" onClick={onConsult}>
              맞춤 상담으로 이어가기
            </Button>
          )}
          {onBack && (
            <Button variant="text" disabled={busy} onClick={onBack}>
              사업 정보 수정
            </Button>
          )}
        </>
      )}
      {selected && (
        <>
          <h3 className="font-semibold">{selected.terms.pgName}</h3>
          <InstantTerms
            terms={selected.terms}
            input={input}
            tier={selected.tier}
          />
          {loggedIn ? (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void run(confirm);
              }}
            >
              {questions(screeningKeys)}
              <label className="flex gap-2">
                <input
                  type="checkbox"
                  required
                  checked={agree}
                  onChange={(e) => setAgree(e.target.checked)}
                />
                {commitment}
              </label>
              <label className="flex gap-2">
                <input
                  type="checkbox"
                  required
                  checked={share}
                  onChange={(e) => setShare(e.target.checked)}
                />
                {sharing(selected.terms.pgName)}
              </label>
              <Button disabled={busy} type="submit">
                신청 확정하고 PG 가입하기
              </Button>
            </form>
          ) : (
            <div className="flex gap-4">
              <Link href="/signup/buyer?next=%2Fquote-start">
                회원가입하고 신청하기
              </Link>
              <Link href="/login?next=%2Fquote-start">로그인하고 신청하기</Link>
            </div>
          )}
          <Button
            variant="text"
            disabled={busy}
            onClick={() => setSelected(undefined)}
          >
            다른 견적 확인
          </Button>
        </>
      )}
    </div>
  );
}
