import * as React from 'react';
import { render } from '@react-email/render';

import { Layout, Mono } from './_layout';
import type { RfpAwardedProps } from './types';

export function RfpAwarded({
  rfpId,
  rfpTitle,
  bidId,
  settlementCycle,
}: RfpAwardedProps): React.JSX.Element {
  return (
    <Layout
      preheader={`${rfpId} 견적이 최종 선정됐어요.`}
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
        선정 알림
      </h1>
      <p style={{ margin: '0 0 16px', fontSize: '14px' }}>
        보내신 견적이 최종 선정됐어요.
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
              견적 요청 번호
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
            <td style={{ color: '#777', paddingRight: '16px', paddingBottom: '6px' }}>
              견적 번호
            </td>
            <td style={{ paddingBottom: '6px' }}>
              <Mono>{bidId}</Mono>
            </td>
          </tr>
          <tr>
            <td style={{ color: '#777', paddingRight: '16px' }}>정산 주기</td>
            <td>
              <Mono>{settlementCycle}</Mono>
            </td>
          </tr>
        </tbody>
      </table>

      <p style={{ fontSize: '13px', color: '#555' }}>
        구매사 담당자가 곧 후속 절차로 연락드릴 거예요.
      </p>
    </Layout>
  );
}

export async function renderRfpAwarded(props: RfpAwardedProps): Promise<string> {
  return render(<RfpAwarded {...props} />);
}
