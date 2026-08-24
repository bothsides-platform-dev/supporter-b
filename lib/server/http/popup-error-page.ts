/**
 * 새 탭에서 열리는 다운로드 링크의 오류 응답 — 최소 한글 HTML 페이지.
 *
 * `target="_blank"` 로 열린 탭에 JSON 을 돌려주면 사용자는 팝업 안에서
 * `{"ok":false,"error":"ARCHIVE_NOT_READY"}` 를 그대로 보게 된다. 그 탭에는 우리
 * 애플리케이션 셸이 없어 토스트로 옮겨 줄 수도 없다 — 그래서 응답 자체가 사람이
 * 읽을 수 있어야 한다.
 *
 * 전자서명 완료본 프록시(`signing/download-handler.ts`)가 먼저 쓰던 것을 계약
 * 보관함 다운로드가 함께 쓰도록 끌어냈다.
 */
function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}

export function popupErrorPage(message: string, status: number, title = '서포트비'): Response {
  const html =
    `<!doctype html><html lang="ko"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title></head>` +
    `<body style="font-family:system-ui,-apple-system,sans-serif;display:grid;place-items:center;` +
    `min-height:100vh;margin:0;color:#1e1e1e;background:#fff">` +
    `<div style="text-align:center;max-width:360px;padding:24px">` +
    `<p style="font-size:15px;font-weight:600;margin:0 0 8px">${escapeHtml(message)}</p>` +
    `<p style="font-size:13px;color:#6b7280;margin:0">이 창을 닫고 다시 시도해 주세요.</p>` +
    `</div></body></html>`;
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store' },
  });
}
