import * as React from 'react';
import { render } from '@react-email/render';
import { josa } from 'es-hangul';

import { Button, Layout, Mono } from './_layout';
import type { ContractSentProps } from './types';

export function ContractSent({
  code,
  title,
  pgWorkspaceName,
  expiresAtLabel,
  ctaUrl,
}: ContractSentProps): React.JSX.Element {
  const pgWithParticle = josa(pgWorkspaceName, '이/가');
  const pgParticle = pgWithParticle.slice(pgWorkspaceName.length);
  return (
    <Layout
      preheader={`${pgWithParticle} 전자계약서를 보냈어요.`}
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
        전자계약서가 도착했어요
      </h1>
      <p style={{ margin: '0 0 16px', fontSize: '14px' }}>
        <strong>{pgWorkspaceName}</strong>
        {pgParticle} 전자계약서를 보냈어요. 내용을 확인하고 서명해 주세요.
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
            <td style={{ color: '#777', paddingRight: '16px', paddingBottom: '6px' }}>
              제목
            </td>
            <td style={{ paddingBottom: '6px' }}>{title}</td>
          </tr>
          <tr>
            <td style={{ color: '#777', paddingRight: '16px' }}>서명 기한</td>
            <td>
              <Mono>{expiresAtLabel}</Mono>
            </td>
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

export async function renderContractSent(props: ContractSentProps): Promise<string> {
  return render(<ContractSent {...props} />);
}
