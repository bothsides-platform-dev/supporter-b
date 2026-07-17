import * as React from 'react';
import { render } from '@react-email/render';

import { Button, Layout, Mono } from './_layout';
import type { ContractSignerReassignedProps } from './types';

export function ContractSignerReassigned({
  code,
  title,
  ctaUrl,
}: ContractSignerReassignedProps): React.JSX.Element {
  return (
    <Layout
      preheader="회원님이 이 계약의 서명자로 지정됐어요."
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
        서명자 지정 안내
      </h1>
      <p style={{ margin: '0 0 16px', fontSize: '14px' }}>
        회원님이 이 계약의 서명자로 지정됐어요. 내용을 확인하고 서명해 주세요.
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

export async function renderContractSignerReassigned(
  props: ContractSignerReassignedProps,
): Promise<string> {
  return render(<ContractSignerReassigned {...props} />);
}
