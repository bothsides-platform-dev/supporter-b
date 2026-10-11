import {
  buildAgreementFees,
  buildAgreementDocument,
  AGREEMENT_VERSION,
} from "@/lib/contract-doc/agreement";
import type { AgreementView } from "@/lib/types/agreement";
import type { BuyerRfpDetailData } from "@/lib/server/rfp-detail-loader";
import type { ThreadMessage, InboxListItem } from "@/components/messages/types";
import type { ContractArchiveEntry } from "@/lib/types/contract-archive";
import type { Recommendation } from "@/lib/rfp/pg-matching";
import type { RfpDraftSeedFields } from "@/lib/onboarding/tutorial-fixtures";
import {
  productInfoSchema,
  type ProductInfoDraft,
} from "@/lib/rfp/product-info";
import {
  demoBuyerDealData,
  demoCompareBids,
} from "@/components/landing/demo-app/demo-app-fixtures";
import { siteConfig } from "@/lib/site-config";
import { sampleBusinessCalendar } from "@/lib/rfp/sample-calendar";

export const DEMO_COMPANY = siteConfig.name;
export const DEMO_PG = {
  workspaceId: "demo-pg-7",
  name: "데모페이",
  type: "pg" as const,
  logoUpdatedAt: null,
};
export const DEMO_VIEWER = {
  userId: "buyer-demo-user",
  name: "김구매",
  avatarUpdatedAt: null,
};
export const DEMO_CONVERSATION = "buyer-demo-conversation";
export type DemoSnapshot = {
  deal: BuyerRfpDetailData | null;
  messages: ThreadMessage[];
  archives: ContractArchiveEntry[];
};

export function createBuyerDemoSession() {
  let state: DemoSnapshot = { deal: null, messages: [], archives: [] };
  const listeners = new Set<() => void>();
  const urls = new Set<string>();
  const files = new Map<string, ThreadMessage["attachments"][number]>();
  const emit = (next: DemoSnapshot) => {
    state = next;
    listeners.forEach((listener) => listener());
  };
  const now = () => new Date().toISOString();
  const recommendation: Recommendation = {
    risk: "white",
    industryName: "온라인 쇼핑",
    candidates: [
      {
        pgWorkspaceId: DEMO_PG.workspaceId,
        name: DEMO_PG.name,
        reason: "입력한 업종과 거래 조건으로 상담을 체험해요.",
        feeNote: "가상 견적이며 실제 요율은 PG 검토 후 정해져요.",
        merchantTier: "general",
        feeRate: 2.2,
      },
    ],
  };
  function message(
    body: string,
    sender: ThreadMessage["sender"],
    attachments: ThreadMessage["attachments"] = [],
  ): ThreadMessage {
    return {
      id: `buyer-demo-message-${state.messages.length}-${Math.random().toString(36).slice(2)}`,
      body,
      sender,
      authorUserId: sender === "self" ? DEMO_VIEWER.userId : "demo-pg-user",
      authorName: sender === "self" ? DEMO_VIEWER.name : "박담당",
      authorEmail: "demo@example.com",
      authorAvatarUpdatedAt: null,
      createdAt: now(),
      rfpId: "demo-rfp-1",
      readByCounterparty: true,
      attachments,
    };
  }
  function submit(
    draft: RfpDraftSeedFields & { productInfo?: ProductInfoDraft },
  ) {
    const rfp = {
      ...demoBuyerDealData.rfp,
      title: draft.title,
      websiteUrl: draft.websiteUrl,
      mainProducts: draft.mainProducts,
      annualPgVolume:
        draft.contractType === "new" ? undefined : draft.annualPgVolume,
      currentFeeRate:
        draft.contractType === "new" ? undefined : draft.currentFeeRate,
      currentSettlementCycle:
        draft.contractType === "new" ? undefined : draft.currentSettlementCycle,
      currentSettlementLimit:
        draft.contractType === "new" ? undefined : draft.currentSettlementLimit,
      currentGuaranteeInsurance:
        draft.contractType === "new"
          ? undefined
          : draft.currentGuaranteeInsurance,
      deliveryServicePeriod: draft.deliveryServicePeriod,
      currentSolution: draft.currentSolution || undefined,
      currentSolutionDetail: draft.currentSolutionDetail || undefined,
      currentFeeVisibleToPg: draft.currentFeeVisibleToPg,
      boardVisible: false,
      memo: draft.memo,
      contractType: draft.contractType ?? "renewal",
      deadline: draft.deadline,
      requiredPaymentMethods: draft.requiredPaymentMethods,
      customPaymentMethods: draft.customPaymentMethods.map((method, i) => ({
        id: `demo-method-${i}`,
        label: method.label,
      })),
      allowedPgWorkspaceIds: [DEMO_PG.workspaceId],
      productInfo: productInfoSchema.safeParse(draft.productInfo).data,
      status: "sent" as const,
      createdAt: now(),
    };
    const deal: BuyerRfpDetailData = {
      ...demoBuyerDealData,
      rfp,
      companyName: DEMO_COMPANY,
      bids: [],
      rfpFiles: draft.rfpFiles.map((file) => ({
        ...file,
        mimeType: files.get(file.id)?.mimeType ?? "application/pdf",
        url: files.get(file.id)?.url ?? "",
      })),
      pgWsById: {
        [DEMO_PG.workspaceId]: {
          id: DEMO_PG.workspaceId,
          name: DEMO_PG.name,
          type: "pg",
          logoUpdatedAt: null,
        },
      },
      inviteList: [],
      matching: {
        industryName: recommendation.industryName,
        recommendation,
        reviews: [
          {
            id: "demo-review",
            pgWorkspaceId: DEMO_PG.workspaceId,
            status: "reviewing",
            reason: "",
            createdAt: now(),
            updatedAt: now(),
            candidate: recommendation.candidates[0],
          },
        ],
      },
    };
    emit({
      deal,
      messages: [
        message(
          "안녕하세요. 요청 내용을 확인했어요. 궁금한 조건을 메시지로 보내주세요.",
          "other",
        ),
      ],
      archives: [],
    });
  }
  function sendMessage(
    body: string,
    attachments: ThreadMessage["attachments"],
  ) {
    if (!state.deal || (!body.trim() && !attachments.length))
      return state.messages;
    const deal = state.deal;
    const next =
      deal.bids.length || deal.rfp.status !== "sent"
        ? deal
        : {
            ...deal,
            bids: [
              {
                ...demoCompareBids[0],
                submittedBy: "demo-pg-user",
                submittedAt: now(),
              },
            ],
            matching: deal.matching && {
              ...deal.matching,
              reviews: deal.matching.reviews.map((review) => ({
                ...review,
                status: "quoted" as const,
              })),
            },
          };
    const reply = /정산/.test(body)
      ? "정산주기를 협의할 수 있어요. 견적 비교 화면의 수정 요청에서 원하는 조건을 보내주세요."
      : "문의 내용을 확인했어요. 데모 견적을 보냈으니 조건을 확인하고 궁금한 점을 더 알려주세요.";
    const messages = [
      ...state.messages,
      message(body.trim(), "self", attachments),
      message(reply, "other"),
    ];
    emit({ ...state, deal: next, messages });
    return messages;
  }
  async function requote(input: {
    rfpId: string;
    pgWsIds: string[];
    message: string;
    newDeadline: string;
  }) {
    const deal = state.deal;
    if (
      !deal ||
      deal.rfp.status !== "sent" ||
      !deal.bids[0] ||
      !input.message.trim()
    )
      return { ok: false as const, error: "RFP_NOT_OPEN" };
    const old = deal.bids[0];
    const cycle = input.message.match(/D\s*\+\s*(\d+)/i)?.[1];
    const discount = input.message.match(
      /(\d+(?:\.\d+)?)\s*%p?\s*(?:낮|인하|할인)/i,
    )?.[1];
    const lower = (rate: number) =>
      Math.max(0, Number((rate - Number(discount) / 100).toFixed(6)));
    const card = old.paymentFees.card;
    const paymentFees =
      discount && card !== undefined
        ? {
            ...old.paymentFees,
            card:
              typeof card === "number"
                ? lower(card)
                : Object.fromEntries(
                    Object.entries(card).map(([tier, rate]) => [
                      tier,
                      lower(rate),
                    ]),
                  ),
          }
        : old.paymentFees;
    const updated = {
      ...old,
      paymentFees,
      id: `demo-bid-${old.round + 1}`,
      round: old.round + 1,
      settleCycle: cycle
        ? `D+${Math.min(365, Number(cycle))}`
        : old.settleCycle,
      memo: `수정 요청을 검토한 체험용 견적이에요: ${input.message}`,
      submittedAt: now(),
    };
    emit({
      ...state,
      deal: {
        ...deal,
        bids: [updated],
        bidHistoryByPg: {
          [DEMO_PG.workspaceId]: [
            ...(deal.bidHistoryByPg?.[DEMO_PG.workspaceId] ?? [old]),
            updated,
          ],
        },
      },
      messages: [
        ...state.messages,
        message(`견적 수정 요청: ${input.message}`, "self"),
        message(
          "수정 견적을 보냈어요. 최신 회차에서 조건을 확인해요.",
          "other",
        ),
      ],
    });
    return { ok: true as const };
  }
  async function award(input: { rfpId: string; awardedBidId: string }) {
    const deal = state.deal;
    if (
      !deal ||
      deal.rfp.status !== "sent" ||
      deal.bids[0]?.id !== input.awardedBidId
    )
      return { ok: false as const, error: "WINNING_BID_OUTDATED" };
    emit({
      ...state,
      deal: {
        ...deal,
        rfp: {
          ...deal.rfp,
          status: "awarded",
          awardedBidId: input.awardedBidId,
        },
        signing: {
          contract: {
            id: "buyer-demo-contract",
            rfpId: deal.rfp.id,
            status: "sent",
            round: 1,
            createdBy: "demo-pg-user",
            createdAt: now(),
            sentAt: now(),
          },
          participants: [
            {
              id: "demo-buyer-signer",
              contractId: "buyer-demo-contract",
              name: DEMO_VIEWER.name,
              email: "buyer@example.com",
              role: "buyer",
              securityMethod: "easy_cert",
              status: "pending",
            },
            {
              id: "demo-pg-signer",
              contractId: "buyer-demo-contract",
              name: "박담당",
              email: "pg@example.com",
              role: "pg",
              securityMethod: "easy_cert",
              status: "signed",
              signedAt: now(),
            },
          ],
        },
      },
    });
    return { ok: true as const };
  }
  function completeSigning(name: string) {
    const deal = state.deal;
    if (!deal?.signing || deal.rfp.status !== "awarded" || !name.trim()) return;
    emit({
      ...state,
      deal: {
        ...deal,
        signing: {
          contract: {
            ...deal.signing.contract,
            status: "completed",
            completedAt: now(),
          },
          participants: deal.signing.participants.map((p) => ({
            ...p,
            name: p.role === "buyer" ? name.trim() : p.name,
            status: "signed",
            signedAt: now(),
          })),
        },
      },
      archives: [
        {
          id: "buyer-demo-archive",
          source: "signing",
          status: "ready",
          title: `${DEMO_COMPANY} 장기계약 부속합의서`,
          counterpartyName: DEMO_PG.name,
          rfpCode: deal.rfp.code,
          contractedAt: now(),
          documentName: "체험용 합의서.pdf",
          hasAudit: true,
          dealHref: `/rfp/${deal.rfp.code}`,
          canDelete: false,
          createdAt: now(),
        },
      ],
    });
  }
  function changeDeadline(input: { newDeadline: string }) {
    if (state.deal)
      emit({
        ...state,
        deal: {
          ...state.deal,
          rfp: { ...state.deal.rfp, deadline: input.newDeadline },
        },
      });
    return Promise.resolve({ ok: true as const });
  }
  function close(status: "closed" | "cancelled") {
    if (state.deal)
      emit({
        ...state,
        deal: { ...state.deal, rfp: { ...state.deal.rfp, status } },
      });
    return Promise.resolve({ ok: true as const });
  }
  function upload(file: File) {
    const url = URL.createObjectURL(file);
    urls.add(url);
    const row = {
      id: `buyer-demo-file-${files.size}`,
      name: file.name,
      size: file.size,
      mimeType: file.type || "application/pdf",
      url,
    };
    files.set(row.id, row);
    return row;
  }
  function inbox(): InboxListItem[] {
    if (!state.deal) return [];
    return [
      {
        kind: "counterparty",
        key: `c:${DEMO_CONVERSATION}`,
        rfpId: state.deal.rfp.id,
        closedAfterAward: false,
        conversationId: DEMO_CONVERSATION,
        counterparty: DEMO_PG,
        preview: state.messages.at(-1)?.body ?? "",
        lastMessageAt: state.messages.at(-1)?.createdAt ?? now(),
        unread: false,
        rfpCode: state.deal.rfp.code,
        rfpTitle: state.deal.rfp.title,
        rfpStatus: state.deal.rfp.status,
        rfpDeadline: state.deal.rfp.deadline,
      },
    ];
  }
  function uploadArchive(
    file: File,
    meta: { title: string; counterpartyName?: string; contractedAt?: string },
  ) {
    const row = upload(file);
    emit({
      ...state,
      archives: [
        ...state.archives,
        {
          id: row.id,
          source: "upload",
          status: "ready",
          title: meta.title,
          counterpartyName: meta.counterpartyName ?? null,
          contractedAt: meta.contractedAt ?? null,
          documentName: file.name,
          rfpCode: null,
          hasAudit: false,
          dealHref: null,
          canDelete: true,
          createdAt: now(),
        },
      ],
    });
    return Promise.resolve();
  }
  function deleteArchive({ id }: { id: string }) {
    emit({
      ...state,
      archives: state.archives.filter((a) => a.id !== id || !a.canDelete),
    });
    return Promise.resolve({ ok: true as const });
  }
  function agreement(): AgreementView {
    const bid = state.deal?.bids[0] ?? demoCompareBids[0];
    const rates = Object.entries(bid.paymentFees).flatMap(([key, value]) =>
      typeof value === "number"
        ? [{ key, rate: value }]
        : Object.entries(value).map(([tier, rate]) => ({
            key: `${key}:${tier}`,
            rate,
          })),
    );
    const result = buildAgreementFees(
      { paymentFees: bid.paymentFees, customFees: {}, customMethods: [] },
      rates,
    );
    const fees = result.ok ? result.rows : [];
    const parties = {
      buyer: {
        company: DEMO_COMPANY,
        bizNo: "1234567890",
        address: "서울시 중구 데모로 1",
        representative: "김구매",
      },
      pg: {
        company: DEMO_PG.name,
        bizNo: "1234567891",
        address: "서울시 중구 데모로 2",
        representative: "박담당",
      },
    };
    return {
      ok: true,
      mode: "agreement",
      editable: false,
      contractId: "buyer-demo-contract",
      revision: 1,
      rfpCode: state.deal?.rfp.code ?? "",
      fees,
      snapshot: {
        _v: 1,
        doc: buildAgreementDocument(DEMO_COMPANY, DEMO_PG.name),
        feeRows: fees,
        parties,
        agreement: {
          version: AGREEMENT_VERSION,
          rateVersion: 1,
          bidId: bid.id,
          signers: {
            buyer: { name: DEMO_VIEWER.name, email: "buyer@example.com" },
            pg: { name: "박담당", email: "pg@example.com" },
          },
        },
      },
    };
  }
  function openDocument(audit: boolean, id?: string) {
    const uploaded = id && files.get(id);
    window.open(
      uploaded
        ? uploaded.url
        : `/landing/demo-${audit ? "audit" : "agreement"}.pdf`,
      "_blank",
      "noopener,noreferrer",
    );
  }
  return {
    agreement,
    openDocument,
    uploadArchive,
    deleteArchive,
    changeDeadline,
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    calendar: sampleBusinessCalendar(new Date()),
    recommendation,
    submit,
    sendMessage,
    requote,
    award,
    completeSigning,
    close,
    upload,
    inbox,
    attachments: () => state.messages.flatMap((m) => m.attachments),
    dispose: () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    },
  };
}
export type BuyerDemoSession = ReturnType<typeof createBuyerDemoSession>;
