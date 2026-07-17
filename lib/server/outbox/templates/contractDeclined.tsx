import * as React from 'react';
import { render } from '@react-email/render';

import { Button, HAIRLINE, Layout, Mono } from './_layout';
import type { ContractDeclinedProps } from './types';

export function ContractDeclined({
  code,
  title,
  reason,
  ctaUrl,
}: ContractDeclinedProps): React.JSX.Element {
  return (
    <Layout
      preheader="구매사가 계약서를 반려했어요."
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
        계약서 반려 안내
      </h1>
      <p style={{ margin: '0 0 16px', fontSize: '14px' }}>
        구매사가 계약서를 반려했어요.
      </p>

      <table
        role="presentation"
        cellPadding={0}
        cellSpacing={0}
        style={{ margin: '0 0 20px', fontSize: '13px' }}
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

      <Button href={ctaUrl}>계약서 확인하기</Button>

      <p style={{ marginTop: '24px', fontSize: '12px', color: '#666' }}>
        버튼이 동작하지 않으면 다음 주소를 복사해 주세요.
        <br />
        <Mono>{ctaUrl}</Mono>
      </p>
    </Layout>
  );
}

export async function renderContractDeclined(
  props: ContractDeclinedProps,
): Promise<string> {
  return render(<ContractDeclined {...props} />);
}
