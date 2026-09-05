import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('settings profile query wiring', () => {
  it('서로 독립적인 프로필 조회를 한 Promise.all 경계에서 병렬 실행한다', () => {
    const source = readFileSync(resolve(__dirname, '../page.tsx'), 'utf8').replace(/\s+/g, ' ');

    expect(source).toMatch(
      /const \[me, ws, latestNameChangeRequest, myContact\] = await Promise\.all\(\[ userRepo\.findById\(session\.user\.id\), wsRepo\.findById\(session\.user\.workspaceId\), wsRepo\.findLatestNameChangeRequest\(session\.user\.workspaceId\), userRepo\.findContactById\(session\.user\.id\), \]\);/,
    );
  });

  it('대기 요청 폼에는 실제로 표시하는 요청 이름만 전달한다', () => {
    const pageSource = readFileSync(resolve(__dirname, '../page.tsx'), 'utf8');
    const formSource = readFileSync(
      resolve(__dirname, '../../../../../components/settings/WorkspaceNameForm.tsx'),
      'utf8',
    );

    expect(pageSource).not.toContain('submittedAt: latestNameChangeRequest.submittedAt');
    expect(formSource).not.toMatch(/pendingRequest:\s*\{[^}]*submittedAt:/);
  });
});
