import * as React from 'react';
import { render } from '@react-email/render';

import { Button, Layout, Mono } from './_layout';
import type { ContractSignedProps } from './types';

export function ContractSigned({
  code,
  title,
  signerName,
  ctaUrl,
}: ContractSignedProps): React.JSX.Element {
  return (
    <Layout
      preheader={`${signerName}님이 서명했어요.`}
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
        서명 완료 알림
      </h1>
      <p style={{ margin: '0 0 16px', fontSize: '14px' }}>
        <strong>{signerName}</strong>님이 서명했어요. 남은 서명이 끝나면 계약이 완료돼요.
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

export async function renderContractSigned(props: ContractSignedProps): Promise<string> {
  return render(<ContractSigned {...props} />);
}
