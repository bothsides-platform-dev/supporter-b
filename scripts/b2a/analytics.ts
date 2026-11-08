import { parseArgs } from "node:util";
import { chmod, writeFile } from "node:fs/promises";
import { z } from "zod";
import { AGENT_ANALYTICS_ENVIRONMENTS } from "../../lib/analytics/agent-contract";
import { analyticsReportHtml, formatAnalyticsReport } from "./analytics-report";

const HELP = `B2A 분석 — 운영자 서버에서 DATABASE_URL을 주입해 실행합니다. 환경 파일을 자동으로 읽지 않습니다.
pnpm b2a:analytics report [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--environment production|staging|development|test|unknown] [--format markdown|json|html] [--output /path/report.html]
  날짜만 쓰면 한국 시간 자정, --to는 미포함입니다. 기본값은 최근 28일·production·markdown입니다.
pnpm b2a:analytics prune [--execute]
  30일 지난 호출 관측만 정리합니다. 기본값은 미리보기이며 --execute는 최대 5,000건을 삭제합니다.
  상담·연결·업무 이벤트는 삭제하지 않습니다.`;
export function reportDate(value: string): Date {
  if (z.iso.date().safeParse(value).success)
    return new Date(`${value}T00:00:00+09:00`);
  if (!z.iso.datetime({ offset: true }).safeParse(value).success)
    throw new Error("invalid date");
  return new Date(value);
}
async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      help: { type: "boolean" },
      from: { type: "string" },
      to: { type: "string" },
      environment: { type: "string" },
      format: { type: "string" },
      output: { type: "string" },
      execute: { type: "boolean" },
    },
  });
  if (values.help || !positionals.length) {
    process.stdout.write(`${HELP}\n`);
    return;
  }
  if (positionals.length !== 1 || !["report", "prune"].includes(positionals[0]))
    throw new Error("invalid command");
  if (positionals[0] === "report" && values.execute)
    throw new Error("unexpected execute");
  if (
    positionals[0] === "prune" &&
    [
      values.from,
      values.to,
      values.environment,
      values.format,
      values.output,
    ].some((v) => v !== undefined)
  )
    throw new Error("unexpected prune option");
  if (!process.env.DATABASE_URL) throw new Error("database not configured");
  const { agentAnalyticsReport, pruneAgentObservations } =
    await import("../../lib/server/services/agent-analytics");
  if (positionals[0] === "prune") {
    process.stdout.write(
      `${JSON.stringify(await pruneAgentObservations(values.execute === true), null, 2)}\n`,
    );
    return;
  }
  const environment = z
    .enum(AGENT_ANALYTICS_ENVIRONMENTS)
    .parse(values.environment ?? "production");
  const format = z
    .enum(["markdown", "json", "html"])
    .parse(values.format ?? "markdown");
  const to = values.to ? reportDate(values.to) : new Date();
  const from = values.from
    ? reportDate(values.from)
    : new Date(to.getTime() - 28 * 86400_000);
  const report = await agentAnalyticsReport({ from, to, environment });
  const output =
    format === "json"
      ? JSON.stringify(report, null, 2)
      : format === "html"
        ? analyticsReportHtml(report)
        : formatAnalyticsReport(report);
  if (values.output) {
    await writeFile(values.output, output, { mode: 0o600 });
    await chmod(values.output, 0o600);
  } else process.stdout.write(`${output}\n`);
}
main()
  .catch(() => {
    // Never echo an exception containing database credentials, URLs or raw records.
    process.stderr.write(
      "B2A 분석 실행 실패: 명령·기간·DB 연결·마이그레이션 적용 상태를 확인하세요. --help로 사용법을 볼 수 있어요.\n",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await globalThis.__bidit_pg__?.end({ timeout: 1 });
  });
