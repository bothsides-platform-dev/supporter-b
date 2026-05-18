import * as React from 'react';
import { render } from '@react-email/render';

import { Layout, Mono } from './_layout';
import type { BidSubmittedProps } from './types';

export function BidSubmitted({
  rfpId,
  rfpTitle,
  pgName,
  submittedAt,
}: BidSubmittedProps): React.JSX.Element {
  return (
    <Layout
      preheader={`${pgName}이(가) ${rfpId} RFP에 제안을 제출했습니다.`}
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
        새 제안 도착
      </h1>
      <p style={{ margin: '0 0 16px', fontSize: '14px' }}>
        <strong>{pgName}</strong>이(가) 제안을 제출했습니다.
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
              RFP
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
            <td style={{ color: '#777', paddingRight: '16px' }}>제출 시각</td>
            <td>
              <Mono>{submittedAt}</Mono>
            </td>
          </tr>
        </tbody>
      </table>

      <p style={{ fontSize: '13px', color: '#555' }}>
        대시보드에서 비교표를 열어 보실 수 있습니다.
      </p>
    </Layout>
  );
}

export async function renderBidSubmitted(
  props: BidSubmittedProps,
): Promise<string> {
  return render(<BidSubmitted {...props} />);
}
