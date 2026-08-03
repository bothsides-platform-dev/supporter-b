/**
 * scripts/signing/snowsign-smoke.ts — 스노우싸인 임베드 발송 경로 실측 하네스.
 *
 * 왜 필요한가
 *   딜룸 건별 임베드 설계는 네 가지 미검증 가정 위에 서 있다. 유닛 테스트는 전부
 *   HTTP mock 이라 이 가정들을 검증하지 못한다 — 실 API 키로 한 번 찍어봐야 한다.
 *
 *     Q1  flows:['pdf_send'] 임베드 세션이 발급되고, iframe 안에서 PDF 업로드 →
 *         서명칸 배치 → 발송이 실제로 완주되는가
 *     Q2  완료 시 parent 로 오는 postMessage 의 정확한 이벤트명·payload 형태
 *         (contract_id 가 그 안에 들어오는가)
 *     Q3  임베드 세션에 넣은 external_id 가 GET /v1/contracts/{id} 응답에
 *         되돌아오는가  ← 서버측 소유 검증과 고아 복구 자동화가 여기 달려 있다
 *     Q4  iframe_url 의 실제 오리진 호스트 (CSP frame-src 핀 값)
 *
 * 쓰는 법
 *     SNOWSIGN_API_KEY=... pnpm tsx scripts/signing/snowsign-smoke.ts
 *
 *   그러면 로컬 하네스가 http://localhost:4599 에 뜬다. 브라우저로 열어서 임베드
 *   안에서 실제로 계약서를 한 건 발송하면, 이 스크립트가 postMessage 를 그대로
 *   받아 찍고 이어서 계약 상세를 재조회해 Q3 를 판정한다.
 *
 *   키가 없으면 아무것도 하지 않고 exit 0 — CI 에서 무해하다.
 *
 * ⚠️ 출력에는 실 계약 참여자 이메일 등 라이브 데이터가 섞일 수 있다. 그대로
 *    커밋하지 말고, 판정 결과만 docs/SNOWSIGN_SANDBOX.md 에 옮겨 적을 것.
 *
 * 이 스크립트는 진단 도구다(1회성 harness). 판정 로직 중 순수 함수인 이벤트
 * 파싱은 lib/signing/embed-events.ts 로 빼서 단위 테스트로 덮여 있다 — 여기 남은
 * 것은 I/O 껍데기뿐이다.
 */
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

import { extractContractId, isEmbedCompletionEvent } from '../../lib/signing/embed-events';

const API_KEY = process.env.SNOWSIGN_API_KEY;
const BASE_URL = process.env.SNOWSIGN_API_URL ?? 'https://api-snowsign.jtsnowball.com/public';
const PORT = Number(process.env.SNOWSIGN_SMOKE_PORT ?? 4599);
/**
 * 하네스 호스트. 기본값이 `localhost` 가 아니라 `lvh.me` 인 이유: lvh.me 는 127.0.0.1
 * 로 풀리는 공개 도메인이라 로컬에서 그대로 열리면서도 임베드의 `allowed_origins`
 * 에는 진짜 도메인으로 보인다 — 공급자가 `localhost` 를 거부해도 통과한다.
 * 이 프로젝트의 로컬 QA 도 lvh.me 를 쓴다.
 */
const HOST = process.env.SNOWSIGN_SMOKE_HOST ?? 'lvh.me';
const HARNESS_ORIGIN = `http://${HOST}:${PORT}`;

/** 이 실행에서 확인할 external_id. Q3 는 이 값이 되돌아오는지로 판정한다. */
const EXTERNAL_ID = `sc:${randomUUID()}`;

type Findings = {
  q1_embedSession: 'pass' | 'fail' | 'pending';
  q2_completionEvent: string | 'pending';
  q3_externalIdEcho: 'yes' | 'no' | 'pending';
  q4_embedOrigin: string | 'pending';
};

const findings: Findings = {
  q1_embedSession: 'pending',
  q2_completionEvent: 'pending',
  q3_externalIdEcho: 'pending',
  q4_embedOrigin: 'pending',
};

function log(section: string, body: unknown): void {
  console.log(`\n${'─'.repeat(72)}\n▶ ${section}\n${'─'.repeat(72)}`);
  console.log(typeof body === 'string' ? body : JSON.stringify(body, null, 2));
}

async function api(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'X-API-Key': API_KEY as string,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  if (!res.ok) {
    log(`✗ ${method} ${path} → HTTP ${res.status}`, parsed);
    throw new Error(`${method} ${path} failed: HTTP ${res.status}`);
  }
  log(`✓ ${method} ${path} → HTTP ${res.status} (raw)`, parsed);
  return parsed;
}

/** 응답 어디엔가 EXTERNAL_ID 가 들어있는지 — 키 이름을 모르므로 문자열로 훑는다. */
function echoesExternalId(raw: unknown): boolean {
  return JSON.stringify(raw ?? null).includes(EXTERNAL_ID);
}

function harnessPage(iframeUrl: string): string {
  // 임베드를 그대로 띄우고, 오는 postMessage 를 전부 스크립트로 되돌려 보낸다.
  // 여기서는 걸러내지 않는다 — Q2 의 목적이 "무엇이 오는가"를 보는 것이라
  // 잡음까지 통째로 기록해야 실제 이벤트명을 알 수 있다.
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>SnowSign 임베드 실측</title>
<style>
  body{font:14px/1.5 -apple-system,BlinkMacSystemFont,sans-serif;margin:0;padding:16px;background:#fafafa}
  h1{font-size:16px;margin:0 0 4px} p{margin:0 0 12px;color:#555}
  iframe{width:100%;height:78vh;border:1px solid #ddd;border-radius:6px;background:#fff}
  #log{font:12px ui-monospace,monospace;background:#111;color:#0f0;padding:8px;border-radius:6px;
       max-height:160px;overflow:auto;margin-top:12px;white-space:pre-wrap}
</style></head><body>
<h1>스노우싸인 임베드 실측 하네스</h1>
<p>아래 임베드에서 계약서를 한 건 실제로 발송하세요. 오는 postMessage 는 전부 터미널에 기록됩니다.</p>
<iframe id="f" src="${iframeUrl}"></iframe>
<div id="log">postMessage 대기 중…</div>
<script>
  const logEl = document.getElementById('log');
  window.addEventListener('message', (e) => {
    // 하네스는 의도적으로 오리진을 안 거른다(무엇이 오는지 보는 게 목적).
    const rec = { origin: e.origin, data: e.data };
    logEl.textContent += '\\n' + JSON.stringify(rec);
    logEl.scrollTop = logEl.scrollHeight;
    fetch('/event', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(rec) }).catch(() => {});
  });
</script>
</body></html>`;
}

async function inspectContract(contractId: string): Promise<void> {
  log('Q3 — 계약 상세 재조회', `contract_id = ${contractId}\n찾는 값: ${EXTERNAL_ID}`);
  const detail = await api('GET', `/v1/contracts/${encodeURIComponent(contractId)}`);
  findings.q3_externalIdEcho = echoesExternalId(detail) ? 'yes' : 'no';

  // 목록 응답 형태도 함께 본다 — 고아 복구 백스톱(listContracts)이 여기 의존한다.
  await api('GET', '/v1/contracts?per_page=5').catch(() => undefined);
}

function printSummary(): void {
  log('판정 요약 (docs/SNOWSIGN_SANDBOX.md 에 옮겨 적을 것)', findings);
  if (findings.q3_externalIdEcho === 'no') {
    console.log(
      '\n⚠️  external_id 가 되돌아오지 않는다 → 서버측 소유 검증을 external_id 로 할 수 없다.\n' +
        '    Phase 2 의 attachProviderContract 는 ACL + 바인딩 유일성만으로 게이트하고,\n' +
        '    Phase 4 에 고아 복구 입력 경로를 남겨야 한다.',
    );
  } else if (findings.q3_externalIdEcho === 'yes') {
    console.log(
      '\n✓ external_id 왕복 확인 → attachProviderContract 에서 소유 검증이 가능하고,\n' +
        '  고아 복구도 listContracts 자동 매칭으로 처리할 수 있다.',
    );
  }
}

async function main(): Promise<void> {
  if (!API_KEY) {
    console.log('SNOWSIGN_API_KEY 가 없어 스모크를 건너뜁니다 (정상 종료).');
    return;
  }

  log('설정', { BASE_URL, HARNESS_ORIGIN, EXTERNAL_ID });

  // ── Q1 / Q4 ────────────────────────────────────────────────────────────
  const session = (await api('POST', '/v1/embed-sessions', {
    purpose: 'contract_create',
    allowed_origins: [HARNESS_ORIGIN],
    flows: ['pdf_send'],
    external_system: 'supporter-b',
    external_id: EXTERNAL_ID,
  })) as { data?: { iframe_url?: string } } | undefined;

  const iframeUrl = session?.data?.iframe_url;
  if (typeof iframeUrl !== 'string' || iframeUrl === '') {
    findings.q1_embedSession = 'fail';
    printSummary();
    throw new Error('iframe_url 이 없다 — pdf_send 임베드가 지원되지 않을 수 있다 (Q1 실패).');
  }
  findings.q1_embedSession = 'pass';
  findings.q4_embedOrigin = new URL(iframeUrl).origin;
  log('Q4 — 임베드 오리진 (CSP frame-src 핀 값)', findings.q4_embedOrigin);

  // ── Q2 / Q3 — 브라우저에서 실제 발송을 한 건 완주시킨다 ────────────────
  let settled = false;
  const server = createServer((req, res) => {
    if (req.method === 'GET' && (req.url === '/' || req.url?.startsWith('/?'))) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(harnessPage(iframeUrl));
      return;
    }
    if (req.method === 'POST' && req.url === '/event') {
      let raw = '';
      req.on('data', (c) => {
        raw += c;
      });
      req.on('end', () => {
        res.writeHead(204).end();
        let rec: { origin?: string; data?: unknown };
        try {
          rec = JSON.parse(raw) as { origin?: string; data?: unknown };
        } catch {
          return;
        }
        log('Q2 — postMessage 수신 (원본)', rec);

        const complete = isEmbedCompletionEvent(rec.data);
        const contractId = extractContractId(rec.data);
        console.log(`   완료 이벤트로 인식: ${complete} / 추출된 contract_id: ${contractId ?? '없음'}`);

        if (complete && contractId && !settled) {
          settled = true;
          const name = (rec.data as { type?: string; event?: string })?.type
            ?? (rec.data as { event?: string })?.event
            ?? '(이름 없음)';
          findings.q2_completionEvent = name;
          void inspectContract(contractId)
            .catch((e: unknown) => log('Q3 조회 실패', String(e)))
            .finally(() => {
              printSummary();
              server.close();
              process.exit(0);
            });
        }
      });
      return;
    }
    // 수동 폴백 — postMessage 가 아예 안 올 때 계약 ID 를 직접 넣어 Q3 만 본다.
    if (req.method === 'GET' && req.url?.startsWith('/contract')) {
      const id = new URL(req.url, HARNESS_ORIGIN).searchParams.get('id') ?? '';
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`조회 중: ${id}\n터미널을 확인하세요.`);
      if (id && !settled) {
        settled = true;
        findings.q2_completionEvent = '(수동 입력 — postMessage 미수신)';
        void inspectContract(id)
          .catch((e: unknown) => log('Q3 조회 실패', String(e)))
          .finally(() => {
            printSummary();
            server.close();
            process.exit(0);
          });
      }
      return;
    }
    res.writeHead(404).end();
  });

  server.on('error', (e: NodeJS.ErrnoException) => {
    console.error(
      e.code === 'EADDRINUSE'
        ? `\n포트 ${PORT} 가 이미 사용 중이다 — 이전 하네스가 떠 있는지 확인 (SNOWSIGN_SMOKE_PORT 로 변경 가능).`
        : `\n하네스 서버 오류: ${String(e)}`,
    );
    process.exit(1);
  });

  // 루프백 바인딩 — 무인증 하네스를 LAN 에 노출하지 않는다(lvh.me = 127.0.0.1).
  server.listen(PORT, '127.0.0.1', () => {
    console.log(
      `\n${'═'.repeat(72)}\n` +
        `  브라우저로 ${HARNESS_ORIGIN} 을 열고 임베드에서 계약서를 한 건 발송하세요.\n` +
        `  postMessage 가 안 오면: ${HARNESS_ORIGIN}/contract?id=<계약ID> 로 Q3 만 확인.\n` +
        `  중단하려면 Ctrl-C.\n${'═'.repeat(72)}`,
    );
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// --template 모드 — 템플릿 경로 실측 (T1~T10)
//
// 템플릿 재도입(PR#470)이 처음 쓰는 네 엔드포인트(`/v1/uploads` purpose=
// template_document, `/v1/templates`, create-contract, send)는 실 API 로 한 번도
// 호출된 적이 없다. 특히 T2(업로드 HTTP 메서드: presigned-POST form vs raw PUT +
// 브라우저 CORS)와 T6(서명칸 좌표 원점 시각 확인)이 Wave 2 구현을 가른다.
//
// 쓰는 법:
//   SNOWSIGN_API_KEY=... \
//   SNOWSIGN_SMOKE_BUYER_EMAIL=you+buyer@example.com \
//   SNOWSIGN_SMOKE_PG_EMAIL=you+pg@example.com \
//   pnpm tsx scripts/signing/snowsign-smoke.ts --template
//   → 브라우저로 http://lvh.me:4599/template 을 열고 아무 PDF 나 선택.
//
// 이메일 env 가 없으면 T6~T9(실 발송)는 건너뛴다 — 앞 단계 판정만으로도 T2/T4/T5 는
// 확정된다. T6 테스트 계약은 확인 후 반드시 정리한다(요약이 cancel 명령을 찍어 준다).
//
// ⚠️ 업로드 세션은 **조직(API 키) 공유 동시 3개 한도**(10분 TTL, 해제 API 없음)이고
//    이 실행이 2개를 점유한다 — 실키로는 PG 들이 실제 업로드를 하지 않는 한산한
//    시간대에 돌리고, 실패 후 재시도는 TTL 이 풀리는 ~10분을 기다린 뒤에 한다.
//    T4 가 만드는 실측 템플릿은 삭제 API 가 없어 조직에 남는다(무해, id 는 요약에 출력).
// ═════════════════════════════════════════════════════════════════════════════

import { buildSignatureFieldsPayload } from '../../lib/signing/template-fields';

const BUYER_EMAIL = process.env.SNOWSIGN_SMOKE_BUYER_EMAIL;
const PG_EMAIL = process.env.SNOWSIGN_SMOKE_PG_EMAIL;

type TemplateFindings = {
  t1_fieldsShape: string;
  t2_postForm: string;
  t2_rawPut: string;
  t3_diagnostics: string;
  t4_createTemplate: string;
  t5_fieldsEcho: string;
  t5_download: string;
  t6_visualCheck: string;
  t7_sendStatus: string;
  t9_expiresAt: string;
};

const tFindings: TemplateFindings = {
  t1_fieldsShape: 'pending',
  t2_postForm: 'pending',
  t2_rawPut: 'pending',
  t3_diagnostics: 'pending',
  t4_createTemplate: 'pending',
  t5_fieldsEcho: 'pending',
  t5_download: 'pending',
  t6_visualCheck: '(수동 — 서명 메일의 문서에서 서명칸이 1페이지 "상단" 좌측에 보이면 top-left 확정)',
  t7_sendStatus: 'pending',
  t9_expiresAt: 'pending',
};

/** T4 에 넣는 실제 payload — 프로덕션과 같은 빌더를 그대로 쓴다(스키마 정합 판정). */
const T4_FIELDS = buildSignatureFieldsPayload([
  { id: 't-buyer', party: 'buyer', type: 'signature', pageNumber: 1, x: 72, y: 72, width: 180, height: 48 },
  { id: 't-pg', party: 'pg', type: 'signature', pageNumber: 1, x: 72, y: 160, width: 180, height: 48 },
]);

function printTemplateSummary(extra?: string): void {
  log('템플릿 경로 판정 요약 (docs/SNOWSIGN_SANDBOX.md "템플릿 경로 실측" 절에 옮겨 적을 것)', tFindings);
  if (extra) console.log(extra);
}

async function mainTemplate(): Promise<void> {
  if (!API_KEY) {
    console.log('SNOWSIGN_API_KEY 가 없어 스모크를 건너뜁니다 (정상 종료).');
    return;
  }
  log('설정 (--template)', {
    BASE_URL,
    HARNESS_ORIGIN,
    buyerEmail: BUYER_EMAIL ?? '(없음 — T6~T9 건너뜀)',
    pgEmail: PG_EMAIL ?? '(없음 — T6~T9 건너뜀)',
  });

  type UploadSession = { uploadId: string; uploadUrl: string; fields: Record<string, string> };
  const createUpload = async (filename: string, sizeBytes: number): Promise<UploadSession> => {
    const raw = (await api('POST', '/v1/uploads', {
      purpose: 'template_document',
      filename,
      content_type: 'application/pdf',
      size_bytes: sizeBytes,
    })) as { data?: { upload_id?: string; upload_url?: string; fields?: Record<string, string> } };
    const d = raw?.data;
    if (!d?.upload_id || !d?.upload_url) throw new Error('upload 세션 응답에 upload_id/upload_url 이 없다');
    return { uploadId: d.upload_id, uploadUrl: d.upload_url, fields: d.fields ?? {} };
  };

  /**
   * 서버측 착지 진단 — T3 판정과 "브라우저 reject 인데 실제로는 착지" 교차검증이
   * 같이 쓴다. S3 presigned POST 는 버킷 CORS 미구성 시 2xx 여도 브라우저 fetch 가
   * reject(TypeError) 로 보고하므로, reject 만 보고 실패로 단정하면 승자를 잘못
   * 고른다(Wave 2 가 틀린 전송 방식을 구현하게 된다).
   */
  const diagnose = async (uploadId: string): Promise<{ landed: boolean; raw: string }> => {
    try {
      const diag = await api('POST', `/v1/uploads/${encodeURIComponent(uploadId)}/diagnostics`);
      const raw = JSON.stringify((diag as { data?: unknown })?.data ?? diag).slice(0, 300);
      // 착지 판정: 진단 응답에 양수 page_count 류 신호가 있으면 확실, 없어도 2xx 면
      // 세션에 객체가 있다는 뜻으로 본다(형태가 다르면 raw 를 사람이 읽는다).
      return { landed: !/"page_count"\s*:\s*0\b/.test(raw), raw };
    } catch (e) {
      return { landed: false, raw: `실패: ${String(e)}` };
    }
  };

  // 업로드 이후 체인(T3~T9). 실패해도 다음 단계로 계속 — 각 단계의 실패 자체가 판정이다.
  let settled = false;
  let createdTemplateId: string | undefined;
  const runChain = async (winner: {
    method: string;
    session: UploadSession;
    note?: string;
  }): Promise<void> => {
    log('T2 승자', `${winner.method} (uploadId=${winner.session.uploadId})${winner.note ? ` — ${winner.note}` : ''}`);

    // T3 — 바이트가 실제로 착지했는지 진단으로 확인 (HTTP 200 위조 차단).
    // T3 실패 시 T4 를 건너뛰지는 않지만(에러 원문 자체가 판정 자료) 결과에
    // 주의를 달아 "스키마 불일치" 오판을 막는다 — T3 가 게이트다.
    const t3 = await diagnose(winner.session.uploadId);
    tFindings.t3_diagnostics = t3.raw;

    // T4 — 우리 실제 payload 로 템플릿 생성 (스키마 정합 판정)
    let templateId: string | undefined;
    try {
      const created = (await api('POST', '/v1/templates', {
        name: `실측-${new Date().toISOString().slice(0, 16)}`,
        document_upload_id: winner.session.uploadId,
        signers: ['구매사', 'PG사'],
        signature_fields: T4_FIELDS.map((f) => ({
          role: f.role,
          type: f.type,
          page_number: f.pageNumber,
          position_x: f.positionX,
          position_y: f.positionY,
          width: f.width,
          height: f.height,
          position_unit: 'pixel',
        })),
      })) as { data?: { template_id?: string } };
      templateId = created?.data?.template_id;
      createdTemplateId = templateId;
      // id 를 못 읽었어도 2xx 였다면 실객체가 생겼을 수 있다 — 조용히 넘기면
      // 정리 대상이 영영 안 보인다(프로덕션 클라이언트의 reqString 은 여기서 throw 한다).
      tFindings.t4_createTemplate = templateId
        ? `성공 template_id=${templateId}`
        : '⚠ 2xx 인데 template_id 를 못 읽음 — 봉투가 다르다. 위 raw 로그 확인(실객체 생성됐을 수 있음)';
    } catch (e) {
      tFindings.t4_createTemplate = `실패: ${String(e)}`;
    }
    if (!t3.landed) {
      tFindings.t4_createTemplate =
        `(주의: T3 진단 실패 — 업로드 미착지가 우선 의심, 스키마 판정으로 읽지 말 것) ` +
        tFindings.t4_createTemplate;
    }

    // T5 — 상세 에코(좌표 왕복·is_required 기본값) + 원본 다운로드
    if (templateId) {
      try {
        const detail = await api('GET', `/v1/templates/${encodeURIComponent(templateId)}`);
        tFindings.t5_fieldsEcho = JSON.stringify(
          (detail as { data?: { signature_fields?: unknown } })?.data?.signature_fields ?? '(없음)',
        ).slice(0, 500);
      } catch (e) {
        tFindings.t5_fieldsEcho = `실패: ${String(e)}`;
      }
      try {
        // 다운로드는 JSON 이 아닐 수 있어 api() 를 안 쓴다 — 상태·리다이렉트만 본다.
        const res = await fetch(`${BASE_URL}/v1/templates/${encodeURIComponent(templateId)}/download`, {
          headers: { 'X-API-Key': API_KEY as string },
          redirect: 'manual',
          signal: AbortSignal.timeout(20_000),
        });
        tFindings.t5_download = `HTTP ${res.status}${res.headers.get('location') ? ' → redirect' : ''} (content-type: ${res.headers.get('content-type') ?? '?'})`;
      } catch (e) {
        tFindings.t5_download = `실패: ${String(e)}`;
      }
    }

    // T6/T7/T9 — 실 발송 (이메일 env 있을 때만)
    if (templateId && BUYER_EMAIL && PG_EMAIL) {
      let contractId: string | undefined;
      try {
        const created = (await api('POST', `/v1/templates/${encodeURIComponent(templateId)}/create-contract`, {
          title: '실측 테스트 계약 (무시하고 취소 예정)',
          participants: [
            { role: '구매사', name: '실측구매사', email: BUYER_EMAIL },
            { role: 'PG사', name: '실측PG', email: PG_EMAIL },
          ],
        })) as { data?: { contract_id?: string; status?: string } };
        contractId = created?.data?.contract_id;
        log('T6 — create-contract 직후 status', created?.data?.status ?? '(없음)');
        if (!contractId) {
          tFindings.t7_sendStatus =
            '⚠ create-contract 2xx 인데 contract_id 를 못 읽음 — 봉투가 다르다. 위 raw 로그 확인(초안이 실제로 생겼을 수 있고, 그 경우 콘솔에서 수동 정리 필요)';
        }
      } catch (e) {
        tFindings.t7_sendStatus = `create-contract 실패: ${String(e)}`;
      }
      if (contractId) {
        try {
          const sent = (await api('POST', `/v1/contracts/${encodeURIComponent(contractId)}/send`, {})) as {
            data?: { status?: string; sent_at?: string };
          };
          tFindings.t7_sendStatus = `send 응답 status=${sent?.data?.status ?? '(없음)'} sent_at=${sent?.data?.sent_at ?? '(없음)'}`;
        } catch (e) {
          tFindings.t7_sendStatus = `send 실패: ${String(e)}`;
        }
        try {
          const detail = (await api('GET', `/v1/contracts/${encodeURIComponent(contractId)}`)) as {
            data?: { status?: string; expires_at?: string | null };
          };
          tFindings.t7_sendStatus += ` / 직후 getContract status=${detail?.data?.status ?? '(없음)'}`;
          tFindings.t9_expiresAt = String(detail?.data?.expires_at ?? 'null');
        } catch (e) {
          tFindings.t9_expiresAt = `조회 실패: ${String(e)}`;
        }
      }
      printTemplateSummary(
        '\n다음 두 가지는 사람이 마무리한다:\n' +
          `  T6(좌표 원점): ${BUYER_EMAIL} 로 온 서명 메일을 열어 서명칸이 1페이지 "상단" 좌측\n` +
          '     (72,72 부근)에 있는지 스크린샷으로 남긴다. 하단이면 y-플립이 필요하다(Wave 2).\n' +
          '  T10(웹훅): 스노우싸인 콘솔 → 웹훅 등록 여부·이벤트 목록 + 운영 env 의\n' +
          '     SNOWSIGN_WEBHOOK_SECRET 설정 여부를 확인해 기록한다.\n' +
          (contractId
            ? `\n확인이 끝나면 테스트 계약을 정리한다:\n  curl -X POST '${BASE_URL}/v1/contracts/${contractId}/cancel' -H 'X-API-Key: <키>' -H 'Content-Type: application/json' -d '{"reason":"실측 정리"}'\n`
            : '') +
          (createdTemplateId
            ? `\n생성된 실측 템플릿: ${createdTemplateId} — 스노우싸인에 템플릿 삭제 API 가 없어 조직에 남는다(무해). 콘솔에서 보이면 이 id 다.\n`
            : ''),
      );
    } else {
      printTemplateSummary(
        (BUYER_EMAIL && PG_EMAIL
          ? ''
          : '\nT6~T9 는 건너뜀 — SNOWSIGN_SMOKE_BUYER_EMAIL / SNOWSIGN_SMOKE_PG_EMAIL 을 넣고 재실행하면 실 발송까지 확인한다.') +
          '\nT10(웹훅): 스노우싸인 콘솔 → 웹훅 등록 여부·이벤트 목록 + 운영 env 의\n' +
          '   SNOWSIGN_WEBHOOK_SECRET 설정 여부를 확인해 기록한다.',
      );
    }
  };

  // 하네스 서버 — /template 페이지가 파일 크기를 알려오면 세션 2개를 만들어 돌려주고,
  // 업로드 결과 2건이 모이면 체인을 이어간다.
  let sessions: { post: UploadSession; put: UploadSession } | undefined;
  let fileBuf: Buffer | undefined;
  const results: { method: string; ok: boolean; status: number | null; body?: string; error?: string }[] = [];

  const server = createServer((req, res) => {
    if (req.method === 'GET' && req.url?.startsWith('/template')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      // 세션은 파일 선택 후에 만든다(10분 TTL·size_bytes 정확성) — 페이지는 우선
      // 셸만 받고, /t/start 응답의 세션으로 업로드를 시도한다.
      res.end(`<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>SnowSign 템플릿 실측</title></head>
<body style="font:14px -apple-system,sans-serif;padding:16px">
<h1 style="font-size:16px">스노우싸인 템플릿 업로드 실측</h1>
<p>PDF 를 선택하면 업로드 세션을 만들고 ⓐ POST-form ⓑ raw PUT 을 순서대로 시도합니다.</p>
<input id="pdf" type="file" accept="application/pdf">
<pre id="log" style="font-size:12px;background:#111;color:#0f0;padding:8px;border-radius:6px;max-height:320px;overflow:auto">대기 중…</pre>
<script>
  const logEl = document.getElementById('log');
  const say = (m) => { logEl.textContent += '\\n' + m; };
  document.getElementById('pdf').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    say('선택됨: ' + file.name + ' (' + file.size + ' bytes) — 세션 생성 중…');
    const r = await fetch('/t/start', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: file.name, sizeBytes: file.size }) });
    if (!r.ok) { say('세션 생성 실패 — 터미널 확인'); return; }
    const S = await r.json();
    const report = (rec) => fetch('/t/upload-result', { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rec) }).catch(() => {});
    async function attempt(method, run) {
      try {
        const res = await run();
        const body = (await res.text()).slice(0, 300);
        say(method + ' → HTTP ' + res.status);
        const rec = { method, ok: res.ok, status: res.status, body };
        await report(rec);
        return rec;
      } catch (err) {
        say(method + ' → reject: ' + String(err));
        const rec = { method, ok: false, status: null, error: String(err) };
        await report(rec);
        return rec;
      }
    }
    const postRec = await attempt('post-form', () => {
      const fd = new FormData();
      for (const [k, v] of Object.entries(S.post.fields)) fd.append(k, v);
      fd.append('file', file);
      return fetch(S.post.uploadUrl, { method: 'POST', body: fd });
    });
    const putRec = await attempt('raw-put', () => fetch(S.put.uploadUrl, {
      method: 'PUT', body: file, headers: { 'Content-Type': 'application/pdf' } }));
    // 둘 다 브라우저에서 실패(대개 CORS)면 파일 바이트를 하네스로 넘긴다 —
    // Node 쪽엔 CORS 가 없어 T4/T5(스키마·좌표 왕복) 측정을 살릴 수 있다.
    if (!postRec.ok && !putRec.ok) {
      say('두 시도 모두 실패 — Node 폴백용으로 파일을 하네스에 전달합니다.');
      await fetch('/t/file', { method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: file }).catch(() => {});
    }
    say('두 시도 완료 — 이후 단계는 터미널에서.');
  });
</script></body></html>`);
      return;
    }

    if (req.method === 'POST' && req.url === '/t/start') {
      let raw = '';
      req.on('data', (c) => { raw += c; });
      req.on('end', () => {
        void (async () => {
          const { filename, sizeBytes } = JSON.parse(raw) as { filename: string; sizeBytes: number };
          // T1 — 세션 2개(POST 시도용·PUT 시도용). fields 형태 자체가 1차 판정이다.
          const post = await createUpload(filename, sizeBytes);
          const put = await createUpload(filename, sizeBytes);
          tFindings.t1_fieldsShape = `fields keys = [${Object.keys(post.fields).join(', ')}]`;
          sessions = { post, put };
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            post: { uploadUrl: post.uploadUrl, fields: post.fields },
            put: { uploadUrl: put.uploadUrl },
          }));
        })().catch((e: unknown) => {
          log('T1 세션 생성 실패', String(e));
          res.writeHead(500).end();
        });
      });
      return;
    }

    // Node 폴백용 파일 바이트 — 브라우저 두 시도가 모두 실패했을 때만 페이지가 보낸다.
    if (req.method === 'POST' && req.url === '/t/file') {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => { chunks.push(c); });
      req.on('end', () => {
        fileBuf = Buffer.concat(chunks);
        res.writeHead(204).end();
        log('Node 폴백', `파일 ${fileBuf.length} bytes 수신`);
        maybeResolve();
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/t/upload-result') {
      let raw = '';
      req.on('data', (c) => { raw += c; });
      req.on('end', () => {
        res.writeHead(204).end();
        let rec: (typeof results)[number];
        try {
          rec = JSON.parse(raw) as (typeof results)[number];
        } catch {
          return; // 깨진 body 로 하네스가 죽으면 안 된다 (/event 핸들러와 같은 가드)
        }
        log(`T2 — ${rec.method}`, rec);
        results.push(rec);
        if (rec.method === 'post-form') {
          tFindings.t2_postForm = rec.error ? `reject(CORS?): ${rec.error}` : `HTTP ${rec.status}`;
        }
        if (rec.method === 'raw-put') {
          tFindings.t2_rawPut = rec.error ? `reject(CORS?): ${rec.error}` : `HTTP ${rec.status}`;
        }
        maybeResolve();
      });
      return;
    }

    res.writeHead(404).end();
  });

  /**
   * 승자 판정 — 브라우저 보고만으로 단정하지 않는다.
   * reject(상태 코드 없음)는 CORS 응답 헤더 부재일 뿐 바이트는 착지했을 수 있어
   * (S3 presigned POST 의 전형), 서버측 진단으로 교차검증한 뒤에야 승자를 정한다.
   * 둘 다 진짜 실패면 페이지가 넘겨준 바이트로 Node 폴백 업로드를 시도해
   * T4/T5(스키마·좌표 왕복) 측정만은 살린다 — 그 경우 T2 의 결론은
   * "브라우저 직접 업로드는 CORS 로 불가(Wave 2 블로커)"로 기록된다.
   */
  function maybeResolve(): void {
    const post = results.find((x) => x.method === 'post-form');
    const put = results.find((x) => x.method === 'raw-put');
    if (!(post && put && sessions) || settled) return;
    // 둘 다 reject 면 파일 바이트가 도착할 때까지 잠깐 더 기다린다(페이지가 이어서 보낸다).
    const bothRejected = !post.ok && post.status === null && !put.ok && put.status === null;
    if (bothRejected && !fileBuf) return;
    settled = true;
    const s = sessions;
    void (async () => {
      let winner: { method: string; session: UploadSession; note?: string } | undefined;
      if (post.ok) {
        winner = { method: 'post-form', session: s.post };
      } else if (post.status === null && (await diagnose(s.post.uploadId)).landed) {
        // 착지했는데 브라우저는 reject — CORS 응답 헤더 부재. 전송 방식 판정은 POST 승.
        tFindings.t2_postForm += ' → 서버 진단상 바이트 착지 (CORS 응답 헤더만 부재)';
        winner = { method: 'post-form', session: s.post, note: 'CORS 미구성 — 전송은 성공' };
      } else if (put.ok) {
        winner = { method: 'raw-put', session: s.put };
      } else if (put.status === null && (await diagnose(s.put.uploadId)).landed) {
        tFindings.t2_rawPut += ' → 서버 진단상 바이트 착지 (CORS 응답 헤더만 부재)';
        winner = { method: 'raw-put', session: s.put, note: 'CORS 미구성 — 전송은 성공' };
      } else if (fileBuf) {
        // Node 폴백 — CORS 없는 환경에서 같은 세션에 재시도(post-form 우선, 실패 시 PUT).
        try {
          const fd = new FormData();
          for (const [k, v] of Object.entries(s.post.fields)) fd.append(k, v);
          fd.append('file', new Blob([new Uint8Array(fileBuf)], { type: 'application/pdf' }));
          const r1 = await fetch(s.post.uploadUrl, { method: 'POST', body: fd, signal: AbortSignal.timeout(60_000) });
          log('Node 폴백 post-form', `HTTP ${r1.status}`);
          if (r1.ok) winner = { method: 'post-form', session: s.post, note: 'Node 폴백 — 브라우저는 CORS 로 불가(Wave 2 블로커로 기록)' };
        } catch (e) {
          log('Node 폴백 post-form 실패', String(e));
        }
        if (!winner) {
          try {
            const r2 = await fetch(s.put.uploadUrl, {
              method: 'PUT',
              body: new Uint8Array(fileBuf),
              headers: { 'Content-Type': 'application/pdf' },
              signal: AbortSignal.timeout(60_000),
            });
            log('Node 폴백 raw-put', `HTTP ${r2.status}`);
            if (r2.ok) winner = { method: 'raw-put', session: s.put, note: 'Node 폴백 — 브라우저는 CORS 로 불가(Wave 2 블로커로 기록)' };
          } catch (e) {
            log('Node 폴백 raw-put 실패', String(e));
          }
        }
      }
      if (!winner) {
        printTemplateSummary('\n두 방식 모두 실패(Node 폴백 포함) — 위 원본 기록을 그대로 보고할 것.');
        server.close();
        process.exit(1);
      }
      await runChain(winner).catch((e: unknown) => log('체인 실패', String(e)));
      server.close();
      process.exit(0);
    })();
  }

  // 워치독 — 보고 유실·조작 없음 등으로 영영 안 끝나는 상태를 막는다. 침묵은 성공이 아니다.
  const watchdog = setTimeout(() => {
    log('워치독', '20분 안에 완주하지 못했다 — 지금까지의 판정만 출력하고 종료한다.');
    printTemplateSummary();
    process.exit(1);
  }, 20 * 60_000);
  watchdog.unref?.();

  server.on('error', (e: NodeJS.ErrnoException) => {
    console.error(
      e.code === 'EADDRINUSE'
        ? `\n포트 ${PORT} 가 이미 사용 중이다 — 이전 하네스가 떠 있는지 확인 (SNOWSIGN_SMOKE_PORT 로 변경 가능).`
        : `\n하네스 서버 오류: ${String(e)}`,
    );
    process.exit(1);
  });

  // 루프백에만 바인딩 — 이 서버는 무인증이고 /t/start 가 실키로 만든 presigned URL 을
  // 돌려주므로 LAN 노출은 곧 남의 손에 업로드 슬롯·스토리지 쓰기를 쥐여주는 것이다.
  // lvh.me 는 127.0.0.1 로 풀리므로 접근성은 그대로다.
  server.listen(PORT, '127.0.0.1', () => {
    console.log(
      `\n${'═'.repeat(72)}\n` +
        `  브라우저로 ${HARNESS_ORIGIN}/template 을 열고 아무 PDF 를 선택하세요.\n` +
        `  (T2 는 브라우저 컨텍스트에서만 판정됩니다 — CORS)\n` +
        `  ⚠️ 업로드 세션은 조직(키) 공유 동시 3개 한도 — 실키로는 한산한 시간대에,\n` +
        `     실패 후 재시도는 10분(TTL) 기다린 뒤에. 이 실행이 2개를 점유합니다.\n` +
        `  중단하려면 Ctrl-C.\n${'═'.repeat(72)}`,
    );
  });
}

const entry = process.argv.includes('--template') ? mainTemplate : main;
entry().catch((e: unknown) => {
  console.error(`\n스모크 실패: ${String(e)}`);
  process.exit(1);
});
