import type { agentAnalyticsReport } from "../../lib/server/services/agent-analytics";
export type AgentAnalyticsReport = Awaited<
  ReturnType<typeof agentAnalyticsReport>
>;

function outcomeRows(report: AgentAnalyticsReport): [string, number][] {
  const o = report.outcomes;
  return [
    ["제휴사 계약 확인", o.provider_contracts],
    ["운영 연동 확인", o.live_integrations],
    ["테스트 연동 확인", o.sandbox_integrations],
    ["고객 연동 제보", o.customer_integration_reports],
    ["수수료 확정", o.requests_with_commission],
    ["수수료 지급 기록", o.requests_with_payment],
  ];
}

export function formatAnalyticsReport(report: AgentAnalyticsReport): string {
  const { funnel, range } = report;
  return [
    "# B2A 분석 리포트",
    `환경: ${range.environment} · 기간: ${range.from} ≤ 시각 < ${range.to} · 일별 구분: 한국 시간`,
    "",
    "## 연결 전환 — 연결 수 기준",
    "",
    "| 동의 | 토큰 발급 | 도구 이용 관측 | 초안 생성 | 상담 발송 |",
    "| ---: | ---: | ---: | ---: | ---: |",
    `| ${funnel.consents} | ${funnel.tokens_issued} | ${funnel.tool_users_observed} | ${funnel.connections_with_drafts} | ${funnel.connections_with_submissions} |`,
    "",
    "## 기간 내 생성한 초안 — 요청 수 기준",
    "",
    "| 계약 유형 | 초안 | 발송 | 준비 중 | 평균 발송까지 시간(초) |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...report.requests.map(
      (row) =>
        `| ${row.contract_type} | ${row.drafts} | ${row.submitted} | ${row.pending} | ${row.average_seconds_to_submit === null ? "미측정" : Math.round(row.average_seconds_to_submit)} |`,
    ),
    "",
    "## 계약·연동·수수료 — 상담 요청 수 기준",
    "",
    "기간 내 생성한 요청에 연결된 확인 기록이에요. 기록이 없는 결과는 미확인이며, 계약이나 지급이 없었다는 뜻은 아니에요.",
    "",
    "| 결과 | 요청 수 |",
    "| --- | ---: |",
    ...outcomeRows(report).map(([label, count]) => `| ${label} | ${count} |`),
    "",
    "## 서포트비 수수료 — 통화별 확인 금액",
    "",
    "| 통화 | 확정 | 지급 기록 | 남은 금액 | 확정 건수 | 지급 건수 |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
    ...report.commissions.map(
      (r) =>
        `| ${r.currency} | ${r.confirmed_amount} | ${r.paid_amount} | ${r.outstanding_amount} | ${r.confirmed_entries} | ${r.payments} |`,
    ),
    ...(report.commissions.length
      ? []
      : ["", "이 기간의 수수료 기록이 없어요."]),
    "",
    "## 호출 관측",
    "",
    "| 날짜(KST) | 채널 | 작업 | 결과 | 오류 | 호출 수 | 평균(ms) | P95(ms) |",
    "| --- | --- | --- | --- | --- | ---: | ---: | ---: |",
    ...report.activity.map(
      (row) =>
        `| ${row.day} | ${row.surface} | ${row.operation} | ${row.outcome} | ${row.error_code ?? "—"} | ${row.calls} | ${row.average_ms} | ${Math.round(row.p95_ms)} |`,
    ),
    "",
    "## 준비가 필요한 항목 — 관측 횟수",
    "",
    ...report.missing.map((row) => `- ${row.rule}: ${row.observations}`),
    "",
    "## 집계 범위",
    "",
    ...report.notes.map((note) => `- ${note}`),
    `- 저장된 호출 관측: ${report.coverage.observations}건. 원본 관측 보관은 30일이며 과거 기간의 일부가 정리됐을 수 있어요.`,
    `- 미수집: ${report.unmeasured.join(", ")}`,
    "",
  ].join("\n");
}

const escape = (value: unknown) =>
  String(value ?? "미측정").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
function table(headers: string[], rows: unknown[][]) {
  return `<div class="scroll"><table><thead><tr>${headers.map((v) => `<th>${escape(v)}</th>`).join("")}</tr></thead><tbody>${rows.length ? rows.map((row) => `<tr>${row.map((v) => `<td>${escape(v)}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${headers.length}">이 기간의 기록이 없어요.</td></tr>`}</tbody></table></div>`;
}
/** Standalone operator report: aggregate-only, no remote scripts or tracking. */
export function analyticsReportHtml(report: AgentAnalyticsReport): string {
  const f = report.funnel;
  const stages = [
    ["연결 동의", f.consents],
    ["토큰 발급", f.tokens_issued],
    ["도구 이용 관측", f.tool_users_observed],
    ["초안 생성", f.connections_with_drafts],
    ["상담 발송", f.connections_with_submissions],
  ] as const;
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>B2A 분석 리포트</title><style>
body{font:16px/1.6 system-ui,sans-serif;margin:0;background:#f5f7fa;color:#18202b}main{max-width:1120px;margin:auto;padding:32px 20px}h1{font-size:28px}h2{font-size:20px;margin-top:32px}.meta{color:#4e5d6c}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}.card{padding:20px;background:white;border:1px solid #d6dce3;border-radius:10px}.number{font-size:32px;font-weight:700}.scroll{overflow:auto;background:white;border:1px solid #d6dce3;border-radius:8px}table{border-collapse:collapse;width:100%;white-space:nowrap}th,td{text-align:left;padding:12px;border-bottom:1px solid #e6e9ee}th{background:#eaf0f6}li{margin:8px 0}code{overflow-wrap:anywhere}
</style><main><h1>B2A 분석 리포트</h1><p class="meta">환경: ${escape(report.range.environment)}<br>${escape(report.range.from)} 이상 · ${escape(report.range.to)} 미만<br>일별 구분: 한국 시간 · 생성: ${escape(report.generatedAt)}</p>
<h2>연결 전환</h2><p>기간 내 동의한 연결을 기준으로 종료 시각까지 확인한 결과예요. 각 카드는 연결 수예요.</p><div class="cards">${stages.map(([label, count]) => `<div class="card">${label}<div class="number">${count}</div></div>`).join("")}</div>
<h2>기간 내 생성한 초안</h2>${table(
    ["계약 유형", "초안", "발송", "준비 중", "평균 발송까지(초)"],
    report.requests.map((r) => [
      r.contract_type,
      r.drafts,
      r.submitted,
      r.pending,
      r.average_seconds_to_submit === null
        ? null
        : Math.round(r.average_seconds_to_submit),
    ]),
  )}
<h2>계약·연동·수수료</h2><p>기간 내 생성한 요청에 연결된 확인 기록이에요. 각 수치는 상담 요청 수예요. 기록이 없는 결과는 미확인이며, 계약이나 지급이 없었다는 뜻은 아니에요.</p>${table(
    ["결과", "요청 수"],
    outcomeRows(report),
  )}
<h2>서포트비 수수료</h2><p>통화별 확인 금액이에요. 지급 기록은 실제로 받은 금액을 운영자가 확인해 입력한 결과예요.</p>${table(
    ["통화", "확정", "지급 기록", "남은 금액", "확정 건수", "지급 건수"],
    report.commissions.map((r) => [
      r.currency,
      r.confirmed_amount,
      r.paid_amount,
      r.outstanding_amount,
      r.confirmed_entries,
      r.payments,
    ]),
  )}
<h2>호출과 실패</h2>${table(
    [
      "날짜(KST)",
      "채널",
      "작업",
      "결과",
      "오류",
      "호출",
      "평균(ms)",
      "P95(ms)",
    ],
    report.activity.map((r) => [
      r.day,
      r.surface,
      r.operation,
      r.outcome,
      r.error_code ?? "—",
      r.calls,
      r.average_ms,
      Math.round(r.p95_ms),
    ]),
  )}
<h2>준비가 필요한 항목</h2><p>같은 요청의 반복 관측이 포함된 횟수예요.</p>${table(
    ["준비 항목", "관측 횟수"],
    report.missing.map((r) => [r.rule, r.observations]),
  )}
<h2>집계 범위</h2><ul>${report.notes.map((note) => `<li>${escape(note)}</li>`).join("")}<li>원본 호출 관측은 30일 보관해요. 저장 제한·장애·정리로 누락된 기록은 리포트에 포함되지 않아요.</li><li>미수집 지표: <code>${escape(report.unmeasured.join(", "))}</code></li></ul></main></html>`;
}
