import * as React from 'react';
import { render } from '@react-email/render';

import { Button, Layout, Mono } from './_layout';
import type { AdminSignupReviewProps } from './types';

// 운영자(admin)에게 보내는 신규 입점 심사 요청 알림. 새 워크스페이스가 pending
// 상태로 생성되면(가입 또는 인앱 워크스페이스 생성) 운영자 메일로 발송된다.
export function AdminSignupReview({
  workspaceName,
  orgLabel,
  reviewUrl,
}: AdminSignupReviewProps): React.JSX.Element {
  return (
    <Layout
      preheader={`새 입점 심사 요청 — ${workspaceName}`}
      serial="ADMIN / SIGNUP REVIEW"
    >
      <h1
        style={{
          fontSize: '20px',
          fontWeight: 600,
          margin: '0 0 16px',
          letterSpacing: '-0.01em',
        }}
      >
        새 입점 심사 요청
      </h1>
      <p style={{ margin: '0 0 8px', fontSize: '14px' }}>
        새 워크스페이스{' '}
        <strong>
          <Mono>{workspaceName}</Mono>
        </strong>{' '}
        ({orgLabel})이(가) 가입해 심사를 기다리고 있습니다.
      </p>
      <p style={{ margin: '0 0 24px', fontSize: '14px' }}>
        아래 버튼을 눌러 심사 상세를 확인하세요.
      </p>

      <Button href={reviewUrl}>심사하러 가기</Button>

      <p style={{ marginTop: '24px', fontSize: '12px', color: '#666' }}>
        버튼이 동작하지 않으면 다음 주소를 복사해 주세요.
        <br />
        <Mono>{reviewUrl}</Mono>
      </p>
    </Layout>
  );
}

export async function renderAdminSignupReview(
  props: AdminSignupReviewProps,
): Promise<string> {
  return render(<AdminSignupReview {...props} />);
}
