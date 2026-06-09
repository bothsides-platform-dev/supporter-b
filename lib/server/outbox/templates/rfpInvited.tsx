import * as React from 'react';
import { render } from '@react-email/render';
import { josa } from 'es-hangul';

import { Button, Layout, Mono } from './_layout';
import type { RfpInvitedProps } from './types';

export function RfpInvited({
  rfpId,
  rfpTitle,
  buyerName,
  deadline,
  inviteUrl,
}: RfpInvitedProps): React.JSX.Element {
  const buyerWithParticle = josa(buyerName, '이/가');
  const buyerParticle = buyerWithParticle.slice(buyerName.length);
  return (
    <Layout
      preheader={`${buyerWithParticle} ${rfpId} 견적을 요청했어요.`}
      serial={`견적 요청 / ${rfpId}`}
    >
      <h1
        style={{
          fontSize: '20px',
          fontWeight: 600,
          margin: '0 0 16px',
          letterSpacing: '-0.01em',
        }}
      >
        견적 요청이 도착했어요
      </h1>
      <p style={{ margin: '0 0 16px', fontSize: '14px' }}>
        <strong>{buyerName}</strong>{buyerParticle} 견적 요청을 보냈어요.
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
              번호
            </td>
            <td style={{ paddingBottom: '6px' }}>
              <Mono>{rfpId}</Mono>
            </td>
          </tr>
          <tr>
            <td style={{ color: '#777', paddingRight: '16px', paddingBottom: '6px' }}>
              제목
            </td>
            <td style={{ paddingBottom: '6px' }}>{rfpTitle}</td>
          </tr>
          <tr>
            <td style={{ color: '#777', paddingRight: '16px' }}>마감</td>
            <td>
              <Mono>{deadline}</Mono>
            </td>
          </tr>
        </tbody>
      </table>

      <Button href={inviteUrl}>초대 수락하기</Button>

      <p style={{ marginTop: '24px', fontSize: '12px', color: '#666' }}>
        버튼이 동작하지 않으면 다음 주소를 복사해 주세요.
        <br />
        <Mono>{inviteUrl}</Mono>
      </p>
    </Layout>
  );
}

export async function renderRfpInvited(props: RfpInvitedProps): Promise<string> {
  return render(<RfpInvited {...props} />);
}
