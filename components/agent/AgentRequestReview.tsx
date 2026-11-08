import { Button } from "@/components/primitives/Button";

export function AgentRequestReview({
  workspaceName,
  rows,
  missing,
  error,
  action,
  submittedUrl,
}: {
  workspaceName: string;
  rows: [string, string][];
  missing: string[];
  error?: string;
  action: () => void | Promise<void>;
  submittedUrl?: string;
}) {
  return (
    <section className="mx-auto w-full max-w-3xl space-y-6 p-6 text-[var(--md-sys-color-on-surface)]">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">상담 요청을 확인해요</h1>
        <p>
          에이전트가 준비한 내용이에요. {workspaceName}의 사업자 정보와 함께
          선택한 PG사에 보내요.
        </p>
      </div>
      {error && (
        <p role="alert" className="text-[var(--md-sys-color-error)]">
          {error === "changed"
            ? "에이전트가 내용을 수정했어요. 바뀐 내용을 다시 확인해요."
            : "지금은 요청을 보내지 못했어요. 입력 내용과 PG 추천, 마감일을 에이전트에서 다시 확인해요."}
        </p>
      )}
      <dl className="divide-y divide-[var(--md-sys-color-outline-variant)]">
        {rows.map(([label, value]) => (
          <div key={label} className="grid gap-2 py-3 sm:grid-cols-[180px_1fr]">
            <dt className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
              {label}
            </dt>
            <dd className="min-w-0 whitespace-pre-wrap break-words">{value}</dd>
          </div>
        ))}
      </dl>
      {!!missing.length && (
        <div className="space-y-2">
          <h2 className="font-semibold">먼저 준비할 내용</h2>
          <ul className="list-disc space-y-1 pl-5">
            {missing.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
          <p>에이전트에서 내용을 보완하고 이 페이지를 새로 열어요.</p>
        </div>
      )}
      <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
        한 PG사에 상담을 요청해요. 견적 조건은 PG사 검토 후 확인하고, 서비스
        이용계약과 노온 할인 합의서는 각각 확인해요.
      </p>
      {submittedUrl ? (
        <a className="inline-block underline" href={submittedUrl}>
          보낸 상담 보기
        </a>
      ) : (
        <form action={action} className="flex justify-end">
          <Button type="submit" disabled={missing.length > 0}>
            이 내용으로 상담 요청해요
          </Button>
        </form>
      )}
      <a className="inline-block text-sm underline" href="/settings/agents">
        에이전트 연결 관리
      </a>
    </section>
  );
}
