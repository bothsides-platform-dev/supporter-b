'use client';
import { useState } from 'react';
import { useStore } from 'zustand';
import { Button } from '@/components/primitives/Button';
import { publicInputClass } from '@/components/forms/inputs';
import type { GuestQuoteController } from '@/lib/guest-rfp/quote-controller';
import {
  clearInstantResume,
  readInstantResume,
  rememberInstantInput,
} from '@/lib/guest-rfp/instant-resume';
import { confirmedBusiness } from '@/lib/guest-rfp/business-confirmation';
import { saveGuestProgress } from '@/lib/guest-rfp/server-client';
import { VOLUME_BANDS, VOLUME_LABELS } from '@/lib/rfp/assignment';
import {
  inputSchema,
  instantVolumeEligible,
  type InstantInput,
  type Offers,
} from '@/lib/rfp/instant-quote';
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS } from '@/lib/types/bid';
import type { PublicIndustry } from '@/lib/types/pg-recommendation';
import { CurrentPgSelection, type CurrentPgOption } from './CurrentPgSelection';
import { RfpDraftProvider } from '@/lib/stores/rfp-draft-context';
import { previewInstantAction } from '@/lib/server/actions/instant-quotes';
import { InstantSelection } from './InstantSelection';
export function InstantIntake({
  quote,
  industries,
  pgList,
  loggedIn,
  onConsult,
}: {
  quote: GuestQuoteController;
  industries: PublicIndustry[];
  pgList: CurrentPgOption[];
  loggedIn: boolean;
  onConsult: () => void;
}) {
  const d = useStore(quote.session.store),
    draftId = quote.session.draft.id;
  const [saved] = useState(() =>
    readInstantResume(
      draftId,
      confirmedBusiness(quote.snapshot(), d.websiteUrl),
    ),
  );
  const [input, setInput] = useState<InstantInput | undefined>(saved),
    [offers, setOffers] = useState<Offers>(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [unit, setUnit] = useState<'business' | 'calendar'>(
      saved?.current?.cycle?.unit ?? 'business',
    ),
    [cycle, setCycle] = useState(String(saved?.current?.cycle?.days ?? '')),
    [insurance, setInsurance] = useState(
      saved?.current?.insurance?.kind === 'fixed'
        ? String(saved.current.insurance.won)
        : '',
    ),
    [limit, setLimit] = useState(
      saved?.current?.limit?.kind === 'fixed'
        ? String(saved.current.limit.won)
        : '',
    ),
    [revenue, setRevenue] = useState(String(saved?.annualRevenue ?? ''));
  const submit = async () => {
    const business = confirmedBusiness(quote.snapshot(), d.websiteUrl);
    if (!business) {
      quote.update({ stage: 'website' });
      return;
    }
    if (d.customPaymentMethods?.length || quote.session.draft.files.length) {
      onConsult();
      return;
    }
    const result = inputSchema.safeParse({
      business,
      groupId: d.industryMode === 'custom' ? null : d.industryGroupId || null,
      customIndustry: d.customIndustryName,
      products: d.mainProducts,
      contractType: d.contractType,
      expectedVolume: d.contractType === 'new' ? d.expectedVolume : undefined,
      monthlyAvgPgVolume:
        d.contractType === 'renewal' ? d.monthlyAvgPgVolume : undefined,
      methods: d.requiredPaymentMethods,
      currentPgs: d.contractType === 'renewal' ? d.currentPgs : [],
      annualRevenue: revenue ? Number(revenue) : undefined,
      current:
        d.contractType === 'renewal'
          ? {
              insurance: insurance
                ? { kind: 'fixed', won: Number(insurance) }
                : undefined,
              limit: limit ? { kind: 'fixed', won: Number(limit) } : undefined,
              cycle: cycle ? { days: Number(cycle), unit } : undefined,
            }
          : undefined,
    });
    if (!result.success) {
      setError(
        '업종, 주요 상품, 거래액, 이용 중인 PG와 결제수단을 확인해주세요.',
      );
      return;
    }
    if (!instantVolumeEligible(result.data)) {
      onConsult();
      return;
    }
    setBusy(true);
    setError('');
    try {
      await saveGuestProgress(quote.session.draft, quote.session.save);
      const preview = await previewInstantAction({
        key: quote.session.draft.id,
        input: result.data,
        screen: d.productInfo,
      });
      if (!preview.ok) {
        setError(preview.error);
        return;
      }
      setOffers(preview.value);
      rememberInstantInput(draftId, result.data);
      setInput(result.data);
    } catch {
      setError('초안을 저장하지 못했어요. 연결을 확인하고 다시 시도해주세요.');
    } finally {
      setBusy(false);
    }
  };
  if (input)
    return (
      <InstantSelection
        draftKey={quote.session.draft.id}
        input={input}
        initialOffers={offers}
        loggedIn={loggedIn}
        onBack={() => {
          clearInstantResume(draftId);
          setInput(undefined);
        }}
        onConsult={onConsult}
        initialScreen={d.productInfo}
      />
    );
  return (
    <RfpDraftProvider value={quote.session.store}>
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <h2 className="text-xl font-semibold">어떤 결제 조건이 필요한가요?</h2>
        <p>
          {d.websiteUrl} · {quote.snapshot().bizNo}{' '}
          <Button
            type="button"
            variant="text"
            onClick={() => quote.update({ stage: 'website' })}
          >
            수정
          </Button>
        </p>
        <label className="block">
          업종
          <select
            className={publicInputClass}
            required
            value={d.industryMode === 'custom' ? 'custom' : d.industryGroupId}
            onChange={(e) => {
              d.setField(
                'industryMode',
                e.target.value === 'custom' ? 'custom' : 'registered',
              );
              d.setField(
                'industryGroupId',
                e.target.value === 'custom' ? '' : e.target.value,
              );
            }}
          >
            <option value="">선택해주세요</option>
            {industries.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
            <option value="custom">직접 입력</option>
          </select>
        </label>
        {d.industryMode === 'custom' && (
          <label>
            업종명
            <input
              required
              className={publicInputClass}
              value={d.customIndustryName}
              onChange={(e) => d.setField('customIndustryName', e.target.value)}
            />
          </label>
        )}
        <label className="block">
          주요 판매 상품
          <input
            required
            maxLength={200}
            className={publicInputClass}
            value={d.mainProducts}
            onChange={(e) => d.setField('mainProducts', e.target.value)}
          />
        </label>
        <label className="block">
          계약 유형
          <select
            required
            className={publicInputClass}
            value={d.contractType ?? ''}
            onChange={(e) =>
              d.setField(
                'contractType',
                e.target.value === 'renewal'
                  ? 'renewal'
                  : e.target.value === 'new'
                    ? 'new'
                    : null,
              )
            }
          >
            <option value="">선택해주세요</option>
            <option value="new">첫 PG 계약</option>
            <option value="renewal">기존 PG 계약 갱신</option>
          </select>
        </label>
        {d.contractType === 'new' && (
          <label className="block">
            예상 월 PG 거래액
            <select
              required
              className={publicInputClass}
              value={d.expectedVolume ?? ''}
              onChange={(e) =>
                d.setField(
                  'expectedVolume',
                  VOLUME_BANDS.find((v) => v === e.target.value),
                )
              }
            >
              <option value="">선택해주세요</option>
              {VOLUME_BANDS.map((b) => (
                <option key={b} value={b}>
                  {VOLUME_LABELS[b]}
                </option>
              ))}
            </select>
          </label>
        )}
        {d.contractType === 'renewal' && (
          <>
            <label className="block">
              전년도 월평균 PG 거래액 (원)
              <input
                required
                type="number"
                min="0"
                className={publicInputClass}
                value={d.monthlyAvgPgVolume}
                onChange={(e) =>
                  d.setField('monthlyAvgPgVolume', e.target.value)
                }
              />
            </label>
            <h3>현재 이용 중인 PG</h3>
            <CurrentPgSelection
              pgList={pgList}
              attempted={false}
              presentation="public"
            />
            <details>
              <summary>현재 정산·보험 조건 입력 (선택)</summary>
              <div className="space-y-3 py-3">
                <label className="block">
                  현재 보증보험 가입금액 (원)
                  <input
                    type="number"
                    min="0"
                    className={publicInputClass}
                    value={insurance}
                    onChange={(e) => setInsurance(e.target.value)}
                  />
                </label>
                <label className="block">
                  현재 정산한도 (원)
                  <input
                    type="number"
                    min="0"
                    className={publicInputClass}
                    value={limit}
                    onChange={(e) => setLimit(e.target.value)}
                  />
                </label>
                <label className="block">
                  현재 정산주기 (D+일수)
                  <input
                    type="number"
                    min="0"
                    max="365"
                    className={publicInputClass}
                    value={cycle}
                    onChange={(e) => setCycle(e.target.value)}
                  />
                </label>
                <label>
                  기간 단위
                  <select
                    value={unit}
                    onChange={(e) =>
                      setUnit(
                        e.target.value === 'calendar' ? 'calendar' : 'business',
                      )
                    }
                  >
                    <option value="business">영업일</option>
                    <option value="calendar">달력일</option>
                  </select>
                </label>
              </div>
            </details>
          </>
        )}
        <fieldset>
          <legend>사용할 결제수단</legend>
          {PAYMENT_METHODS.map((m) => (
            <label key={m} className="mr-4 inline-flex gap-1">
              <input
                type="checkbox"
                checked={d.requiredPaymentMethods.includes(m)}
                onChange={(e) =>
                  d.setField(
                    'requiredPaymentMethods',
                    e.target.checked
                      ? [...d.requiredPaymentMethods, m]
                      : d.requiredPaymentMethods.filter((x) => x !== m),
                  )
                }
              />
              {PAYMENT_METHOD_LABELS[m]}
            </label>
          ))}
        </fieldset>
        <label className="block">
          연매출 구간 (선택)
          <select
            className={publicInputClass}
            value={revenue}
            onChange={(e) => setRevenue(e.target.value)}
          >
            <option value="">선택하지 않음</option>
            {[
              '3억 원 이하',
              '3억 초과 ~ 5억 원 이하',
              '5억 초과 ~ 10억 원 이하',
              '10억 초과 ~ 30억 원 이하',
              '30억 원 초과',
            ].map((s, i) => (
              <option key={s} value={[3e8, 5e8, 1e9, 3e9, 3e9 + 1][i]}>
                {s}
              </option>
            ))}
          </select>
        </label>
        {error && <p role="alert">{error}</p>}
        <Button type="submit" disabled={busy}>
          견적 조회하기
        </Button>
      </form>
    </RfpDraftProvider>
  );
}
