import { describe, expect, it } from "vitest";
import {
  analyticsReportHtml,
  formatAnalyticsReport,
  type AgentAnalyticsReport,
} from "../analytics-report";

function report(): AgentAnalyticsReport {
  return {
    schemaVersion: 1,
    generatedAt: "2026-11-08T12:00:00.000Z",
    range: {
      from: "2026-11-01T15:00:00.000Z",
      to: "2026-11-08T15:00:00.000Z",
      environment: "test",
      dayTimezone: "Asia/Seoul",
    },
    funnel: {
      consents: 8,
      tokens_issued: 6,
      tool_users_observed: 5,
      connections_with_drafts: 3,
      connections_with_submissions: 2,
    },
    requests: [
      {
        contract_type: "new",
        drafts: 4,
        submitted: 2,
        pending: 2,
        average_seconds_to_submit: 35.4,
      },
    ],
    activity: [
      {
        day: "2026-11-08",
        surface: "account_mcp",
        operation: "prepare_request",
        outcome: "error",
        error_code: "timeout",
        calls: 2,
        average_ms: 750,
        p95_ms: 999.8,
      },
    ],
    missing: [{ rule: "website-required", observations: 3 }],
    coverage: {
      first_observation: "2026-11-08T02:00:00.000Z",
      last_observation: "2026-11-08T03:00:00.000Z",
      observations: 2,
    },
    outcomes: {
      provider_contracts: 2,
      live_integrations: 1,
      sandbox_integrations: 2,
      customer_integration_reports: 1,
      requests_with_commission: 1,
      requests_with_payment: 1,
    },
    commissions: [
      {
        currency: "KRW",
        confirmed_amount: "9007199254740993.1234",
        paid_amount: "0.1234",
        outstanding_amount: "9007199254740993.0000",
        confirmed_entries: 1,
        payments: 1,
      },
    ],
    unmeasured: ["recommendation_impressions"],
    notes: [
      "준비 중인 요청은 실패로 세지 않아요.",
      "호출 관측은 누락될 수 있어요.",
    ],
  };
}

describe("B2A analytics operator reports", () => {
  it("keeps connection counts separate from request counts in Markdown", () => {
    const text = formatAnalyticsReport(report());
    expect(text).toContain("연결 전환 — 연결 수 기준");
    expect(text).toContain("| 8 | 6 | 5 | 3 | 2 |");
    expect(text).toContain("기간 내 생성한 초안 — 요청 수 기준");
    expect(text).toContain("| new | 4 | 2 | 2 | 35 |");
    expect(text).toContain(
      "| 2026-11-08 | account_mcp | prepare_request | error | timeout | 2 | 750 | 1000 |",
    );
    expect(text).toContain("website-required: 3");
    expect(text).toContain("한국 시간");
    expect(text).toContain("저장된 호출 관측: 2건");
    expect(text).toContain("준비 중인 요청은 실패로 세지 않아요.");
  });

  it("escapes every free-text report field in standalone HTML", () => {
    const data = report();
    const malicious = `<img src="https://example.invalid/private" onerror='alert(1)'>&`;
    data.notes = [malicious];
    data.generatedAt = malicious;
    data.range.from = malicious;
    data.requests[0].contract_type = malicious;
    data.activity[0].surface = malicious;
    data.activity[0].error_code = malicious;
    data.missing[0].rule = malicious;
    data.unmeasured = [malicious];
    const html = analyticsReportHtml(data);
    expect(html).not.toContain(malicious);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script");
    const escaped =
      "&lt;img src=&quot;https://example.invalid/private&quot; onerror=&#39;alert(1)&#39;&gt;&amp;";
    expect(html.split(escaped)).toHaveLength(9);
  });

  it("uses a restrictive CSP and loads no scripts, fonts, external styles or trackers", () => {
    const html = analyticsReportHtml(report());
    expect(html).toContain('http-equiv="Content-Security-Policy"');
    expect(html).toContain(
      "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
    );
    expect(html).not.toMatch(/<(?:script|iframe|link|img|form)\b/i);
    expect(html).not.toMatch(/@import|url\s*\(/i);
    expect(html).not.toMatch(/(?:src|href)\s*=/i);
    expect(html).toContain('lang="ko"');
  });

  it("marks empty observations and distinguishes absent records from unmeasured discovery", () => {
    const data = report();
    data.funnel = {
      consents: 0,
      tokens_issued: 0,
      tool_users_observed: 0,
      connections_with_drafts: 0,
      connections_with_submissions: 0,
    };
    data.requests = [];
    data.activity = [];
    data.missing = [];
    data.commissions = [];
    data.coverage = {
      first_observation: null,
      last_observation: null,
      observations: 0,
    };
    const html = analyticsReportHtml(data);
    const markdown = formatAnalyticsReport(data);
    expect(html.match(/이 기간의 기록이 없어요\./g)).toHaveLength(4);
    expect(html).toContain("미수집 지표:");
    expect(markdown).toContain("미수집:");
    for (const text of [html, markdown]) {
      expect(text).toContain("recommendation_impressions");
      expect(text).toContain("기록이 없는 결과는 미확인");
      expect(text).not.toContain("NaN");
      expect(text).not.toContain("Infinity");
    }
  });

  it("renders exact money strings and keeps customer reports distinct from verified integration", () => {
    for (const text of [
      analyticsReportHtml(report()),
      formatAnalyticsReport(report()),
    ]) {
      expect(text).toContain("9007199254740993.1234");
      expect(text).toContain("9007199254740993.0000");
      expect(text).toContain("고객 연동 제보");
      expect(text).toContain("운영 연동 확인");
      expect(text).toContain("KRW");
    }
  });

  it("renders an unmeasured submission duration distinctly from a measured zero", () => {
    const data = report();
    data.requests = [
      {
        contract_type: "new",
        drafts: 2,
        submitted: 0,
        pending: 2,
        average_seconds_to_submit: null,
      },
      {
        contract_type: "renewal",
        drafts: 1,
        submitted: 1,
        pending: 0,
        average_seconds_to_submit: 0,
      },
    ];
    expect(formatAnalyticsReport(data)).toContain(
      "| new | 2 | 0 | 2 | 미측정 |",
    );
    expect(formatAnalyticsReport(data)).toContain(
      "| renewal | 1 | 1 | 0 | 0 |",
    );
    const html = analyticsReportHtml(data);
    expect(html).toContain("<td>미측정</td>");
    expect(html).toContain(
      "<td>renewal</td><td>1</td><td>1</td><td>0</td><td>0</td>",
    );
  });
});
