"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { BuyerDemoContext } from "@/lib/demo/buyer-demo-context";
import {
  createBuyerDemoSession,
  DEMO_COMPANY,
  DEMO_CONVERSATION,
  DEMO_PG,
  DEMO_VIEWER,
} from "@/lib/demo/buyer-demo-session";
import { DemoNavProvider } from "@/lib/nav/demo-nav-context";
import {
  SidebarProvider,
  SidebarInset,
  useSidebar,
} from "@/components/ui/sidebar";
import { DemoSidebar } from "@/components/landing/demo-app/DemoSidebar";
import { CommandPalette } from "@/components/shell/CommandPalette";
import { useUIStore } from "@/lib/stores/ui";
import { Header } from "@/components/shell/Header";
import { MobileShellBar } from "@/components/shell/MobileShellBar";
import { HomeDashboard } from "@/components/home/HomeDashboard";
import { buildBuyerDashboard } from "@/lib/server/dashboard/buildDashboard";
import { RfpListPageHost } from "@/components/landing/demo-app/pages/RfpListPageHost";
import { RfpCreateWizard } from "@/components/rfp/RfpCreateWizard";
import { BuyerDealRoomBody } from "@/components/deal-room/buyer/BuyerDealRoomBody";
import { DealRoomFull } from "@/components/deal-room/DealRoomFull";
import { ThreadView } from "@/components/messages/ThreadView";
import { MessageInbox } from "@/components/messages/MessageInbox";
import { ContractArchiveList } from "@/components/contract-archive/ContractArchiveList";
import { useIsolatedRfpDraft } from "@/components/landing/useIsolatedRfpDraft";
import {
  tutorialBizProfile,
  tutorialIndustryGroups,
  tutorialRfpDraftSeed,
} from "@/lib/onboarding/tutorial-fixtures";
import { useRfpDraftStore } from "@/lib/stores/rfp-draft";
import { Button } from "@/components/primitives/Button";
import { Chip } from "@/components/primitives/Chip";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DemoSigningForm } from "./DemoSigningForm";
import { BuyerDemoGuide } from "./BuyerDemoGuide";
import { DemoServiceContact } from "./DemoServiceContact";
import { toast } from "@/lib/toast";

const subscribeHydration = () => () => {};
const available = ["/home", "/rfp", "/messages", "/contracts"];
export function BuyerDemo() {
  const [version, setVersion] = useState(0);
  return (
    <DemoSession key={version} onRestart={() => setVersion((v) => v + 1)} />
  );
}
function DemoSession({ onRestart }: { onRestart: () => void }) {
  useEffect(() => () => useUIStore.getState().closeCommandPalette(), []);
  const ready = useSyncExternalStore(
    subscribeHydration,
    () => true,
    () => false,
  );
  const [demo] = useState(createBuyerDemoSession);
  const state = useSyncExternalStore(
    demo.subscribe,
    demo.getSnapshot,
    demo.getSnapshot,
  );
  const [location, setLocation] = useState("/home");
  const [restart, setRestart] = useState(false);
  const [sign, setSign] = useState(false);
  useIsolatedRfpDraft();
  useEffect(() => {
    useRfpDraftStore.setState({
      ...tutorialRfpDraftSeed,
      title: `${DEMO_COMPANY} 결제 인프라 견적 요청`,
      websiteUrl: "https://example.com",
      allowedPgWorkspaceIds: [],
      productInfo: {
        hasMarketplaceSellers: false,
        cashConvertible: false,
        maximumPrice: "under_100k",
        salesMethods: ["none"],
      },
    });
    return () => demo.dispose();
  }, [demo]);
  const navigate = useCallback((href: string) => {
    const path = href.split("?")[0];
    if (
      available.includes(path) ||
      path === "/rfp-create" ||
      path.startsWith("/rfp/")
    )
      setLocation(href);
    else
      toast("이 데모에서는 견적 요청부터 계약 보관까지 체험할 수 있어요.", {
        type: "info",
      });
  }, []);
  const [pathname, search = ""] = location.split("?");
  const deal = state.deal;
  const rfps = deal ? [deal.rfp] : [];
  const awarded = deal?.rfp.status === "awarded";
  const completed = deal?.signing?.contract.status === "completed";
  const dealHref = deal ? `/rfp/${deal.rfp.code}` : "/rfp";
  if (!ready)
    return (
      <div role="status" className="grid min-h-dvh place-items-center">
        데모를 불러오는 중이에요…
      </div>
    );
  return (
    <BuyerDemoContext value={demo}>
      <DemoNavProvider value={{ pathname, search, navigate }}>
        <div
          data-demo-ready="true"
          className="flex h-dvh min-h-0 flex-col bg-[var(--md-sys-color-background)] text-[var(--md-sys-color-on-surface)]"
        >
          <div className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-2 border-b border-[var(--md-sys-color-outline-variant)] px-4 py-2 text-[13px]">
            <Chip label="구매사 데모" color="primary" />

            <span className="order-last w-full text-[12px] sm:order-none sm:w-auto sm:flex-1 sm:text-[13px]">
              <span className="sm:hidden">가상 체험</span>
              <span className="hidden sm:inline">견적 요청·PG 메시지·계약은 가상으로 진행돼요.</span>
            </span>
            <div className="hidden items-center gap-3 sm:flex">
              <DemoServiceContact />
              <Button variant="text" size="sm" onClick={() => setRestart(true)}>처음부터</Button>
              <Link href="/">나가기</Link>
            </div>
            <Link
              href="/signup/buyer"
              className="flex min-h-11 items-center md:min-h-0 text-[var(--md-sys-color-primary)]"
            >
              무료로 시작하기
            </Link>
            <details className="relative sm:hidden">
              <summary className="flex min-h-11 cursor-pointer list-none items-center rounded-[6px] border border-[var(--md-sys-color-outline-variant)] px-3">메뉴</summary>
              <div className="absolute right-0 top-full z-20 mt-1 grid min-w-40 gap-1 rounded-[6px] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] p-2 shadow-lg">
                <DemoServiceContact />
                <Button className="min-h-11 md:min-h-7" variant="text" size="sm" onClick={() => setRestart(true)}>처음부터</Button>
                <Link className="min-h-11 px-3 py-3" href="/">나가기</Link>
              </div>
            </details>
          </div>
          <div
            className="relative min-h-0 flex-1 [&_[data-slot=sidebar-container]]:absolute [&_[data-slot=sidebar-container]]:h-full"
            onClickCapture={(event) => {
              const anchor = (event.target as HTMLElement).closest("a[href]");
              const href = anchor?.getAttribute("href");
              if (!href || href.startsWith("blob:") || href.startsWith("#"))
                return;
              event.preventDefault();
              event.stopPropagation();
              if (href.startsWith("/api/")) {
                void demo.openDocument(
                  href.includes("audit"),
                  href.split("/")[3],
                );
                return;
              }
              navigate(href);
            }}
          >
            <SidebarProvider
              style={
                {
                  height: "100%",
                  minHeight: 0,
                  "--sidebar-width": "var(--shell-sidebar)",
                } as React.CSSProperties
              }
            >
              <CloseMobileNavigation pathname={location} />
              <DemoSidebar
                workspaceName={DEMO_COMPANY}
                isInert={(href) =>
                  ![...available, "/rfp-create"].includes(href.split("?")[0])
                }
              />
              <SidebarInset className="min-w-0 flex-1 bg-[var(--shell-chrome-bg)]">
                <Header
                  className="hidden md:flex"
                  workspaceType="buyer"
                  user={{
                    id: DEMO_VIEWER.userId,
                    name: DEMO_VIEWER.name,
                    email: "buyer@example.com",
                    avatarUpdatedAt: null,
                  }}
                />
                <MobileShellBar workspaceName={DEMO_COMPANY} />
                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                  {pathname === "/home" && (
                    <div className="px-8 py-10">
                      <HomeDashboard
                        dashboard={buildBuyerDashboard(
                          rfps,
                          new Map(
                            deal ? [[deal.rfp.id, deal.bids.length]] : [],
                          ),
                          new Date(),
                        )}
                        workspaceType="buyer"
                        items={demo.inbox()}
                        unreadCount={0}
                      />
                    </div>
                  )}
                  {pathname === "/rfp" && (
                    <RfpListPageHost
                      rfps={rfps}
                      progressByRfpId={
                        deal
                          ? { [deal.rfp.id]: { bidCount: deal.bids.length } }
                          : {}
                      }
                      onOpenRfp={(code) => navigate(`/rfp/${code}`)}
                    />
                  )}
                  {pathname === "/rfp-create" && (
                    <RfpCreateWizard
                      bizProfile={tutorialBizProfile}
                      workspaceName={DEMO_COMPANY}
                      pgList={[]}
                      industryGroups={tutorialIndustryGroups}
                      onSampleSubmit={() => navigate("/messages")}
                    />
                  )}
                  {pathname.startsWith("/rfp/") && deal && (
                    <DealRoomFull
                      code={deal.rfp.code}
                      title={deal.rfp.title}
                      chat={
                        <ThreadView
                          conversationId={DEMO_CONVERSATION}
                          counterparty={DEMO_PG}
                          viewer={DEMO_VIEWER}
                          messages={state.messages}
                          variant="rail"
                        />
                      }
                    >
                      <BuyerDealRoomBody key={deal.rfp.status} data={deal} />
                    </DealRoomFull>
                  )}
                  {pathname === "/messages" && (
                    <MessageInbox
                      items={demo.inbox()}
                      initialSelectedKey={
                        deal ? `c:${DEMO_CONVERSATION}` : null
                      }
                    />
                  )}
                  {pathname === "/contracts" && (
                    <ContractArchiveList
                      key={state.archives.length}
                      initialEntries={state.archives}
                    />
                  )}
                </div>
              </SidebarInset>
            </SidebarProvider>
          </div>
          <aside
            aria-label="데모 체험 안내"
            className="flex shrink-0 flex-wrap items-center gap-2 border-t border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-[14px]"
          >
            <BuyerDemoGuide
              revised={!!deal?.bids.some((bid) => bid.round > 1)}
            />
            {deal && !awarded && !pathname.startsWith('/rfp/') && (deal.bids.length > 0 || pathname !== "/messages") && (
              <Button
                className="min-h-11 md:min-h-7"
                size="sm"
                variant="outlined"
                data-coachmark={
                  deal.bids.length ? "demo-open-quote" : "demo-open-chat"
                }
                onClick={() =>
                  navigate(deal.bids.length ? dealHref : "/messages")
                }
              >
                {deal.bids.length ? "받은 견적 확인하기" : "메시지 상담하기"}
              </Button>
            )}
            {awarded && !completed && (
              <>
                <Button
                  className="min-h-11 md:min-h-7"
                  size="sm"
                  variant="outlined"
                  onClick={() => navigate(dealHref)}
                >
                  계약 상태 보기
                </Button>
                <Button
                  className="min-h-11 md:min-h-7"
                  data-coachmark="demo-sign"
                  size="sm"
                  onClick={() => setSign(true)}
                >
                  서명 체험하기
                </Button>
              </>
            )}
            {completed && (
              <Button
                className="min-h-11 md:min-h-7"
                data-coachmark="demo-archive"
                size="sm"
                onClick={() => navigate("/contracts")}
              >
                계약 보관함 보기
              </Button>
            )}
          </aside>
          <CommandPalette workspaceType="buyer" />
          <Dialog open={sign} onOpenChange={setSign}>
            <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
              <DialogTitle>전자서명 체험</DialogTitle>
              <div data-demo-guide-slot />
              <DialogDescription>
                실제 서비스에서는 서명 요청 이메일의 스노우싸인 화면에서
                본인인증 후 서명해요. 이 창은 체험용이며 계약 효력이 없어요.
              </DialogDescription>
              <DemoSigningForm
                onOpenDocument={() => void demo.openDocument(false)}
                onComplete={(name) => {
                  demo.completeSigning(name);
                  setSign(false);
                  navigate(dealHref);
                }}
              />
            </DialogContent>
          </Dialog>
          <ConfirmDialog
            open={restart}
            onOpenChange={setRestart}
            title="처음부터 다시 체험할까요?"
            description="지금까지 체험한 내용이 초기화돼요."
            confirmLabel="다시 시작하기"
            onConfirm={onRestart}
          />
        </div>
      </DemoNavProvider>
    </BuyerDemoContext>
  );
}

function CloseMobileNavigation({ pathname }: { pathname: string }) {
  const { setOpenMobile } = useSidebar();
  useEffect(() => {
    setOpenMobile(false);
  }, [pathname, setOpenMobile]);
  return null;
}
