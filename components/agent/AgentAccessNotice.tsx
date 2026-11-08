import { AgentRecoveryLink } from "./AgentRecoveryLink";

export function AgentAccessNotice({
  reason,
  origin,
  currentHost,
  recoveryUrl,
  recoveryLabel,
}: {
  reason: "wrong_origin" | "access_denied";
  origin?: string;
  currentHost?: string;
  recoveryUrl: string;
  recoveryLabel: string;
}) {
  return (
    <section className="mx-auto w-full max-w-xl space-y-4 p-6 text-[var(--md-sys-color-on-surface)]">
      <h1 className="text-2xl font-semibold">
        {reason === "wrong_origin"
          ? "접속 주소가 달라요"
          : "구매사 계정에서 연결해요"}
      </h1>
      {reason === "wrong_origin" ? (
        <>
          <p>
            에이전트에 설정된 서포트비 주소와 현재 접속 주소가 달라요. 아래
            버튼으로 다시 열어요.
          </p>
          <dl className="space-y-3 rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] p-4 text-sm">
            <div>
              <dt className="text-[var(--md-sys-color-on-surface-variant)]">
                현재 접속 주소
              </dt>
              <dd className="break-all">{currentHost}</dd>
            </div>
            <div>
              <dt className="text-[var(--md-sys-color-on-surface-variant)]">
                연결에 사용할 주소
              </dt>
              <dd className="break-all">{origin}</dd>
            </div>
          </dl>
          <AgentRecoveryLink href={recoveryUrl} label={recoveryLabel} />
        </>
      ) : (
        <p>
          승인된 구매사 계정에서 연결할 수 있어요. 구매사 계정으로 전환한 뒤
          에이전트에서 연결을 다시 시작해요.
        </p>
      )}
    </section>
  );
}
