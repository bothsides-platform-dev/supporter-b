import type { Metadata } from "next";
import { Button } from "@/components/primitives/Button";
import { SettingsPage } from "@/components/settings/SettingsPage";
import {
  agentBrowserPageActor,
  agentBrowserRecoveryUrl,
} from "@/lib/server/agent/browser";
import { AgentAccessNotice } from "@/components/agent/AgentAccessNotice";
import { getAgentRepo } from "@/lib/server/repositories/factory";
import { revokeAgentAction } from "@/lib/server/actions/agent-account";
import { FunnelView } from "@/lib/analytics/use-funnel";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "에이전트 연결",
  robots: { index: false, follow: false },
};
export default async function AgentConnectionsPage() {
  const access = await agentBrowserPageActor();
  if (!access.ok)
    return (
      <AgentAccessNotice
        {...access}
        recoveryUrl={agentBrowserRecoveryUrl("/settings/agents")}
        recoveryLabel="연결 관리 열기"
      />
    );
  const { actor } = access;
  const connections = await (
    await getAgentRepo()
  ).connections(actor.userId, actor.workspaceId);
  return (
    <SettingsPage title="에이전트 연결">
      <FunnelView funnel="agent" step="connections" />
      <p>
        이 계정에 연결한 개발 에이전트예요. 연결을 해제하면 다음 요청부터 접근을
        막아요. 이미 보낸 PG 상담은 유지해요.
      </p>
      {!connections.length && (
        <p>
          연결한 에이전트가 아직 없어요. 에이전트에서 연결을 시작하면 인증
          링크에서 동의할 수 있어요.{" "}
          <a className="underline" href="/developers/agents.md">
            연결 방법 보기
          </a>
        </p>
      )}
      <ul className="divide-y divide-[var(--md-sys-color-outline-variant)]">
        {connections.map((c) => {
          const active = !c.revokedAt && c.expiresAt > new Date();
          return (
            <li
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-3 py-4"
            >
              <div>
                <p className="break-words font-medium">{c.name}</p>
                <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
                  {active
                    ? c.scopes.includes("requests:write")
                      ? "진행 조회와 초안 작성"
                      : "진행 조회"
                    : "연결 종료"}
                </p>
              </div>
              {active && (
                <form action={revokeAgentAction.bind(null, c.id)}>
                  <Button variant="outlined" type="submit">
                    연결 해제해요
                  </Button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </SettingsPage>
  );
}
