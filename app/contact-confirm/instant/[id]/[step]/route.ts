import { createHash } from 'node:crypto';
import { readBoundedBody } from '@/lib/server/http/bounded-body';
import { z } from 'zod';
import { MERCHANT_TIERS, MERCHANT_TIER_LABELS } from '@/lib/types/bid';
import { pgReply } from '@/lib/server/services/instant-quote-mail';
const steps = z.enum(['receipt', 'application', 'result']);
const paramsSchema = z.object({ id: z.uuid(), step: steps });
type Context = { params: Promise<{ id: string; step: string }> };
const script =
  "const t=location.hash.slice(1);if(/^[A-Za-z0-9_-]{43}$/.test(t)){document.forms[0].elements.token.value=t;document.querySelector('fieldset').disabled=false;history.replaceState(null,'',location.pathname)}";
const hash = createHash('sha256').update(script).digest('base64');
function page(body: string, status = 200) {
  return new Response(
    '<!DOCTYPE html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PG 가입 확인 · 서포트비</title><style>body{font:1rem/1.6 system-ui;margin:10vh auto;padding:1.25rem;max-width:32rem}fieldset{border:0;padding:0}label,button{display:block;margin:.75rem 0}input,select,button{font:inherit;padding:.4rem}</style><main>' +
      body +
      '</main></html>',
    {
      status,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
        'X-Robots-Tag': 'noindex, nofollow',
        'Content-Security-Policy':
          "default-src 'none'; script-src 'sha256-" +
          hash +
          "'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      },
    },
  );
}
const closed = () =>
  page(
    '<h1>회신할 수 없어요</h1><p>입력한 값, 처리 순서, 메일의 확인 기한을 확인해주세요.</p>',
    410,
  );
export async function GET(_request: Request, context: Context) {
  const data = paramsSchema.safeParse(await context.params);
  if (!data.success) return closed();
  const step = data.data.step;
  const fields =
    step === 'application'
      ? '<label>외부 신청의 견적번호<input name="code" required></label><label>사업자등록번호<input name="bizNo" required></label>'
      : step === 'result'
        ? '<label>심사 결과<select name="decision" required><option value="">선택해주세요</option><option value="approved">가입 승인</option><option value="declined">거절</option></select></label><label>승인한 가맹점 등급<select name="tier"><option value="">선택해주세요</option>' +
          MERCHANT_TIERS.map(
            (t) =>
              '<option value="' +
              t +
              '">' +
              MERCHANT_TIER_LABELS[t] +
              '</option>',
          ).join('') +
          '</select></label>'
        : '';
  return page(
    '<h1>' +
      {
        receipt: '가입 안내 메일을 받으셨나요?',
        application: 'PG 사이트의 접수를 확인해요',
        result: '가입 심사 결과를 알려주세요',
      }[step] +
      '</h1><form method="post"><input type="hidden" name="token"><fieldset disabled>' +
      fields +
      '<button type="submit">' +
      (step === 'receipt' ? '받았어요' : '회신하기') +
      '</button></fieldset></form><script>' +
      script +
      '</script>',
  );
}
export async function POST(req: Request, context: Context) {
  const data = paramsSchema.safeParse(await context.params);
  if (
    !data.success ||
    !req.headers
      .get('content-type')
      ?.startsWith('application/x-www-form-urlencoded')
  )
    return closed();
  const body = await readBoundedBody(req, 2048);
  if (typeof body !== 'string')
    return page('<h1>회신을 다시 제출해주세요</h1>', body);
  const form = new URLSearchParams(body);
  const ok = await pgReply(
    data.data.id,
    data.data.step,
    form.get('token') ?? '',
    Object.fromEntries(form),
  );
  return ok
    ? page('<h1>회신을 기록했어요</h1><p>이 창을 닫으셔도 돼요.</p>')
    : closed();
}
