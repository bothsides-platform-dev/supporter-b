"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/primitives/Button";
import { BuyerSignupEmailForm } from "@/components/auth/BuyerSignupEmailForm";
import { BuyerSignupWorkspaceForm } from "@/components/auth/BuyerSignupWorkspaceForm";
import { BuyerSignupProfileForm } from "@/components/auth/BuyerSignupProfileForm";
import { EmailVerifySection } from "@/components/pending-approval/EmailVerifySection";
import {
  guestRequest,
  type GuestRequestStatus,
} from "@/lib/guest-rfp/requests-client";
import { GuestRequestCompletion } from "./GuestRequestCompletion";
import type { GuestQuoteController } from '@/lib/guest-rfp/quote-controller';
import { GuestQuoteSavings } from './GuestQuoteSavings';
import { GUEST_REQUEST_KEY } from "@/lib/guest-rfp/draft";
export { GUEST_REQUEST_KEY } from "@/lib/guest-rfp/draft";
type Account = {
  signedIn: boolean;
  email?: string;
  workspaces: { id: string; name: string; verified: boolean; status: string }[];
};
export function GuestRequestFlow({
  id,
  revision,
  initialWorkspaceId = "",
  onCancel,
  quote,
}: {
  quote?: GuestQuoteController;
  id: string;
  revision: number;
  initialWorkspaceId?: string;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [candidates, setCandidates] = useState<
    { id: string; name: string }[] | null
  >(null);
  const [summary, setSummary] = useState<{
    title: string;
    websiteUrl: string;
    mainProducts: string;
  } | null>(null);
  const [pgId, setPgId] = useState("");
  const [days, setDays] = useState(5);
  const [account, setAccount] = useState<Account | null>(null);
  const [workspaceId, setWorkspaceId] = useState(initialWorkspaceId);
  const [request, setRequest] = useState<GuestRequestStatus | null>(null);
  const [reserved, setReserved] = useState(false);
  const [signupStep, setSignupStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    const rememberedWorkspace = localStorage.getItem(
      `${GUEST_REQUEST_KEY}:${id}:workspace`,
    );
    if (!workspaceId && rememberedWorkspace)
      setWorkspaceId(rememberedWorkspace);
    const current = await guestRequest<Account>({ op: "account" });
    setAccount(current);
    if (current.workspaces.length === 1)
      setWorkspaceId(current.workspaces[0].id);
    let state = await guestRequest<GuestRequestStatus | null>({
      op: "status",
      id,
      ...(workspaceId || rememberedWorkspace
        ? { workspaceId: workspaceId || rememberedWorkspace }
        : {}),
    });
    if (state?.status === "unbound" && current.workspaces.length === 1) {
      const target = current.workspaces[0].id;
      await guestRequest({ op: "bind", id, workspaceId: target });
      localStorage.setItem(`${GUEST_REQUEST_KEY}:${id}:workspace`, target);
      state = await guestRequest<GuestRequestStatus>({
        op: "status",
        id,
        workspaceId: target,
      });
    }
    setRequest(state);
    setReserved(
      !!state && ["unbound", "waiting", "submitted"].includes(state.status),
    );
    if (
      !state ||
      ["canceled", "expired", "needs_action"].includes(state.status)
    ) {
      const result = await guestRequest<{
        summary: { title: string; websiteUrl: string; mainProducts: string };
        candidates: { id: string; name: string }[];
      }>({ op: "recommend", id, ...(workspaceId ? { workspaceId } : {}) });
      setCandidates(result.candidates);
      setSummary(result.summary);
    }
  }, [id, workspaceId]);
  useEffect(() => {
    let active = true;
    const update = () => {
      if (document.visibilityState === "visible")
        void refresh().catch((e) => {
          if (active) setError(e.message);
        });
    };
    update();
    const timer = setInterval(update, 10000);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [refresh]);
  const run = async (operation: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await operation();
    } catch (e) {
      setError(e instanceof Error ? e.message : "다시 시도해요.");
    } finally {
      setBusy(false);
    }
  };
  if (request?.status === "submitted")
    return (
      <GuestRequestCompletion
        request={request}
        workspaceId={workspaceId || undefined}
      />
    );
  const selectedWorkspace = account?.workspaces.find(
    (w) => w.id === workspaceId,
  );
  return (
    <section className="space-y-5" aria-label="견적 자동 요청">
      {reserved && request?.status === "unbound" && (
        <p role="status">
          {request.pgName}에 요청할 준비가 됐어요. 가입·인증과 입점 승인 후
          자동으로 보내요.
        </p>
      )}
      {error && (
        <p role="alert">
          {error}
          <Button variant="text" onClick={() => void run(refresh)}>
            다시 확인해요
          </Button>
        </p>
      )}
      {request?.status === "waiting" ? (
        <>
          <h2 className="text-[length:var(--md-typescale-title-large-size)] font-[number:var(--md-typescale-title-large-weight)] leading-[var(--md-typescale-title-large-line-height)] tracking-[var(--md-typescale-title-large-tracking)]">
            견적을 보내기 위한 확인을 기다려요
          </h2>
          <p role="status">
            이메일 인증과 입점 승인이 끝나면 {request.pgName}에 자동으로 보내요.
            이 화면을 닫아도 괜찮아요.
          </p>
          {selectedWorkspace && !selectedWorkspace.verified && (
            <EmailVerifySection
              email={account?.email ?? ""}
              initialVerified={false}
              onVerified={(reauthenticate) => {
                if (reauthenticate) router.push("/logout?next=%2Fquote-start");
                else
                  void run(async () => {
                    await guestRequest({ op: "bind", id, workspaceId });
                    localStorage.setItem(
                      `${GUEST_REQUEST_KEY}:${id}:workspace`,
                      workspaceId,
                    );
                    await refresh();
                  });
              }}
            />
          )}
        </>
      ) : !reserved ? (
        <>
          <h2 className="text-[length:var(--md-typescale-title-large-size)] font-[number:var(--md-typescale-title-large-weight)] leading-[var(--md-typescale-title-large-line-height)] tracking-[var(--md-typescale-title-large-tracking)]">
            견적을 받을 PG사를 선택해요
          </h2>
          {summary && (
            <dl className="space-y-2 break-words">
              <dt>요청 내용</dt>
              <dd>{summary.title}</dd>
              <dt>홈페이지</dt>
              <dd>{summary.websiteUrl}</dd>
              <dt>주요 상품</dt>
              <dd>{summary.mainProducts}</dd>
            </dl>
          )}
          {request && ["expired", "needs_action"].includes(request.status) && (
            <p role="status">
              요청 내용을 다시 확인해요. 답변은 그대로 보관하고 있어요.
            </p>
          )}
          {candidates === null ? (
            <p>PG사를 불러오는 중이에요…</p>
          ) : candidates.length === 0 ? (
            <p>지금은 요청할 수 있는 PG사가 없어요. 잠시 후 다시 확인해요.</p>
          ) : (
            <fieldset className="space-y-3">
              <legend className="sr-only">PG사</legend>
              {candidates.map((pg) => (
                <label
                  key={pg.id}
                  className="flex min-h-11 items-center gap-3 rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] p-3"
                >
                  <input
                    type="radio"
                    name="guest-pg"
                    disabled={calculating || busy}
                    checked={pgId === pg.id}
                    onChange={() => setPgId(pg.id)}
                  />
                  {pg.name}
                </label>
              ))}
            </fieldset>
          )}
          {quote && <GuestQuoteSavings quote={quote} selectedPgId={pgId} onBusyChange={setCalculating} />}
          <label className="block">
            응답 기간
            <select
              className="ml-3 min-h-11"
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
            >
              {[3, 5, 10].map((day) => (
                <option key={day} value={day}>
                  {day}영업일
                </option>
              ))}
            </select>
          </label>
          <p>실제 발송일 다음 날부터 계산해요. 응답 마감은 오후 6시예요.</p>
          <p>이메일 인증과 입점 승인이 끝나면 선택한 PG사에 자동으로 보내요.</p>
          <p className="text-[length:var(--md-typescale-body-small-size)] text-[var(--md-sys-color-on-surface-variant)]">
            계정에 연결한 날부터 30일 동안 유효해요. 보내기 전에는 취소할 수
            있어요.
          </p>
          <Button
            disabled={!pgId || busy || calculating}
            fullWidth
            onClick={() =>
              void run(async () => {
                await guestRequest({
                  op: "reserve",
                  id,
                  revision: quote?.session.draft.serverRevision ?? revision,
                  pgId,
                  days,
                  ...(workspaceId ? { workspaceId } : {}),
                });
                localStorage.setItem(GUEST_REQUEST_KEY, id);
                setReserved(true);
                await refresh();
              })
            }
          >
            선택한 PG사에 자동 요청하기
          </Button>
        </>
      ) : account?.signedIn ? (
        <>
          <h2 className="text-[length:var(--md-typescale-title-large-size)] font-[number:var(--md-typescale-title-large-weight)] leading-[var(--md-typescale-title-large-line-height)] tracking-[var(--md-typescale-title-large-tracking)]">
            견적을 요청할 회사를 확인해요
          </h2>
          <fieldset>
            <legend>구매사 워크스페이스</legend>
            {account.workspaces.map((ws) => (
              <label key={ws.id} className="flex min-h-11 items-center gap-3">
                <input
                  name="guest-workspace"
                  type="radio"
                  checked={workspaceId === ws.id}
                  onChange={() => setWorkspaceId(ws.id)}
                />
                {ws.name}
              </label>
            ))}
          </fieldset>
          <Button
            disabled={!workspaceId || busy}
            onClick={() =>
              void run(async () => {
                await guestRequest({ op: "bind", id, workspaceId });
                localStorage.setItem(
                  `${GUEST_REQUEST_KEY}:${id}:workspace`,
                  workspaceId,
                );
                await refresh();
              })
            }
          >
            이 회사로 요청을 이어갈게요
          </Button>
        </>
      ) : (
        <>
          <Suspense fallback={<p>가입 정보를 불러오는 중이에요…</p>}>
            {signupStep === 0 ? (
              <BuyerSignupEmailForm
                embedded
                onContinue={() => setSignupStep(1)}
              />
            ) : signupStep === 1 ? (
              <BuyerSignupWorkspaceForm onContinue={() => setSignupStep(2)} />
            ) : (
              <BuyerSignupProfileForm onComplete={() => void run(refresh)} />
            )}
          </Suspense>
          <Link href="/login?next=%2Fquote-start">
            기존 계정으로 로그인해요
          </Link>
        </>
      )}
      <Button
        variant="text"
        disabled={busy}
        onClick={() =>
          void run(async () => {
            if (request)
              await guestRequest({
                op: "cancel",
                id,
                ...(workspaceId ? { workspaceId } : {}),
              });
            localStorage.removeItem(GUEST_REQUEST_KEY);
            onCancel();
          })
        }
      >
        {reserved ? "자동 요청을 취소하고 수정해요" : "답변을 수정해요"}
      </Button>
    </section>
  );
}
