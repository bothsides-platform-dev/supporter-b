import { createHash } from 'node:crypto';
import { z } from 'zod';
import { answerContact } from '@/lib/server/services/consultation-contact';

// The fragment never goes to the web server on GET. This standalone form loads no
// analytics, mail preview scripts or third-party resources that could read the proof.
const script = `const token=location.hash.slice(1);
if (/^[A-Za-z0-9_-]{43}$/.test(token)) {
  document.forms[0].elements.token.value=token;
  document.querySelector('fieldset').disabled=false;
} else { document.querySelector('#status').innerText='안내 메일에서 확인 링크를 다시 열어주세요.'; }`;
const digest = createHash('sha256').update(script).digest('base64');
function page(body: string, status = 200) {
  const html =
    '<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>첫 연락 확인 · 서포트비</title>' +
    '<style>body{font:1rem/1.6 system-ui,sans-serif;margin:12vh auto;padding:1.25rem;max-width:28rem;color:#17202a}h1{font-size:1.6rem}fieldset{border:0;margin:1.5rem 0;padding:0;display:flex;gap:.75rem}button{font:inherit;border:1px solid #34564a;border-radius:.5rem;padding:.6rem 1rem;background:white}button:first-of-type{background:#234e3f;color:white}button:disabled{opacity:.5}</style><main>' +
    body +
    '</main></html>';
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex, nofollow',
      'Content-Security-Policy':
        "default-src 'none'; script-src 'sha256-" +
        digest +
        "'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    },
  });
}
type Context = { params: Promise<{ id: string }> };
const closed = () =>
  page('<h1>이 확인 요청은 종료됐어요.</h1><p>최신 안내 메일을 확인해주세요.</p>', 410);
export async function GET(_request: Request, { params }: Context) {
  if (!z.uuid().safeParse((await params).id).success) return closed();
  return page(
    '<h1>PG사에서 연락 받으셨나요?</h1><p id="status">요청하신 상담의 첫 연락을 확인해요.</p><form method="post"><input type="hidden" name="token"><fieldset disabled><button type="submit" name="answer" value="received">받았어요</button><button type="submit" name="answer" value="missed">못 받았어요</button></fieldset></form><noscript>답변하려면 자바스크립트를 켜주세요.</noscript><script>' +
      script +
      '</script>',
  );
}
export async function POST(request: Request, { params }: Context) {
  const { id } = await params;
  if (
    !z.uuid().safeParse(id).success ||
    !request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')
  )
    return closed();
  const body = new URLSearchParams(await request.text());
  const token = body.get('token'),
    answer = body.get('answer');
  if (!token || !/^[\w-]{43}$/.test(token) || (answer !== 'received' && answer !== 'missed'))
    return closed();
  const result = await answerContact(id, answer === 'received', { token });
  return result.ok ? page('<h1>답변을 기록했어요.</h1><p>이 창을 닫아도 돼요.</p>') : closed();
}
