import * as React from 'react';
import { render } from '@react-email/render';
import { Button, Layout, Mono } from './_layout';

export interface AdminMembershipReviewProps {
  userName: string;
  workspaceName: string;
  reviewUrl: string;
}

export function AdminMembershipReview({
  userName,
  workspaceName,
  reviewUrl,
}: AdminMembershipReviewProps): React.JSX.Element {
  return (
    <Layout
      preheader={`PG사 계정 합류 심사 요청 — ${userName} (${workspaceName})`}
      serial="ADMIN / MEMBERSHIP REVIEW"
    >
      <h1
        style={{
          fontSize: '20px',
          fontWeight: 600,
          margin: '0 0 16px',
          letterSpacing: '-0.01em',
        }}
      >
        PG사 계정 합류 심사 요청
      </h1>
      <p style={{ margin: '0 0 8px', fontSize: '14px' }}>
        <strong>
          <Mono>{workspaceName}</Mono>
        </strong>
        의 새 담당자{' '}
        <strong>
          <Mono>{userName}</Mono>
        </strong>
        이(가) 계정을 생성해 심사를 기다리고 있습니다.
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

export async function renderAdminMembershipReview(
  props: AdminMembershipReviewProps,
): Promise<string> {
  return render(<AdminMembershipReview {...props} />);
}
