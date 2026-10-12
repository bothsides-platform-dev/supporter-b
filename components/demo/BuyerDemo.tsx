"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { BuyerDemoContext } from "@/lib/demo/buyer-demo-context";
import {
  createBuyerDemoSession,
  type BuyerDemoMode,
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
  const [mode, setMode] = useState<BuyerDemoMode | null>(null);
  if (!mode)
    return (
      <main className="flex min-h-dvh flex-col bg-[var(--md-sys-color-background)] text-[var(--md-sys-color-on-surface)]">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--md-sys-color-outline-variant)] p-4">
          <Chip label="구매사 데모" color="primary" />
          <Link
            className="inline-flex min-h-11 items-center rounded-[6px] text-[13px] text-[var(--md-sys-color-primary)] focus-visible:outline-2"
            href="/quote-start"
          >
            내 조건으로 견적 요청하기
          </Link>
        </div>
        <section className="m-auto w-full max-w-2xl space-y-6 px-6 py-12">
          <h1 className="text-[length:var(--md-typescale-headline-small-size)] font-semibold">
            견적부터 계약 보관까지 직접 체험해요
          </h1>
          <p>
            준비된 견적에서 핵심 흐름을 확인하거나, 견적 요청 작성부터 시작할 수
            있어요. 예시 데이터로 진행하며 실제 요청이나 계약은 보내지 않아요.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button className="min-h-11" onClick={() => setMode("quick")}>
              핵심 흐름 체험하기
            </Button>
            <Button
              className="min-h-11"
              variant="outlined"
              onClick={() => setMode("full")}
            >
              견적 요청부터 체험하기
            </Button>
          </div>
          <Link className="inline-flex min-h-11 items-center" href="/">
            나가기
          </Link>
        </section>
      </main>
    );
  return (
    <DemoSession
      key={version}
      mode={mode}
      onChangeMode={() => setMode(null)}
      onRestart={() => setVersion((v) => v + 1)}
    />
  );
}
function DemoSession({
  onRestart,
  onChangeMode,
  mode,
}: {
  onRestart: () => void;
  onChangeMode: () => void;
  mode: BuyerDemoMode;
}) {
  useEffect(() => () => useUIStore.getState().closeCommandPalette(), []);
  const ready = useSyncExternalStore(
    subscribeHydration,
    () => true,
    () => false,
  );
  const [demo] = useState(() => createBuyerDemoSession(mode));
  const state = useSyncExternalStore(
    demo.subscribe,
    demo.getSnapshot,
    demo.getSnapshot,
  );
  const [location, setLocation] = useState(() =>
    mode === "quick" ? `/rfp/${demo.getSnapshot().deal!.rfp.code}` : "/home",
  );
  const [restart, setRestart] = useState(false);
  const [changeMode, setChangeMode] = useState(false);
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
  const fullStage = completed
    ? 5
    : awarded
      ? 4
      : deal
        ? deal.bids.length
          ? 2
          : 1
        : 0;
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
          <div className="flex shrink-0 items-center gap-2 border-b border-[var(--md-sys-color-outline-variant)] px-3 py-1 text-[13px]">
            <Chip label="구매사 데모" color="primary" />
            <span className="hidden md:block md:flex-1">
              {" "}
              견적 요청·PG 메시지·계약은 가상으로 진행돼요.
            </span>
            <Link
              href="/quote-start"
              className="ml-auto inline-flex min-h-11 items-center rounded-[6px] px-1 text-[var(--md-sys-color-primary)] focus-visible:outline-2"
            >
              내 조건으로 견적 요청하기
            </Link>
            <details className="relative">
              <summary className="flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-[6px] focus-visible:outline-2">
                더보기
              </summary>
              <div className="absolute right-0 top-full z-50 flex w-48 flex-col gap-1 rounded-[6px] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] p-2 shadow-md [&_a]:min-h-11 [&_a]:flex [&_a]:items-center [&_button]:min-h-11">
                <DemoServiceContact />
                <Button variant="text" onClick={() => setRestart(true)}>
                  처음부터
                </Button>
                <Button variant="text" onClick={() => setChangeMode(true)}>
                  체험 바꾸기
                </Button>
                <Link href="/">나가기</Link>
              </div>
            </details>
          </div>
          <div
            className="relative min-h-0 flex-1 [contain:layout] [&_[data-slot=sidebar-container]]:absolute [&_[data-slot=sidebar-container]]:h-full"
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
                    <div className="px-4 py-6 md:px-8 md:py-10">
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
            className="flex shrink-0 flex-wrap items-center gap-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] [&_button]:min-h-11 md:[&_button]:min-h-8 border-t border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] px-4 py-3 text-[14px]"
          >
            <BuyerDemoGuide
              mode={mode}
              complete={completed && pathname === "/contracts"}
              stage={mode === "full" ? fullStage : Math.max(0, fullStage - 2)}
              onReturn={() =>
                navigate(
                  completed
                    ? "/contracts"
                    : awarded || deal?.bids.length
                      ? dealHref
                      : deal
                        ? "/messages"
                        : "/rfp-create",
                )
              }
              revised={!!deal?.bids.some((bid) => bid.round > 1)}
            />
            {deal &&
              !awarded &&
              pathname !== (deal.bids.length ? dealHref : "/messages") && (
                <Button
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
            {completed && pathname !== "/contracts" && (
              <Button
                className="min-h-11 md:min-h-7"
                data-coachmark="demo-archive"
                size="sm"
                onClick={() => navigate("/contracts")}
              >
                계약 보관함 보기
              </Button>
            )}
            {completed && pathname === "/contracts" && (
              <div
                role="status"
                className="flex w-full flex-wrap items-center justify-between gap-2"
              >
                <p>
                  견적부터 계약 보관까지 모두 체험했어요. 보관된 PDF도 열어볼 수
                  있어요.
                </p>
                <Link
                  className="inline-flex min-h-11 items-center text-[var(--md-sys-color-primary)]"
                  href="/quote-start"
                >
                  내 조건으로 견적 요청하기
                </Link>
              </div>
            )}
          </aside>
          <CommandPalette workspaceType="buyer" />
          <Dialog open={sign} onOpenChange={setSign}>
            <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto [&_button]:min-h-11 [&_label]:min-h-11 md:[&_button]:min-h-8">
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
            open={changeMode}
            onOpenChange={setChangeMode}
            title="다른 체험으로 바꿀까요?"
            description="지금까지 체험한 내용이 초기화되고 시작 화면으로 돌아가요."
            confirmLabel="체험 바꾸기"
            onConfirm={onChangeMode}
          />
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
