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
      preheader={`${rfpId} 제안이 ${inviteCount}개 PG사에 발송되었습니다.`}
      serial={`RFP / ${rfpId}`}
    >
      <h1
        style={{
          fontSize: '20px',
          fontWeight: 600,
          margin: '0 0 16px',
          letterSpacing: '-0.01em',
        }}
      >
        제안 발송 완료
      </h1>
      <p style={{ margin: '0 0 16px', fontSize: '14px' }}>
        다음 RFP가 정상적으로 발송되었습니다.
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
            <td style={{ color: '#777', paddingRight: '16px' }}>발송 건수</td>
            <td>
              <Mono>{inviteCount}</Mono> 건
            </td>
          </tr>
        </tbody>
      </table>

      <p style={{ fontSize: '13px', color: '#555' }}>
        PG사들의 응답이 도착하면 별도 알림으로 안내됩니다.
      </p>
    </Layout>
  );
}

export async function renderRfpSent(props: RfpSentProps): Promise<string> {
  return render(<RfpSent {...props} />);
}
