// SampleSendDisabledNotice — 샘플 RFP 상대방 채팅에서 전송 차단 안내(ThreadView·ChatPanel 공용).

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

import { SampleSendDisabledNotice } from '../SampleSendDisabledNotice';

afterEach(() => cleanup());

describe('SampleSendDisabledNotice', () => {
  it('샘플 전송 차단 안내 문구를 렌더한다', () => {
    render(<SampleSendDisabledNotice />);
    expect(
      screen.getByText('샘플에서는 메시지를 보낼 수 없어요. 실제 견적 요청을 보내보세요.'),
    ).toBeInTheDocument();
  });
});
