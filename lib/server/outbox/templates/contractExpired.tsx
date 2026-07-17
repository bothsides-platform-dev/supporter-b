import * as React from 'react';
import { render } from '@react-email/render';

import { Button, Layout, Mono } from './_layout';
import type { ContractExpiredProps } from './types';

export function ContractExpired({
  code,
  title,
  ctaUrl,
}: ContractExpiredProps): React.JSX.Element {
  return (
    <Layout
      preheader="서명 기한이 지나 계약서가 만료됐어요."
      serial={`전자계약 / ${code}`}
    >
      <h1
        style={{
          fontSize: '20px',
          fontWeight: 600,
          margin: '0 0 16px',
          letterSpacing: '-0.01em',
        }}
      >
        계약서 기한 만료 안내
      </h1>
      <p style={{ margin: '0 0 16px', fontSize: '14px' }}>
        서명 기한이 지나 계약서가 만료됐어요. 필요하면 계약서를 다시 보낼 수 있어요.
      </p>

      <table
        role="presentation"
        cellPadding={0}
        cellSpacing={0}
        style={{ margin: '0 0 24px', fontSize: '13px' }}
      >
        <tbody>
          <tr>
            <td style={{ color: '#777', paddingRight: '16px', paddingBottom: '6px' }}>
              문서번호
            </td>
            <td style={{ paddingBottom: '6px' }}>
              <Mono>{code}</Mono>
            </td>
          </tr>
          <tr>
            <td style={{ color: '#777', paddingRight: '16px' }}>제목</td>
            <td>{title}</td>
          </tr>
        </tbody>
      </table>

      <Button href={ctaUrl}>계약서 확인하기</Button>

      <p style={{ marginTop: '24px', fontSize: '12px', color: '#666' }}>
        버튼이 동작하지 않으면 다음 주소를 복사해 주세요.
        <br />
        <Mono>{ctaUrl}</Mono>
      </p>
    </Layout>
  );
}

export async function renderContractExpired(props: ContractExpiredProps): Promise<string> {
  return render(<ContractExpired {...props} />);
}
