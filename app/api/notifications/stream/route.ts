/**
 * GET /api/notifications/stream — Server-Sent Events.
 *
 * 인증 필수(advisor pin 7: cookie 자동 동봉, EventSource same-origin).
 * 미인증 시 401.
 *
 * 접속 직후 history 미전송(advisor pin 5) — history는 GET /api/notifications
 * 으로 분리. 이 엔드포인트는 신규 emit만 데이터로 push.
 *
 * heartbeat 15s(advisor pin 4) — `: heartbeat\n\n` 코멘트 라인. 프록시 idle
 * timeout/죽은 연결 조기 감지. 제약 9: listener 누수 0 — abort 시 unsubscribe
 * + clearInterval + controller.close()로 깔끔히 정리.
 *
 * 단일 인스턴스 가정 — 다른 노드에서 만든 알림은 push 안 됨. bus.ts 헤더
 * 참조: prod 다중 인스턴스 swap 시 LISTEN/NOTIFY로 교체.
 */
import { auth } from '@/auth';
import { isSessionRevoked, isEmailUnverified } from '@/lib/auth/session';
import { subscribe } from '@/lib/server/notifications/bus';
import { shouldDeliverToWorkspace } from '@/lib/server/notifications/shouldDeliver';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HEARTBEAT_MS = 15_000;

export async function GET(req: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response('Unauthorized', { status: 401 });
  }

  // 폐기된 세션(sv stale — 비번 재설정 등) 거부 — requireSession 과 동일 기준 (C3).
  if (await isSessionRevoked(session)) return new Response('Unauthorized', { status: 401 });
  if (await isEmailUnverified(session)) return new Response('Forbidden', { status: 403 });
  if (!session.user.workspaceId) {
    return new Response('Forbidden', { status: 403 });
  }
  const userId = session.user.id;
  const currentWorkspaceId = session.user.workspaceId;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const safeEnqueue = (chunk: string): void => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // controller already closed (client disconnected mid-write).
          closed = true;
        }
      };

      // 신규 알림 구독 — 현재 워크스페이스 알림 + user-level(workspaceId=null)
      // 알림(워크스페이스 무관)을 전달. 다른 워크스페이스 전용 알림은 누설 금지.
      const unsubscribe = subscribe(userId, (n) => {
        if (!shouldDeliverToWorkspace(n, currentWorkspaceId)) return;
        safeEnqueue(`data: ${JSON.stringify(n)}\n\n`);
      });

      // heartbeat — 프록시 idle timeout 및 끊긴 연결 조기 감지.
      const hb = setInterval(() => {
        safeEnqueue(`: heartbeat\n\n`);
      }, HEARTBEAT_MS);

      const cleanup = (): void => {
        if (closed) return;
        closed = true;
        clearInterval(hb);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      // 클라이언트 연결 종료 시 listener + interval 둘 다 정리.
      req.signal.addEventListener('abort', cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Disable nginx/Fly proxy buffering if present.
      'X-Accel-Buffering': 'no',
    },
  });
}
