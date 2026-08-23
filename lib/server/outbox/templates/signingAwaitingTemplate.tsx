import * as React from 'react';
import { render } from '@react-email/render';

import { Button, Layout, Mono } from './_layout';
import type { SigningAwaitingTemplateProps } from './types';

/**
 * 선정 후 "계약서를 올려 보내 주세요" 메일 — 알림 사각지대를 덮는다.
 *
 * 이 구간의 앞뒤에는 외부 채널이 있다(선정 = `rfp.awarded` 메일, 발송 후 = 스노우싸인의
 * 서명 요청 메일). **가운데만 인앱 전용**이라 PG 가 앱에 안 들어오면 딜이 조용히 멈춘다.
 *
 * ⚠️ 봉인 경계 — 수수료·금액·경쟁 정보는 담지 않는다. 견적번호·제목·링크뿐이다.
 */
export function SigningAwaitingTemplate({
  rfpId,
  rfpTitle,
  dealRoomUrl,
  isNudge,
}: SigningAwaitingTemplateProps): React.JSX.Element {
  return (
    <Layout
      preheader={`${rfpId} 계약서를 올리고 전자서명을 시작해 주세요.`}
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
        계약서를 보내 주세요
      </h1>
      <p style={{ margin: '0 0 16px', fontSize: '14px' }}>
        {isNudge
          ? '선정된 견적의 계약서가 아직 발송되지 않았어요. 딜룸에서 계약서를 올려 보내 주세요.'
          : '보내신 견적이 선정됐어요. 딜룸에서 계약서를 올리고 전자서명을 시작해 주세요.'}
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
            <td style={{ color: '#777', paddingRight: '16px' }}>제목</td>
            <td>{rfpTitle}</td>
          </tr>
        </tbody>
      </table>

      <Button href={dealRoomUrl}>딜룸에서 계약서 보내기</Button>

      {isNudge ? (
        <p style={{ fontSize: '13px', color: '#555', margin: '24px 0 0' }}>
          이미 보내셨다면 딜룸의 &lsquo;보낸 계약서 찾기&rsquo;로 연결할 수 있어요.
        </p>
      ) : null}
    </Layout>
  );
}

export async function renderSigningAwaitingTemplate(
  props: SigningAwaitingTemplateProps,
): Promise<string> {
  return render(<SigningAwaitingTemplate {...props} />);
}
