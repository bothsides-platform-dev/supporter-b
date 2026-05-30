import * as React from 'react';
import { render } from '@react-email/render';

import { Button, Layout, Mono } from './_layout';
import type { AuthVerifyProps } from './types';

export function AuthVerify({
  verifyUrl,
  expiresMinutes,
  emailCode,
}: AuthVerifyProps): React.JSX.Element {
  return (
    <Layout preheader="이메일 인증을 완료해 주세요." serial="EMAIL / VERIFY">
      <h1
        style={{
          fontSize: '20px',
          fontWeight: 600,
          margin: '0 0 16px',
          letterSpacing: '-0.01em',
        }}
      >
        이메일 인증을 완료해 주세요
      </h1>
      <p style={{ margin: '0 0 24px', fontSize: '14px' }}>
        아래 버튼을 눌러 이메일 인증을 완료하면 가입을 이어서 진행할 수 있습니다.
        링크는{' '}
        <Mono>{expiresMinutes}</Mono>분 동안 유효합니다.
      </p>

      <Button href={verifyUrl}>인증하기</Button>

      {emailCode && (
        <>
          <p style={{ margin: '24px 0 8px', fontSize: '13px', color: '#555' }}>
            버튼을 클릭하기 어려운 경우, 아래 6자리 코드를 입력하세요.
          </p>
          <p
            style={{
              margin: '0 0 0',
              fontSize: '28px',
              fontWeight: 700,
              fontFamily: 'monospace',
              letterSpacing: '8px',
              color: '#08090A',
            }}
          >
            {emailCode}
          </p>
        </>
      )}

      <p style={{ marginTop: '24px', fontSize: '12px', color: '#666' }}>
        버튼이 동작하지 않으면 다음 주소를 복사해 주세요.
        <br />
        <Mono>{verifyUrl}</Mono>
      </p>
    </Layout>
  );
}

export async function renderAuthVerify(props: AuthVerifyProps): Promise<string> {
  return render(<AuthVerify {...props} />);
}
