/**
 * scripts/extract-action-ids.mjs
 * pnpm build 후 실행 — .next/server/ 청크에서 Server Action 해시를 추출해
 * tests/perf/action-ids.json 으로 출력한다.
 *
 * 실행: node scripts/extract-action-ids.mjs
 * 출력: tests/perf/action-ids.json
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { globSync } from 'glob';

// 추출 대상 — { k6 키: Next.js 함수명 }
const TARGET = {
  createRfp:    'createRfpAction',
  submitBid:    'submitBidAction',
  sendMessage:  'sendChatMessageAction',
  awardRfp:     'awardRfpAction',
  withdrawBid:  'withdrawBidAction',
};

const chunks = globSync('.next/server/**/*.js', { absolute: true });
const found  = {};

for (const file of chunks) {
  const src = readFileSync(file, 'utf-8');
  for (const [key, fnName] of Object.entries(TARGET)) {
    if (found[key]) continue;
    // Next.js는 "ACTION_ID":"<hash>" 형태로 action ID를 번들에 삽입한다
    const re = new RegExp(`"ACTION_ID":"([a-f0-9]+)"[\\s\\S]{0,300}${fnName}|${fnName}[\\s\\S]{0,300}"ACTION_ID":"([a-f0-9]+)"`, 'g');
    let m;
    while ((m = re.exec(src)) !== null) {
      const id = m[1] ?? m[2];
      if (id) { found[key] = id; break; }
    }
  }
}

const missing = Object.keys(TARGET).filter((k) => !found[k]);
if (missing.length) {
  console.warn('[extract-action-ids] 추출 실패 (빌드 재시도 필요):', missing);
}

mkdirSync('tests/perf', { recursive: true });
writeFileSync('tests/perf/action-ids.json', JSON.stringify(found, null, 2));
console.log('[extract-action-ids] 완료:', found);
