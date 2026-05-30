import * as React from 'react';
import { render } from '@react-email/render';

import { Button, Layout, Mono } from './_layout';
import type { WorkspaceApprovedProps } from './types';

export function WorkspaceApproved({
  workspaceName,
  orgLabel,
  loginUrl,
}: WorkspaceApprovedProps): React.JSX.Element {
  return (
    <Layout
      preheader={`${orgLabel} '${workspaceName}'의 가입이 승인되었습니다.`}
      serial="WORKSPACE / APPROVED"
    >
      <h1
        style={{
          fontSize: '20px',
          fontWeight: 600,
          margin: '0 0 16px',
          letterSpacing: '-0.01em',
        }}
      >
        가입 승인 완료
      </h1>
      <p style={{ margin: '0 0 8px', fontSize: '14px' }}>
        <strong>
          <Mono>{workspaceName}</Mono>
        </strong>{' '}
        ({orgLabel})의 가입이 승인되었습니다.
      </p>
      <p style={{ margin: '0 0 24px', fontSize: '14px' }}>
        지금 바로 로그인해 서비스를 시작하세요.
      </p>

      <Button href={loginUrl}>로그인하고 시작하기</Button>

      <p style={{ marginTop: '24px', fontSize: '12px', color: '#666' }}>
        버튼이 동작하지 않으면 다음 주소를 복사해 주세요.
        <br />
        <Mono>{loginUrl}</Mono>
      </p>
    </Layout>
  );
}

export async function renderWorkspaceApproved(
  props: WorkspaceApprovedProps,
): Promise<string> {
  return render(<WorkspaceApproved {...props} />);
}
