import {
  conditionLines,
  estimatedSaving,
  feeRows,
  volumeText,
  type DisplayTerms,
  type InstantInput,
} from '@/lib/rfp/instant-quote';
import {
  MERCHANT_TIERS,
  MERCHANT_TIER_LABELS,
  type MerchantTier,
} from '@/lib/types/bid';

export function InstantTerms({
  terms,
  input,
  tier,
  confirmed = false,
}: {
  terms: DisplayTerms;
  input: InstantInput;
  tier?: MerchantTier | null;
  confirmed?: boolean;
}) {
  const savings = new Map<string, string[]>();
  for (const t of tier ? [tier] : MERCHANT_TIERS) {
    const amount = estimatedSaving(input, terms, t);
    if (amount)
      savings.set(amount, [
        ...(savings.get(amount) ?? []),
        MERCHANT_TIER_LABELS[t],
      ]);
  }
  return (
    <section className="space-y-4">
      <p>{volumeText(input)}</p>
      <p>
        {tier
          ? MERCHANT_TIER_LABELS[tier] +
            (confirmed ? ' · PG가 확인한 적용 등급' : ' · 예상 가맹점 등급')
          : '영세부터 전체 등급을 표시해요.'}{' '}
        {(!tier || !confirmed) && '실제 적용 등급은 PG 심사에서 확인해요.'}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="pb-2 text-left font-semibold">
            결제수수료 (부가세 별도)
          </caption>
          <thead>
            <tr>
              <th>결제수단·등급</th>
              <th>홈페이지 판가</th>
              <th>약정가</th>
            </tr>
          </thead>
          <tbody>
            {feeRows(terms, tier).map((row) => (
              <tr className="border-t" key={row.label}>
                <th className="py-2 font-normal">{row.label}</th>
                <td>{row.standard}</td>
                <td>{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {confirmed && tier && (
        <details>
          <summary>발급 당시 전체 등급 약정가</summary>
          <ul>
            {feeRows(terms).map((row) => (
              <li key={row.label}>
                {row.label} · 판가 {row.standard} · 약정가 {row.value}
              </li>
            ))}
          </ul>
        </details>
      )}
      {[...savings].map(([amount, tiers]) => (
        <p key={amount}>
          {tiers.length === MERCHANT_TIERS.length
            ? '모든 등급'
            : tiers.join('·')}{' '}
          · {amount}
        </p>
      ))}
      <dl className="divide-y">
        {conditionLines(terms, input).map(([label, value]) => (
          <div
            className="flex flex-wrap justify-between gap-2 py-2"
            key={label}
          >
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm">
        약정 조건 {terms.policyVersion}판 · 표준 요율 {terms.rateVersion}판 ·
        확정 후 {terms.policy.validityDays}일 동안 가입 신청 가능
      </p>
    </section>
  );
}
