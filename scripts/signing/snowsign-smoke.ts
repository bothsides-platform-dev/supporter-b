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

  server.listen(PORT, () => {
    console.log(
      `\n${'═'.repeat(72)}\n` +
        `  브라우저로 ${HARNESS_ORIGIN} 을 열고 임베드에서 계약서를 한 건 발송하세요.\n` +
        `  postMessage 가 안 오면: ${HARNESS_ORIGIN}/contract?id=<계약ID> 로 Q3 만 확인.\n` +
        `  중단하려면 Ctrl-C.\n${'═'.repeat(72)}`,
    );
  });
}

main().catch((e: unknown) => {
  console.error(`\n스모크 실패: ${String(e)}`);
  process.exit(1);
});
