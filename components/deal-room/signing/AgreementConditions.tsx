import { buildAgreementDocument } from '@/lib/contract-doc/agreement';

const commonDocument = buildAgreementDocument('구매사', 'PG사');

/** 선정 전 안내와 발송 전 안내가 같은 약정 요약을 사용한다. */
export function AgreementConditions({ beforeAward = false }: { beforeAward?: boolean }) {
  return (
    <section className="space-y-2 rounded-md border border-[var(--md-sys-color-outline-variant)] p-4 text-sm leading-relaxed">
      <h3 className="font-medium">{beforeAward ? '선정 전에 계약 조건을 확인해요' : '서명 전에 확인해요'}</h3>
      <p><span className="md-numeric">2</span>년 약정 · 약정기간 동안 해당 PG사의 전자결제서비스를 이용해요.</p>
      <p className="text-[var(--md-sys-color-on-surface-variant)]">
        독점 이용 조건 위반이나 구매사 귀책 해지 시 실제 할인받은 수수료 반환 조건이 있어요.
        적용 예외와 상세 조건은 합의서 전문에서 확인해요.
      </p>
      <p className="text-[var(--md-sys-color-on-surface-variant)]">
        약정은 PG 이용계약 효력 발생일과 양측 서명 완료일 중 늦은 날부터 시작해요.
      </p>
      {beforeAward && <>
        <p>선정 후 PG사가 합의서를 준비하면 서명 요청 이메일에서 내용을 확인하고 서명해요.</p>
        <details className="pt-2">
          <summary className="cursor-pointer text-[var(--md-sys-color-primary)] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4">공통 합의서 문안 보기</summary>
          <div className="mt-3 space-y-4">
            <p className="text-[var(--md-sys-color-on-surface-variant)]">공통 문안이에요. 회사 정보와 표준 수수료·할인 폭·최종 수수료 표는 발송할 합의서에서 확인해요. 최종 수수료는 선정한 견적과 같아요.</p>
            <h4 className="font-semibold">{commonDocument.title}</h4>
            <p>{commonDocument.preamble}</p>
            {commonDocument.clauses.map((clause, index) => (
              <div key={clause.id} className="space-y-1">
                <h5 className="font-medium">{clause.kind === 'text' && <>제<span className="md-numeric">{index + 1}</span>조 · </>}{clause.heading}</h5>
                <p className="whitespace-pre-wrap">{clause.kind === 'text' ? clause.body : clause.intro}</p>
                {clause.kind === 'feeTable' && clause.outro && <p>{clause.outro}</p>}
              </div>
            ))}
            <p>{commonDocument.closing}</p>
          </div>
        </details>
      </>}
    </section>
  );
}
