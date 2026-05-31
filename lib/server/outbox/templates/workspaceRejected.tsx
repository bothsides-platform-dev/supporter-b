import * as React from 'react';
import { render } from '@react-email/render';

import { Button, Layout, Mono, HAIRLINE } from './_layout';
import type { WorkspaceRejectedProps } from './types';

export function WorkspaceRejected({
  workspaceName,
  orgLabel,
  reason,
  reapplyUrl,
}: WorkspaceRejectedProps): React.JSX.Element {
  return (
    <Layout
      preheader={`${orgLabel} '${workspaceName}'의 가입 심사 결과, 보완이 필요합니다.`}
      serial="WORKSPACE / REVIEW"
    >
      <h1
        style={{
          fontSize: '20px',
          fontWeight: 600,
          margin: '0 0 16px',
          letterSpacing: '-0.01em',
        }}
      >
        가입 심사 결과 안내
      </h1>
      <p style={{ margin: '0 0 8px', fontSize: '14px' }}>
        <strong>
          <Mono>{workspaceName}</Mono>
        </strong>{' '}
        ({orgLabel})의 가입 심사 결과 보완이 필요합니다.
      </p>
      <p style={{ margin: '0 0 24px', fontSize: '14px' }}>
        아래 사유를 확인한 후 보완하여 재신청해 주세요.
      </p>

      <div style={{ margin: '0 0 24px' }}>
        {HAIRLINE}
        <p
          style={{
            margin: '12px 0',
            fontSize: '13px',
            color: '#444',
            whiteSpace: 'pre-wrap',
          }}
        >
          {reason}
        </p>
        {HAIRLINE}
      </div>

      <Button href={reapplyUrl}>재신청하기</Button>

      <p style={{ marginTop: '24px', fontSize: '12px', color: '#666' }}>
        버튼이 동작하지 않으면 다음 주소를 복사해 주세요.
        <br />
        <Mono>{reapplyUrl}</Mono>
      </p>
    </Layout>
  );
}

export async function renderWorkspaceRejected(
  props: WorkspaceRejectedProps,
): Promise<string> {
  return render(<WorkspaceRejected {...props} />);
}
