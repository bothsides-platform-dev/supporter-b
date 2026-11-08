import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AgentRequestReview } from "@/components/agent/AgentRequestReview";
import {
  agentBrowserPageActor,
  agentBrowserRecoveryUrl,
} from "@/lib/server/agent/browser";
import { AgentAccessNotice } from "@/components/agent/AgentAccessNotice";
import { agentReviewRows } from "@/lib/server/agent/review-rows";
import { browserAgentRequest } from "@/lib/server/services/agent-request";
import { getPgRecommendationService } from "@/lib/server/services/pg-recommendation";
import { submitAgentRequestAction } from "@/lib/server/actions/agent-account";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "에이전트 상담 요청 확인",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function AgentRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ requestId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const access = await agentBrowserPageActor();
  if (!access.ok)
    return (
      <AgentAccessNotice
        {...access}
        recoveryUrl={agentBrowserRecoveryUrl(
          `/agent/requests/${encodeURIComponent((await params).requestId)}`,
          await searchParams,
        )}
        recoveryLabel="상담 확인 화면 열기"
      />
    );
  const { actor } = access;
  const { requestId } = await params;
  const data = await browserAgentRequest(requestId, actor).catch(() => null);
  if (!data) notFound();
  const { row, summary, workspaceName } = data;
  const content = summary.content;
  const recommended = await (
    await getPgRecommendationService()
  ).recommend({
    kind: "selection",
    industry: {
      industryGroupId: content.industryGroupId,
      customIndustryName: content.customIndustryName,
    },
    currentPgs: content.currentPgs ?? [],
    buyerWorkspaceId: actor.workspaceId,
    includeTestPg: false,
  });
  const selected = recommended.ok
    ? recommended.recommendation.candidates.find(
        (c) => c.pgWorkspaceId === content.allowedPgWorkspaceIds[0],
      )
    : undefined;
  const missing = summary.missing.map((m) => m.message);
  if (!selected && !row.rfpCode)
    missing.push("현재 추천 가능한 PG사를 다시 선택해요.");
  return (
    <AgentRequestReview
      workspaceName={workspaceName}
      rows={agentReviewRows(
        content,
        selected?.name ?? "상담 상세에서 확인해요",
        recommended.ok
          ? recommended.recommendation.industryName
          : (content.customIndustryName ?? ""),
      )}
      missing={row.rfpCode ? [] : missing}
      error={(await searchParams).error}
      action={submitAgentRequestAction.bind(null, row.id, row.revision)}
      submittedUrl={row.rfpCode ? `/rfp/${row.rfpCode}` : undefined}
    />
  );
}
