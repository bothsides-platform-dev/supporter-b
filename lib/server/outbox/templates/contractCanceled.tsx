import * as React from 'react';
import { render } from '@react-email/render';
import { josa } from 'es-hangul';

import { Button, Layout, Mono } from './_layout';
import type { ContractCanceledProps } from './types';

export function ContractCanceled({
  code,
  title,
  pgWorkspaceName,
  ctaUrl,
}: ContractCanceledProps): React.JSX.Element {
  const pgWithParticle = josa(pgWorkspaceName, '이/가');
  const pgParticle = pgWithParticle.slice(pgWorkspaceName.length);
  return (
    <Layout
      preheader={`${pgWithParticle} 보낸 계약서를 회수했어요.`}
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
        계약서 회수 안내
      </h1>
      <p style={{ margin: '0 0 16px', fontSize: '14px' }}>
        <strong>{pgWorkspaceName}</strong>
        {pgParticle} 보낸 계약서를 회수했어요. 이 계약서는 더 이상 서명할 수 없어요.
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

export async function renderContractCanceled(
  props: ContractCanceledProps,
): Promise<string> {
  return render(<ContractCanceled {...props} />);
}
