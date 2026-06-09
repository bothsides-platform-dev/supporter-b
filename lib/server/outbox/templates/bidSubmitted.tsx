import * as React from 'react';
import { render } from '@react-email/render';
import { josa } from 'es-hangul';

import { Layout, Mono } from './_layout';
import type { BidSubmittedProps } from './types';

export function BidSubmitted({
  rfpId,
  rfpTitle,
  pgName,
  submittedAt,
}: BidSubmittedProps): React.JSX.Element {
  const pgParticle = josa(pgName, '이/가').slice(pgName.length);
  return (
    <Layout
      preheader={`${josa(pgName, '이/가')} ${rfpId} 견적 요청에 견적을 보냈어요.`}
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
        새 견적이 도착했어요
      </h1>
      <p style={{ margin: '0 0 16px', fontSize: '14px' }}>
        <strong>{pgName}</strong>{pgParticle} 견적을 보냈어요.
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
            <td style={{ color: '#777', paddingRight: '16px' }}>보낸 시각</td>
            <td>
              <Mono>{submittedAt}</Mono>
            </td>
          </tr>
        </tbody>
      </table>

      <p style={{ fontSize: '13px', color: '#555' }}>
        대시보드에서 비교표를 열어 볼 수 있어요.
      </p>
    </Layout>
  );
}

export async function renderBidSubmitted(
  props: BidSubmittedProps,
): Promise<string> {
  return render(<BidSubmitted {...props} />);
}
