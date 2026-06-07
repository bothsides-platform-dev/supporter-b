import * as React from 'react';
import { render } from '@react-email/render';

import { Layout, Mono } from './_layout';
import type { RfpSentProps } from './types';

export function RfpSent({
  rfpId,
  rfpTitle,
  inviteCount,
}: RfpSentProps): React.JSX.Element {
  return (
    <Layout
      preheader={`${rfpId} 견적 요청을 ${inviteCount}개 PG사에 보냈어요.`}
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
        견적 요청을 보냈어요
      </h1>
      <p style={{ margin: '0 0 16px', fontSize: '14px' }}>
        다음 견적 요청을 정상적으로 보냈어요.
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
            <td style={{ color: '#777', paddingRight: '16px' }}>보낸 건수</td>
            <td>
              <Mono>{inviteCount}</Mono> 건
            </td>
          </tr>
        </tbody>
      </table>

      <p style={{ fontSize: '13px', color: '#555' }}>
        PG사들의 견적이 도착하면 별도 알림으로 안내해 드려요.
      </p>
    </Layout>
  );
}

export async function renderRfpSent(props: RfpSentProps): Promise<string> {
  return render(<RfpSent {...props} />);
}
