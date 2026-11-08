import type { Metadata } from "next";
import { AgentConsent } from "@/components/agent/AgentConsent";
import { AgentError } from "@/lib/server/agent/account-contract";
import {
  agentBrowserPageActor,
  agentBrowserRecoveryUrl,
} from "@/lib/server/agent/browser";
import { AgentAccessNotice } from "@/components/agent/AgentAccessNotice";
import { inspectAgentAuthorization } from "@/lib/server/services/agent-account";
import { authorizeAgentAction } from "@/lib/server/actions/agent-account";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "에이전트 연결",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function AgentAuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const browser = await agentBrowserPageActor();
  if (!browser.ok)
    return (
      <AgentAccessNotice
        {...browser}
        recoveryUrl={agentBrowserRecoveryUrl(
          "/agent/authorize",
          await searchParams,
        )}
        recoveryLabel="연결 화면 열기"
      />
    );
  const data = await inspectAgentAuthorization(await searchParams).catch(
    (error) => {
      if (error instanceof AgentError) return null;
      throw error;
    },
  );
  if (!data)
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">연결 정보를 확인해요</h1>
        <p className="mt-3">
          인증 링크가 올바르지 않거나 만료됐어요. 에이전트에서 연결을 다시
          시작하고 새 인증 링크를 열어요.
        </p>
        <a className="mt-4 inline-block underline" href="/developers/agents.md">
          연결 방법 보기
        </a>
      </div>
    );
  const { actor, workspaceName } = browser;
  const { query, client, scopes } = data;
  return (
    <AgentConsent
      clientName={client.name}
      callbackOrigin={new URL(query.redirect_uri).origin}
      workspaceName={workspaceName}
      canWrite={scopes.includes("requests:write")}
      action={authorizeAgentAction.bind(null, query, actor.workspaceId)}
    />
  );
}
