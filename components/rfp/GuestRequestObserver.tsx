"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { toast } from "@/lib/toast";
import {
  subscribeToLiveNotifications,
  useNotifications,
} from "@/lib/hooks/useNotifications";
import {
  guestRequest,
  type GuestRequestStatus,
} from "@/lib/guest-rfp/requests-client";
export function GuestRequestObserver({ workspaceId }: { workspaceId: string }) {
  useNotifications(workspaceId);
  const router = useRouter();
  useEffect(() => {
    let active = true;
    let running = false;
    const refresh = async () => {
      if (running || document.visibilityState !== "visible") return;
      running = true;
      try {
        const requests = await guestRequest<GuestRequestStatus[]>({
          op: "list",
          workspaceId,
        });
        for (const request of requests) {
          if (
            !active ||
            request.status !== "submitted" ||
            request.effectSeen ||
            !request.rfpCode
          )
            continue;
          const { claimed } = await guestRequest<{ claimed: boolean }>({
            op: "effect",
            id: request.id,
            workspaceId,
          });
          if (active && claimed)
            toast(`${request.pgName}에 견적을 요청했어요`, {
              type: "success",
              action: {
                label: "요청한 견적 보기",
                onClick: () => router.push(`/rfp/${request.rfpCode}`),
              },
            });
        }
      } catch {
        /* Reconnect, focus and periodic checks retry. */
      } finally {
        running = false;
      }
    };
    void refresh();
    const unsubscribe = subscribeToLiveNotifications((notification) => {
      if (notification.type === "rfp.auto_sent") void refresh();
    });
    const timer = setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      unsubscribe();
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [workspaceId, router]);
  return null;
}
