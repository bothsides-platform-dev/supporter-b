"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import {
  guestRequest,
  type GuestRequestStatus,
} from "@/lib/guest-rfp/requests-client";
import { switchWorkspaceAction } from "@/lib/server/actions/workspace/switchWorkspaceAction";
import { useCelebrationConfetti } from "@/lib/hooks/useCelebrationConfetti";
function Celebration() {
  const { canvasRef } = useCelebrationConfetti();
  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-50 h-full w-full"
    />
  );
}
export function GuestRequestCompletion({
  request,
  workspaceId,
}: {
  request: GuestRequestStatus;
  workspaceId?: string;
}) {
  const title = useRef<HTMLHeadingElement>(null);
  const [error, setError] = useState("");
  const [celebrate, setCelebrate] = useState(false);
  const reduce = useReducedMotion();
  const claimRequest = useRef<{ key: string; promise: Promise<{ claimed: boolean }> } | null>(null);
  useEffect(() => {
    if (request.status !== "submitted") return;
    title.current?.focus();
    let active = true;
    const claim = async () => {
      if (document.visibilityState !== "visible" || request.effectSeen) return;
      try {
        const key = `${request.id}:${workspaceId ?? ''}`;
        if (claimRequest.current?.key !== key) {
          claimRequest.current = { key, promise: guestRequest<{ claimed: boolean }>({ op: "effect", id: request.id, workspaceId }) };
        }
        const result = await claimRequest.current.promise;
        if (active && result.claimed) setCelebrate(true);
      } catch {
        claimRequest.current = null;
        /* A later visible visit can claim the effect. */
      }
    };
    void claim();
    document.addEventListener("visibilitychange", claim);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", claim);
    };
  }, [request.id, request.status, request.effectSeen, workspaceId]);
  if (request.status !== "submitted" || !request.rfpCode || !request.deadline)
    return null;
  return (
    <section className="space-y-4" aria-live="polite">
      {celebrate && !reduce && <Celebration />}
      <motion.div
        initial={false}
        animate={
          celebrate && !reduce
            ? { scale: [0.85, 1.08, 1], opacity: [0.5, 1] }
            : { scale: 1, opacity: 1 }
        }
        transition={{ duration: 0.3 }}
        className="text-[var(--md-sys-color-primary)]"
      >
        <Check aria-hidden size={32} />
      </motion.div>
      <h2
        ref={title}
        tabIndex={-1}
        className="text-[length:var(--md-typescale-title-large-size)] font-[number:var(--md-typescale-title-large-weight)] leading-[var(--md-typescale-title-large-line-height)] tracking-[var(--md-typescale-title-large-tracking)]"
      >
        {request.pgName}에 견적을 요청했어요
      </h2>
      <dl>
        <dt>견적 요청 번호</dt>
        <dd className="md-numeric">{request.rfpCode}</dd>
        <dt>응답 마감일</dt>
        <dd className="md-numeric">
          {new Intl.DateTimeFormat("ko-KR", {
            timeZone: "Asia/Seoul",
            dateStyle: "long",
            timeStyle: "short",
          }).format(new Date(request.deadline))}
        </dd>
      </dl>
      {error && <p role="alert">{error}</p>}
      <Link
        href={`/rfp/${request.rfpCode}`}
        onClick={(event) => {
          if (!workspaceId) return;
          event.preventDefault();
          void switchWorkspaceAction(workspaceId, `/rfp/${request.rfpCode}`)
            .then((result) => {
              if (result.ok) window.location.assign(result.redirectTo);
              else setError("워크스페이스를 확인하고 다시 열어봐요.");
            })
            .catch(() => setError("견적을 열지 못했어요. 다시 시도해요."));
        }}
        className="inline-flex min-h-11 items-center rounded-[var(--md-sys-shape-small)] bg-[var(--md-sys-color-primary)] px-4 text-[var(--md-sys-color-on-primary)]"
      >
        요청한 견적 보기
      </Link>
    </section>
  );
}
