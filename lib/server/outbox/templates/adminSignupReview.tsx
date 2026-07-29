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
  bizUnverified,
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

      {bizUnverified && (
        // 사용자 화면에는 어떤 오류도 노출되지 않으므로, 승인 심사자가 이 사실을
        // 아는 경로는 이 블록과 risk flag 뿐이다.
        <div
          style={{
            margin: '0 0 24px',
            padding: '12px 14px',
            border: '1px solid #E5A100',
            background: '#FFF8E6',
            fontSize: '13px',
            lineHeight: 1.6,
          }}
        >
          <strong>⚠ 사업자번호 자동 검증을 하지 못했습니다.</strong>
          <br />
          국세청 조회가 장애였거나, 조회 결과가 정상 사업자로 확인되지 않은 건입니다.
          검증을 건너뛰고 가입은 진행시켰으니, 사업자 등록번호가 실제로 유효한지{' '}
          <strong>승인 전에 직접 확인</strong>해 주세요.
        </div>
      )}

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
